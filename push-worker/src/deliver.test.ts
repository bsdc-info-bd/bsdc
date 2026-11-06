import { describe, expect, it, vi } from 'vitest';
import {
  classifyStatus,
  deliver,
  isTerminal,
  shouldRetry,
  type DeliveryKeys,
  type DeliveryRequest,
} from './deliver';
import { bytesToBase64Url } from './crypto';

async function keys(): Promise<DeliveryKeys & { pkcs8: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer,
  );
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return {
    privateKey: bytesToBase64Url(pkcs8),
    publicKey: bytesToBase64Url(raw),
    subject: 'mailto:admin@bsdc.info.bd',
    pkcs8,
  };
}

async function subscription(): Promise<{ p256dh: string; auth: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return {
    p256dh: bytesToBase64Url(raw),
    auth: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

const ENDPOINT = 'https://fcm.googleapis.com/wp/abc123';

async function send(
  overrides: Partial<DeliveryRequest> = {},
  status = 201,
): Promise<{ outcome: string; request: Request | null; init: RequestInit | null }> {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response('', { status });
  });
  const target = { endpoint: ENDPOINT, ...(await subscription()) };
  const outcome = await deliver({
    target,
    keys: await keys(),
    fetcher: fetcher as unknown as typeof fetch,
    ...overrides,
  });
  const call = fetcher.mock.calls[0];
  return {
    outcome,
    request: call ? new Request(call[0] as RequestInfo, call[1]) : null,
    init: call?.[1] ?? null,
  };
}

describe('what a push service answer means', () => {
  it('reads success from every shape a service uses', () => {
    for (const status of [200, 201, 202, 204]) expect(classifyStatus(status)).toBe('sent');
  });

  it('retires a subscription the service says is gone', () => {
    expect(classifyStatus(404)).toBe('dead');
    expect(classifyStatus(410)).toBe('dead');
    expect(isTerminal('dead')).toBe(true);
  });

  it('distinguishes a broken deployment from a broken device', () => {
    expect(classifyStatus(401)).toBe('unauthorized');
    expect(classifyStatus(403)).toBe('unauthorized');
    expect(isTerminal('unauthorized')).toBe(false);
    expect(shouldRetry('unauthorized')).toBe(false);
  });

  it('retries a rate limit or an outage, and never marks it sent', () => {
    expect(classifyStatus(429)).toBe('retry');
    expect(classifyStatus(503)).toBe('retry');
    expect(shouldRetry('retry')).toBe(true);
    expect(shouldRetry('sent')).toBe(false);
  });

  it('reports an oversized payload rather than pretending it was sent', () => {
    expect(classifyStatus(413)).toBe('too-large');
    expect(isTerminal('too-large')).toBe(false);
  });
});

describe('the request the worker makes', () => {
  it('wakes a device with no body when there are no words', async () => {
    const { outcome, init } = await send();
    expect(outcome).toBe('sent');
    expect(init?.body).toBe('');
    const headers = new Headers(init?.headers);
    expect(headers.get('content-encoding')).toBeNull();
    expect(headers.get('authorization')).toMatch(/^vapid t=.+, k=.+$/);
    expect(headers.get('ttl')).toBe('86400');
    expect(headers.get('urgency')).toBe('normal');
  });

  it('encrypts a payload and declares the encoding', async () => {
    const { outcome, init } = await send({
      payload: {
        title: 'New message',
        body: 'রফিক আপনাকে একটি বার্তা পাঠিয়েছেন',
        url: '/messages',
      },
    });
    expect(outcome).toBe('sent');
    const headers = new Headers(init?.headers);
    expect(headers.get('content-encoding')).toBe('aes128gcm');
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect((init?.body as Uint8Array).byteLength).toBeGreaterThan(100);
  });

  it('refuses to encrypt for a subscription with no keys, instead of sending cleartext', async () => {
    const fetcher = vi.fn();
    const outcome = await deliver({
      target: { endpoint: ENDPOINT, p256dh: '', auth: '' },
      keys: await keys(),
      payload: { title: 'x' },
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(outcome).toBe('invalid');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('trims a payload that would be refused for its size', async () => {
    const { init, outcome } = await send({
      payload: { title: 'A title', body: 'x'.repeat(20_000) },
    });
    expect(outcome).toBe('sent');
    // The body is the encrypted form, so its size is the assertion: an
    // oversized plaintext would have produced a much larger ciphertext.
    expect((init?.body as Uint8Array).byteLength).toBeLessThan(4_500);
  });

  it('sends a topic only when it is a legal one', async () => {
    const withTopic = await send({ topic: 'conversation/abc:def' });
    expect(new Headers(withTopic.init?.headers).get('topic')).toBe('conversationabcdef');
    const without = await send({ topic: '///' });
    expect(new Headers(without.init?.headers).get('topic')).toBeNull();
  });

  it('honours an urgency the caller chose', async () => {
    const { init } = await send({ urgency: 'high' });
    expect(new Headers(init?.headers).get('urgency')).toBe('high');
  });

  it('refuses a non-https endpoint before any network call', async () => {
    const fetcher = vi.fn();
    const outcome = await deliver({
      target: { endpoint: 'http://insecure.test/push', p256dh: '', auth: '' },
      keys: await keys(),
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(outcome).toBe('invalid');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats a network failure as retryable and not as a dead device', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('connect timeout');
    });
    const outcome = await deliver({
      target: { endpoint: ENDPOINT, p256dh: '', auth: '' },
      keys: await keys(),
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(outcome).toBe('failed');
    expect(shouldRetry(outcome)).toBe(true);
    expect(isTerminal(outcome)).toBe(false);
  });

  it('reports an unreadable signing key once instead of failing silently per device', async () => {
    const outcome = await deliver({
      target: { endpoint: ENDPOINT, p256dh: '', auth: '' },
      keys: { privateKey: 'not-a-key', publicKey: 'nope', subject: 'mailto:x@y.z' },
      fetcher: vi.fn() as unknown as typeof fetch,
    });
    expect(outcome).toBe('unauthorized');
  });
});
