import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64UrlToBytes, bytesToBase64, bytesToBase64Url } from './crypto';
import { fcmCredentials, siteOrigin, type Env } from './env';
import {
  classifyFcmError,
  clearFcmTokenCache,
  getFcmAccessToken,
  resolveAndroidChannelId,
  sendFcmNotification,
} from './fcm';
import worker from './index';

async function rsaKeyPair(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer,
  );
  const b64 = bytesToBase64(pkcs8).replace(/(.{64})/g, '$1\n');
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`,
    publicKey: pair.publicKey,
  };
}

let testPem = '';
let testPublicKey: CryptoKey;

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
    PUSH_FLUSH_SECRET: 'a'.repeat(48),
    FB_PROJECT_ID: 'bsdc-bd',
    FB_CLIENT_EMAIL: 'push@bsdc-bd.iam.gserviceaccount.com',
    FB_PRIVATE_KEY: testPem,
    SITE_URL: 'https://www.bsdc.info.bd',
    ...overrides,
  };
}

beforeEach(async () => {
  clearFcmTokenCache();
  if (testPem === '') {
    const generated = await rsaKeyPair();
    testPem = generated.pem;
    testPublicKey = generated.publicKey;
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FCM configuration', () => {
  it('reads credentials from FIREBASE_SERVICE_ACCOUNT_BSDC_BD JSON or split FB_* fields', () => {
    const fromJson = fcmCredentials({
      ...baseEnv(),
      FB_PROJECT_ID: '',
      FIREBASE_SERVICE_ACCOUNT_BSDC_BD: JSON.stringify({
        project_id: 'bsdc-bd',
        client_email: 'svc@bsdc-bd.iam.gserviceaccount.com',
        private_key: testPem,
      }),
    });
    expect(fromJson).toMatchObject({
      projectId: 'bsdc-bd',
      clientEmail: 'svc@bsdc-bd.iam.gserviceaccount.com',
    });

    const fromSplit = fcmCredentials(baseEnv());
    expect(fromSplit).toMatchObject({
      projectId: 'bsdc-bd',
      clientEmail: 'push@bsdc-bd.iam.gserviceaccount.com',
    });

    expect(
      fcmCredentials({
        ...baseEnv(),
        FB_PROJECT_ID: '',
        FB_CLIENT_EMAIL: '',
        FB_PRIVATE_KEY: '',
      }),
    ).toBeNull();
  });

  it('normalises siteOrigin to https://www.bsdc.info.bd when unset or invalid', () => {
    expect(siteOrigin(undefined)).toBe('https://www.bsdc.info.bd');
    expect(siteOrigin('http://insecure.test')).toBe('https://www.bsdc.info.bd');
    expect(siteOrigin('https://www.bsdc.info.bd/')).toBe('https://www.bsdc.info.bd');
  });
});

describe('FCM HTTP v1 delivery', () => {
  it('signs a valid RS256 OAuth2 assertion and caches the exchanged access token', async () => {
    let exchangeCalls = 0;
    let capturedAssertion = '';
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      exchangeCalls += 1;
      const body = init?.body as URLSearchParams;
      capturedAssertion = body.get('assertion') ?? '';
      return new Response(JSON.stringify({ access_token: 'fcm-access-1' }), { status: 200 });
    }) as unknown as typeof fetch;

    const creds = fcmCredentials(baseEnv())!;
    const t1 = await getFcmAccessToken(creds, fetcher, 1_700_000_000_000);
    const t2 = await getFcmAccessToken(creds, fetcher, 1_700_000_060_000);
    expect(t1).toBe('fcm-access-1');
    expect(t2).toBe('fcm-access-1');
    expect(exchangeCalls).toBe(1);

    const [header, payload, signature] = capturedAssertion.split('.');
    const sigBytes = base64UrlToBytes(signature!);
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      testPublicKey,
      sigBytes,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(ok).toBe(true);
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload!))) as {
      scope?: string;
    };
    expect(decoded.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
  });

  it('classifies FCM HTTP v1 status and error bodies accurately', () => {
    expect(classifyFcmError(200, '{}')).toBe('sent');
    expect(classifyFcmError(404, '{"error":{"status":"NOT_FOUND"}}')).toBe('dead');
    expect(classifyFcmError(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(
      'dead',
    );
    expect(
      classifyFcmError(
        400,
        '{"error":{"status":"INVALID_ARGUMENT","message":"registration token"}}',
      ),
    ).toBe('invalid');
    expect(classifyFcmError(401, '')).toBe('unauthorized');
    expect(classifyFcmError(403, '')).toBe('unauthorized');
    expect(classifyFcmError(429, '')).toBe('retry');
    expect(classifyFcmError(503, '')).toBe('retry');
  });

  it('posts FCM v1 message payload with deep link and Android/WebPush metadata', async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ name: 'projects/bsdc-bd/messages/1' }), { status: 200 });
    }) as unknown as typeof fetch;

    const outcome = await sendFcmNotification({
      credentials: fcmCredentials(baseEnv())!,
      token: 'fcm-token-0123456789abcdefghijk',
      platform: 'android',
      words: {
        title: 'New message · BSDC',
        body: 'Hello world',
        url: '/messages/c1',
        tag: 'bsdc-message-c1',
        topic: 'c-c1',
      },
      siteUrl: 'https://www.bsdc.info.bd',
      urgency: 'high',
      accessToken: 'cached-token',
      fetcher,
    });

    expect(outcome).toBe('sent');
    expect(sent[0]?.url).toBe('https://fcm.googleapis.com/v1/projects/bsdc-bd/messages:send');
    const msg = sent[0]?.body['message'] as Record<string, unknown>;
    expect(msg['token']).toBe('fcm-token-0123456789abcdefghijk');
    expect((msg['webpush'] as { fcm_options?: { link?: string } }).fcm_options?.link).toBe(
      'https://www.bsdc.info.bd/messages/c1',
    );
    expect((msg['data'] as { path?: string; channel_id?: string }).path).toBe('/messages/c1');
    expect((msg['data'] as { channel_id?: string }).channel_id).toBe('bsdc_messenger');
    expect((msg['android'] as { notification?: { channel_id?: string } }).notification?.channel_id).toBe(
      'bsdc_messenger',
    );
    expect(resolveAndroidChannelId({ tag: 'bsdc-comment-p1', url: '/p/p1' })).toBe('bsdc_social');
    expect(resolveAndroidChannelId({ tag: 'bsdc-order-o1', url: '/orders/o1' })).toBe('bsdc_orders');
    expect(resolveAndroidChannelId({ tag: 'bsdc-certificate-c1', url: '/certificates' })).toBe(
      'bsdc_verify_alerts',
    );
    expect(resolveAndroidChannelId({ tag: 'bsdc-summary', url: '/notifications' })).toBe(
      'bsdc_general',
    );
  });

  it('delivers pending FCM devices end-to-end inside run /health even without VAPID keys', async () => {
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const fcmCalls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 });
        }
        if (url.includes('/rest/v1/rpc/')) {
          const name = url.split('/rest/v1/rpc/')[1] ?? '';
          const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          rpcCalls.push({ name, args });
          if (name === 'fcm_pending_devices') {
            return new Response(
              JSON.stringify([
                {
                  notification_id: '00000000-0000-0000-0000-000000000099',
                  uid: 'u1',
                  token: 'fcm-token-long-enough-1234567890',
                  platform: 'web',
                  language: 'en',
                  kind: 'message',
                  body: 'Hi there',
                  actor_name: 'Karim',
                  actor_avatar: '',
                  url: '/messages/c1',
                  post_id: null,
                  conversation_id: 'c1',
                  created_at: new Date().toISOString(),
                },
              ]),
              { status: 200 },
            );
          }
          if (name === 'fcm_mark_devices') return new Response(JSON.stringify(1), { status: 200 });
          return new Response('null', { status: 200 });
        }
        if (url.includes('fcm.googleapis.com/v1/')) {
          fcmCalls.push(url);
          return new Response(JSON.stringify({ name: 'msg-1' }), { status: 200 });
        }
        return new Response('', { status: 404 });
      }),
    );

    const health = await worker.fetch(new Request('https://push.test/health'), baseEnv());
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: 'ok',
      vapid: false,
      fcm: true,
    });

    const runRes = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      baseEnv(),
    );
    expect(runRes.status).toBe(200);
    await expect(runRes.json()).resolves.toMatchObject({ sent: 1, marked: 1 });
    expect(fcmCalls).toHaveLength(1);
    expect(rpcCalls.find((c) => c.name === 'fcm_mark_devices')?.args['p_ids']).toEqual([
      '00000000-0000-0000-0000-000000000099',
    ]);
  });
});

void bytesToBase64Url;
