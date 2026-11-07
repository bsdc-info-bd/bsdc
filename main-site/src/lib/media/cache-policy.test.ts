import { describe, expect, it } from 'vitest';
import {
  deliveredHeaders,
  isFresh,
  isStorableImage,
  isUsableWhenStale,
  MIN_IMAGE_BYTES,
  stampStored,
  STORED_AT_HEADER,
  storedAt,
} from './cache-policy';

/**
 * These are the checks that were missing from the worker that shipped the bug.
 * Each one is a response the old worker stored as a picture and the new one
 * refuses.
 */

function response(
  body: string,
  init: { status?: number; type?: ResponseType; contentType?: string; length?: number } = {},
): Response {
  const headers = new Headers();
  headers.set('content-type', init.contentType ?? 'image/jpeg');
  if (init.length !== undefined) headers.set('content-length', String(init.length));
  const status = init.status ?? 200;
  // The Response constructor refuses a body on 204 and 304; those shapes are
  // built without one, which is exactly how the worker sees them.
  return new Response(status === 204 || status === 304 ? null : body, { status, headers });
}

describe('what may be stored as a picture', () => {
  it('stores a real picture', () => {
    expect(isStorableImage(response('x'.repeat(1024)))).toBe(true);
  });

  it('refuses an HTML error page served under an image URL', () => {
    expect(
      isStorableImage(response('<html>rate limited</html>', { contentType: 'text/html' })),
    ).toBe(false);
  });

  it('refuses a JSON error object', () => {
    expect(
      isStorableImage(response('{"error":"quota"}', { contentType: 'application/json' })),
    ).toBe(false);
  });

  it('refuses a status that is not 200', () => {
    for (const status of [204, 206, 301, 304, 400, 403, 404, 410, 429, 500, 503]) {
      expect(isStorableImage(response('x'.repeat(1024), { status }))).toBe(false);
    }
  });

  it('refuses an opaque response, which cannot be inspected at all', () => {
    const opaque = { type: 'opaque', ok: false, status: 0, headers: new Headers() } as Response;
    expect(isStorableImage(opaque)).toBe(false);
  });

  it('refuses a stub body shorter than a header', () => {
    expect(isStorableImage(response('x', { length: 1 }))).toBe(false);
    expect(
      isStorableImage(response('x'.repeat(MIN_IMAGE_BYTES - 1), { length: MIN_IMAGE_BYTES - 1 })),
    ).toBe(false);
    expect(
      isStorableImage(response('x'.repeat(MIN_IMAGE_BYTES), { length: MIN_IMAGE_BYTES })),
    ).toBe(true);
  });

  it('accepts every picture type the platform serves', () => {
    for (const type of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/svg+xml',
    ]) {
      expect(isStorableImage(response('x'.repeat(256), { contentType: type }))).toBe(true);
    }
  });
});

describe('how long a stored picture is trusted', () => {
  const trust = 1_000;
  const body = new Response('x'.repeat(64), { headers: { 'content-type': 'image/jpeg' } });
  const stamped = (at: number) =>
    new Response(body.body, { status: 200, headers: stampStored(body, at) });

  it('records and reads back the time it was stored', () => {
    const stored = stamped(1_000);
    expect(storedAt(stored)).toBe(1_000);
  });

  it('treats an entry with no timestamp as stale, which is how the old worker is healed', () => {
    const legacy = new Response('x'.repeat(64), { headers: { 'content-type': 'image/jpeg' } });
    expect(storedAt(legacy)).toBeNull();
    expect(isFresh(legacy, trust, 1_000)).toBe(false);
    expect(isUsableWhenStale(legacy, trust, 1_000)).toBe(false);
  });

  it('trusts an entry inside the window and asks the network after it', () => {
    const stored = stamped(1_000);
    expect(isFresh(stored, trust, 1_500)).toBe(true);
    expect(isFresh(stored, trust, 2_500)).toBe(false);
  });

  it('serves a stale entry while the host is unreachable, but not forever', () => {
    const stored = stamped(1_000);
    expect(isUsableWhenStale(stored, trust, 2_500)).toBe(true);
    expect(isUsableWhenStale(stored, trust, 3_500)).toBe(false);
  });

  it('never lets the bookkeeping header reach the page', () => {
    const headers = deliveredHeaders(stamped(1_000));
    expect(headers.get(STORED_AT_HEADER)).toBeNull();
    expect(headers.get('content-type')).toContain('image/');
  });
});
