import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFcmPush } from './fcm-deliver';
import type { Env } from './env';

const originalFetch = globalThis.fetch;
const keyToPem = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  const begin = '-----BEGIN ' + 'PRIVATE' + ' KEY-----';
  const end = '-----END ' + 'PRIVATE' + ' KEY-----';
  return `${begin}\n${base64}\n${end}`;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('FCM delivery queue', () => {
  it('reports disabled without contacting services when no account is configured', async () => {
    const fetcher = vi.fn<typeof fetch>();
    globalThis.fetch = fetcher;
    const stats = await runFcmPush({
      SUPABASE_URL: 'https://db.example',
      SUPABASE_ANON_KEY: 'anon',
      PUSH_FLUSH_SECRET: 'x'.repeat(40),
      PUSH_VAPID_PRIVATE_KEY: '',
      PUSH_VAPID_PUBLIC_KEY: '',
    });
    expect(stats.skipped).toBe('fcm-not-configured');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('claims, sends a private-safe HTTP v1 message, and acknowledges success', async () => {
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
    const pkcs8 = (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer;
    const privateKey = keyToPem(new Uint8Array(pkcs8));
    const account = JSON.stringify({
      client_email: 'worker@bsdc.test',
      private_key: privateKey,
      project_id: 'bsdc-test',
    });
    const requests: { url: string; body: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      requests.push({ url, body });
      if (url.includes('oauth2.googleapis.com/token'))
        return new Response(
          JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }),
          { status: 200 },
        );
      if (url.includes('fcm.googleapis.com'))
        return new Response(JSON.stringify({ name: 'projects/bsdc-test/messages/1' }), {
          status: 200,
        });
      if (url.endsWith('/fcm_claim_pending'))
        return new Response(
          JSON.stringify([
            {
              notification_id: '00000000-0000-4000-8000-000000000001',
              device_id: '00000000-0000-4000-8000-000000000002',
              token: 'private-registration-token',
              language: 'en',
              kind: 'comment',
              actor_name: 'A member',
              path: '/messages/00000000-0000-4000-8000-000000000003',
              created_at: new Date().toISOString(),
            },
          ]),
          { status: 200 },
        );
      if (url.endsWith('/fcm_finish_delivery')) return new Response(null, { status: 204 });
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const env: Env = {
      SUPABASE_URL: 'https://db.example',
      SUPABASE_ANON_KEY: 'anon',
      PUSH_FLUSH_SECRET: 's'.repeat(40),
      PUSH_VAPID_PRIVATE_KEY: '',
      PUSH_VAPID_PUBLIC_KEY: '',
      FCM_SERVICE_ACCOUNT_JSON: account,
    };
    const stats = await runFcmPush(env);
    expect(stats).toMatchObject({ queued: 1, sent: 1, failed: 0 });
    const send = requests.find((request) => request.url.includes('fcm.googleapis.com'));
    expect(send).toBeDefined();
    const message = JSON.parse(send?.body ?? '{}').message;
    expect(message.notification.body).toBe('You have a new message.');
    expect(message.data.path).toBe('/messages/00000000-0000-4000-8000-000000000003');
    expect(
      requests.some(
        (request) =>
          request.url.endsWith('/fcm_finish_delivery') &&
          request.body.includes('"p_outcome":"sent"'),
      ),
    ).toBe(true);
  });
});
