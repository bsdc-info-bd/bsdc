import { describe, expect, it } from 'vitest';
import {
  deliveredHeaders,
  isFresh,
  isStorableImage,
  isUsableWhenStale,
  looksLikeImageBytes,
  MIN_IMAGE_BYTES,
  stampStored,
  STORED_AT_HEADER,
  storedAt,
  uncachedHeaders,
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

describe('the bytes decide, not the header', () => {
  const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

  it('recognises the signature of every format this platform stores', () => {
    expect(looksLikeImageBytes(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe(true); // JPEG
    expect(looksLikeImageBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true); // PNG
    expect(looksLikeImageBytes(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(true); // GIF89a
    expect(
      looksLikeImageBytes(
        bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe(true); // WebP
    expect(
      looksLikeImageBytes(
        bytes(0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66),
      ),
    ).toBe(true); // AVIF
    expect(
      looksLikeImageBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBe(true);
  });

  it('refuses an HTML error page wearing an image content type', () => {
    // This is the body a rate-limited host returns with 200 and
    // `content-type: image/jpeg`. The old worker stored it as the picture.
    expect(looksLikeImageBytes(new TextEncoder().encode('<!doctype html><html>too many'))).toBe(
      false,
    );
    expect(looksLikeImageBytes(new TextEncoder().encode('{"error":"rate limited"}'))).toBe(false);
    expect(looksLikeImageBytes(new TextEncoder().encode('Too Many Requests'))).toBe(false);
  });

  it('refuses an empty or truncated body rather than guessing', () => {
    expect(looksLikeImageBytes(new Uint8Array())).toBe(false);
    expect(looksLikeImageBytes(bytes(0x89, 0x50))).toBe(false);
  });
});

describe('an answer that is not the picture is never remembered', () => {
  it('strips every header that could make a cache keep a failure', () => {
    const failed = new Response('nope', {
      status: 429,
      headers: {
        'content-type': 'text/html',
        'cache-control': 'public, max-age=86400, immutable',
        expires: 'Thu, 01 Jan 2099 00:00:00 GMT',
        etag: '"abc"',
        'last-modified': 'Thu, 01 Jan 2026 00:00:00 GMT',
        age: '30',
      },
    });

    const headers = uncachedHeaders(failed);

    expect(headers.get('cache-control')).toContain('no-store');
    expect(headers.get('expires')).toBeNull();
    expect(headers.get('etag')).toBeNull();
    expect(headers.get('last-modified')).toBeNull();
    expect(headers.get('age')).toBeNull();
    // The reason it was refused is still readable to whoever reads the response.
    expect(headers.get('content-type')).toBe('text/html');
  });
});
