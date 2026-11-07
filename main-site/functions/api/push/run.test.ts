import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, sameSecret, workerUrl } from './run';

/**
 * The scheduler endpoint's two decisions that can be wrong without a database:
 * where the Worker is, and whether the caller is allowed to make it run.
 *
 * The interesting failures are both quiet. A `PUSH_WORKER_URL` with `http://` in
 * it would send the flush secret in the clear on the way to a Worker that is
 * perfectly reachable. A `PUSH_WORKER_URL` with a path in it would drop the path
 * and call `/run` on the root — a 404 that looks like a Worker outage, so the
 * fallback would run every minute forever while an operator wonders why the
 * words never arrive.
 */

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

  it('refuses a plaintext address, which would leak the secret in transit', () => {
    expect(workerUrl('http://bsdc-push.example.workers.dev')).toBeNull();
  });

  it('refuses an address with a credential inside it', () => {
    expect(workerUrl('https://user:pass@bsdc-push.example.workers.dev')).toBeNull();
  });

  it('refuses something that is not an address at all', () => {
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
