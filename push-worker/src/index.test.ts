import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { deliveryKeys, runLimit, sameSecret, toSource } from './index';
import type { Env } from './env';
import { bytesToBase64Url } from './crypto';
import type { DeviceRow } from './api';

/**
 * The engine, exercised end to end with a stub database and a stub push service.
 * Nothing here reaches a network, and every assertion is about a decision the
 * worker makes: who is woken, with what words, and what is marked afterwards.
 */

async function vapidPair(): Promise<{ privateKey: string; publicKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  return {
    privateKey: bytesToBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer),
    ),
    publicKey: bytesToBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    ),
  };
}

async function subscriptionKeys(): Promise<{ p256dh: string; auth: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    p256dh: bytesToBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    ),
    auth: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

async function env(overrides: Partial<Env> = {}): Promise<Env> {
  const keys = await vapidPair();
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
    PUSH_FLUSH_SECRET: 'a'.repeat(48),
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_SUBJECT: 'mailto:admin@bsdc.info.bd',
    ...overrides,
  };
}

function row(overrides: Partial<DeviceRow> = {}): DeviceRow {
  return {
    notification_id: '00000000-0000-0000-0000-000000000001',
    uid: 'uid-1',
    endpoint: 'https://fcm.googleapis.com/wp/endpoint-1',
    p256dh: '',
    auth: '',
    language: 'en',
    kind: 'comment',
    body: 'Great post about distributed systems',
    actor_name: 'Rafiq',
    actor_avatar: '',
    url: '/p/hello',
    post_id: null,
    conversation_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface Harness {
  sends: { endpoint: string; init: RequestInit }[];
  rpc: { name: string; args: Record<string, unknown> }[];
}

/**
 * Stubs `fetch` for both halves of the worker: the PostgREST calls and the push
 * services. A push service endpoint and a database endpoint are told apart by
 * host, which is exactly how the worker itself does not tell them apart — it
 * just POSTs to whatever the database named.
 */
function stub(rows: DeviceRow[] | null, pushStatus = 201): Harness {
  const harness: Harness = { sends: [], rpc: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/rest/v1/rpc/')) {
        const name = url.split('/rest/v1/rpc/')[1] ?? '';
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        } catch {
          args = {};
        }
        harness.rpc.push({ name, args });
        if (name === 'push_pending_devices')
          return new Response(JSON.stringify(rows ?? []), { status: 200 });
        if (name === 'push_mark_devices') return new Response(JSON.stringify(2), { status: 200 });
        return new Response('null', { status: 200 });
      }
      harness.sends.push({ endpoint: url, init: init ?? {} });
      return new Response('', { status: pushStatus });
    }),
  );
  return harness;
}

afterEach(() => vi.unstubAllGlobals());

