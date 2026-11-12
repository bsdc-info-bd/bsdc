import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

import { onRequestGet as onConfigGet } from './config';
import { executePushRun, json, sameSecret, workerUrl } from './run';
import { onRequestPost as onWakePost } from './wake';

describe('where the push worker is', () => {
  it('is nothing when the deployment has not set one', () => {
    expect(workerUrl(undefined)).toBeNull();
    expect(workerUrl('')).toBeNull();
    expect(workerUrl('   ')).toBeNull();
  });

  it('is the origin, with any path kept and any trailing slash dropped', () => {
    expect(workerUrl('https://bsdc-push.example.workers.dev')).toBe(
      'https://bsdc-push.example.workers.dev',
    );
    expect(workerUrl('https://bsdc-push.example.workers.dev/')).toBe(
      'https://bsdc-push.example.workers.dev',
    );
    expect(workerUrl('https://example.com/push/')).toBe('https://example.com/push');
  });

  it('refuses a plaintext address, credentials, or invalid urls', () => {
    expect(workerUrl('http://bsdc-push.example.workers.dev')).toBeNull();
    expect(workerUrl('https://user:pass@bsdc-push.example.workers.dev')).toBeNull();
    expect(workerUrl('bsdc-push.example.workers.dev')).toBeNull();
    expect(workerUrl('not a url')).toBeNull();
    expect(workerUrl('ftp://example.com')).toBeNull();
  });
});

describe('the flush secret', () => {
  it('matches only when both halves are the same length and the same bytes', () => {
    const secret = 'a'.repeat(48);
    expect(sameSecret(secret, secret)).toBe(true);
    expect(sameSecret(`${'a'.repeat(47)}b`, secret)).toBe(false);
    expect(sameSecret('a'.repeat(47), secret)).toBe(false);
    expect(sameSecret(`${secret}extra`, secret)).toBe(false);
  });

  it('never matches an absent secret, even when the caller presents nothing', () => {
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret('anything', '')).toBe(false);
  });
});

describe('the answers this function gives', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is JSON, uncached, and not sniffable as something else', async () => {
    const response = json({ ok: true }, 200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('carries the status it was given, so a 503 stays a 503', () => {
    expect(json({ error: 'not configured' }, 503).status).toBe(503);
    expect(json({ error: 'forbidden' }, 403).status).toBe(403);
    expect(json({ waiting: 0 }).status).toBe(200);
  });
});

describe('GET /api/push/config', () => {
  it('exposes the public VAPID key from runtime secret or Vite env', async () => {
    const res = await onConfigGet({
      request: new Request('https://www.bsdc.info.bd/api/push/config'),
      env: { PUSH_VAPID_PUBLIC_KEY: 'BPublicKeyExample123' },
    } as Parameters<typeof onConfigGet>[0]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      enabled: true,
      vapidPublicKey: 'BPublicKeyExample123',
    });
  });

  it('returns enabled=false when unconfigured', async () => {
    const res = await onConfigGet({
      request: new Request('https://www.bsdc.info.bd/api/push/config'),
      env: {},
    } as Parameters<typeof onConfigGet>[0]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: false, vapidPublicKey: null });
  });
});

describe('POST /api/push/wake and FCM fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await onWakePost({
      request: new Request('https://www.bsdc.info.bd/api/push/wake', { method: 'POST' }),
      env: { PUSH_FLUSH_SECRET: 's'.repeat(48) },
    } as Parameters<typeof onWakePost>[0]);
    expect(res.status).toBe(401);
  });

  it('dispatches pure data-only HIGH priority Android FCM messages in local fallback', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const sentBodies: Record<string, unknown>[] = [];
    const rpcCalls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 });
        }
        if (url.includes('/rest/v1/rpc/')) {
          const fn = url.split('/rest/v1/rpc/')[1] ?? '';
          rpcCalls.push(fn);
          if (fn === 'fcm_pending_devices') {
            return new Response(
              JSON.stringify([
                {
                  notification_id: 'n-android-1',
                  uid: 'u1',
                  token: 'android-fcm-token-long-enough-123456',
                  platform: 'android',
                  language: 'en',
                  kind: 'message',
                  body: 'Meet at 5pm?',
                  actor_name: 'Nadia',
                  actor_avatar: '',
                  url: '/messages/c-99',
                  post_id: null,
                  conversation_id: 'c-99',
                  created_at: new Date().toISOString(),
                },
              ]),
              { status: 200 },
            );
          }
          if (fn === 'fcm_mark_devices') return new Response('1', { status: 200 });
          return new Response('null', { status: 200 });
        }
        if (url.includes('fcm.googleapis.com/v1/')) {
          sentBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
          return new Response(JSON.stringify({ name: 'msg-ok' }), { status: 200 });
        }
        return new Response('', { status: 404 });
      }),
    );

    const outcome = await executePushRun(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_key',
        PUSH_FLUSH_SECRET: 's'.repeat(48),
        FB_PROJECT_ID: 'bsdc-bd',
        FB_CLIENT_EMAIL: 'fcm@bsdc-bd.iam.gserviceaccount.com',
        FB_PRIVATE_KEY: pem,
      },
      { limit: 50 },
    );

    expect(outcome.path).toBe('local');
    expect(outcome.status).toBe(200);
    expect(outcome.body['sent']).toBe(1);
    expect(outcome.body['marked']).toBe(1);
    expect(rpcCalls).toContain('fcm_mark_devices');

    const msg = sentBodies[0]?.['message'] as Record<string, unknown>;
    expect(msg['notification']).toBeUndefined();
    expect((msg['android'] as { priority?: string; notification?: unknown }).priority).toBe('HIGH');
    expect((msg['android'] as { notification?: unknown }).notification).toBeUndefined();
    expect((msg['data'] as { kind?: string; channel_id?: string; conversation_id?: string }).kind).toBe(
      'message',
    );
    expect((msg['data'] as { channel_id?: string }).channel_id).toBe('bsdc_messenger');
    expect((msg['data'] as { conversation_id?: string }).conversation_id).toBe('c-99');
  });
});