describe('the push engine', () => {
  it('does nothing at all when nothing is waiting', async () => {
    const harness = stub([]);
    const stats = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env(),
    );
    expect(stats.status).toBe(200);
    const body = (await stats.json()) as { waiting: number; sent: number };
    expect(body.waiting).toBe(0);
    expect(body.sent).toBe(0);
    expect(harness.sends).toHaveLength(0);
    expect(harness.rpc.map((call) => call.name)).toEqual(['push_pending_devices']);
  });

  it('wakes one device once for one notification, with the words encrypted in', async () => {
    const keys = await subscriptionKeys();
    const harness = stub([row({ ...keys })]);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env(),
    );
    const stats = (await response.json()) as { sent: number; marked: number; devices: number };
    expect(stats.sent).toBe(1);
    expect(stats.devices).toBe(1);
    expect(stats.marked).toBe(2);

    expect(harness.sends).toHaveLength(1);
    const send = harness.sends[0];
    expect(send?.endpoint).toBe('https://fcm.googleapis.com/wp/endpoint-1');
    const headers = new Headers(send?.init.headers);
    expect(headers.get('content-encoding')).toBe('aes128gcm');
    expect(headers.get('authorization')).toMatch(/^vapid t=/);
    expect((send?.init.body as Uint8Array).byteLength).toBeGreaterThan(64);

    // The secret travels in a body, and marking names the notification.
    const pending = harness.rpc.find((call) => call.name === 'push_pending_devices');
    expect(pending?.args['p_secret']).toBe('a'.repeat(48));
    const mark = harness.rpc.find((call) => call.name === 'push_mark_devices');
    expect(mark?.args['p_ids']).toEqual(['00000000-0000-0000-0000-000000000001']);
  });

  it('sends one notification for nine things that happened in one thread', async () => {
    const keys = await subscriptionKeys();
    const rows = Array.from({ length: 9 }, (_, index) =>
      row({
        ...keys,
        notification_id: `00000000-0000-0000-0000-00000000000${index}`,
        actor_name: index === 0 ? 'Rafiq' : `Member ${index}`,
        body: `message ${index}`,
      }),
    );
    const harness = stub(rows);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env(),
    );
    expect(((await response.json()) as { sent: number }).sent).toBe(1);
    expect(harness.sends).toHaveLength(1);
    const mark = harness.rpc.find((call) => call.name === 'push_mark_devices');
    expect((mark?.args['p_ids'] as string[]).length).toBe(9);
  });

  it('retires a subscription the push service says is gone, and marks nothing', async () => {
    const keys = await subscriptionKeys();
    const harness = stub([row({ ...keys })], 410);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env(),
    );
    const stats = (await response.json()) as { dead: number; marked: number };
    expect(stats.dead).toBe(1);
    expect(stats.marked).toBe(0);
    const kill = harness.rpc.find((call) => call.name === 'push_kill_device');
    expect(kill?.args['p_endpoint']).toBe('https://fcm.googleapis.com/wp/endpoint-1');
    expect(harness.rpc.some((call) => call.name === 'push_mark_devices')).toBe(false);
  });

  it('leaves the notification waiting when a push service has a bad minute', async () => {
    const keys = await subscriptionKeys();
    const harness = stub([row({ ...keys })], 503);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env(),
    );
    const stats = (await response.json()) as { retry: number; marked: number };
    expect(stats.retry).toBe(1);
    expect(stats.marked).toBe(0);
    expect(harness.rpc.some((call) => call.name === 'push_mark_devices')).toBe(false);
  });

  it('uses per-device marking when one device succeeds and a sibling fails transiently', async () => {
    const keysA = await subscriptionKeys();
    const keysB = await subscriptionKeys();
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const pendingRows = [
      row({ ...keysA, endpoint: 'https://fcm.googleapis.com/wp/device-ok-123456' }),
      row({ ...keysB, endpoint: 'https://fcm.googleapis.com/wp/device-503-123456' }),
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/rest/v1/rpc/')) {
          const name = url.split('/rest/v1/rpc/')[1] ?? '';
          const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          rpcCalls.push({ name, args });
          if (name === 'push_pending_devices') {
            return new Response(JSON.stringify(pendingRows), { status: 200 });
          }
          if (name === 'push_mark_device_deliveries') {
            return new Response('1', { status: 200 });
          }
          return new Response('null', { status: 200 });
        }
        return new Response('', { status: url.includes('device-ok') ? 201 : 503 });
      }),
    );

    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env(),
    );
    const stats = (await response.json()) as { sent: number; retry: number; marked: number };
    expect(stats.sent).toBe(1);
    expect(stats.retry).toBe(1);
    expect(stats.marked).toBe(1);
    expect(rpcCalls.some((c) => c.name === 'push_mark_devices')).toBe(false);
    const pairCall = rpcCalls.find((c) => c.name === 'push_mark_device_deliveries');
    expect(pairCall?.args['p_pairs']).toEqual([
      {
        id: '00000000-0000-0000-0000-000000000001',
        endpoint: 'https://fcm.googleapis.com/wp/device-ok-123456',
      },
    ]);
  });

  it('reports a broken signing key once rather than per device', async () => {
    const keys = await subscriptionKeys();
    stub([row({ ...keys })], 201);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env({ PUSH_VAPID_PRIVATE_KEY: 'not-a-key' }),
    );
    // An unimportable key cannot sign a token, so every send is unauthorised.
    const stats = (await response.json()) as { unauthorized?: number };
    expect(stats.unauthorized).toBe(1);
  });

  it('refuses to run at all when the deployment is not configured', async () => {
    stub([]);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'a'.repeat(48)}` },
      }),
      await env({ PUSH_FLUSH_SECRET: 'short' }),
    );
    expect(response.status).toBe(503);
  });

  it('refuses a caller with the wrong secret, before touching the database', async () => {
    const harness = stub([]);
    const response = await worker.fetch(
      new Request('https://push.test/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${'b'.repeat(48)}` },
      }),
      await env(),
    );
    expect(response.status).toBe(403);
    expect(harness.rpc).toHaveLength(0);
  });

  it('reports health without disclosing a single value', async () => {
    const response = await worker.fetch(new Request('https://push.test/health'), await env());
    const text = await response.text();
    expect(response.status).toBe(200);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(text).not.toContain('a'.repeat(48));
    expect(text).not.toContain('PUSH_VAPID');
  });

  it('reports health as unconfigured rather than throwing when bindings are absent', async () => {
    const response = await worker.fetch(
      new Request('https://push.test/health'),
      {} as Parameters<typeof worker.fetch>[1],
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      worker: 'bsdc-push',
      status: 'unconfigured',
      vapid: false,
      fcm: false,
      secret: false,
      database: false,
    });
  });
});

describe('the cron', () => {
  it('runs the same engine and never throws into the platform', async () => {
    stub(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    const waitUntil = vi.fn();
    // A failure must be logged and contained: a throwing cron is retried by the
    // platform with the same result, which is a run loop.
    await expect(
      worker.scheduled(
        {
          cron: '* * * * *',
          type: 'scheduled',
          scheduledTime: Date.now(),
          noRetry: () => undefined,
        } as unknown as ScheduledController,
        await env(),
        { waitUntil, passThroughOnException: () => undefined } as unknown as ExecutionContext,
      ),
    ).resolves.toBeUndefined();
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});

describe('the small decisions', () => {
  it('compares secrets without leaking their length', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
  });

  it('bounds how much one run may pick up', () => {
    expect(runLimit(undefined)).toBe(200);
    expect(runLimit(-5)).toBe(1);
    expect(runLimit(1_000_000)).toBe(400);
    expect(runLimit('25')).toBe(25);
  });

  it('reports unconfigured keys rather than pretending to sign', async () => {
    const base = await env();
    expect(deliveryKeys({ ...base, PUSH_VAPID_PRIVATE_KEY: '' })).toBeNull();
    expect(deliveryKeys(base)?.subject).toBe('mailto:admin@bsdc.info.bd');
  });

  it('folds a database row into the words a device reads', () => {
    const source = toSource(row({ kind: 'message', body: 'আপনি কি আজ আসছেন?' }), 'bn');
    expect(source.language).toBe('bn');
    expect(source.kind).toBe('message');
    expect(source.actorName).toBe('Rafiq');
  });
});
