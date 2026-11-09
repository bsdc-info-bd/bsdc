import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { handleManagedImage, type ImageStrategyConfig } from './image-strategy';
import { STORED_AT_HEADER, stampStored } from './cache-policy';

/**
 * The rules the picture cache actually follows.
 *
 * Every one of these was wrong in production, and none of them was testable
 * while the code lived in `sw.ts`. Together they were the report: pictures load,
 * then they stop, and clearing site data brings them back.
 */

const CACHE = 'bsdc-images-test';
const DAY = 24 * 60 * 60 * 1000;
const TRUST = 7 * DAY;
// Long enough to pass the stub threshold (`MIN_IMAGE_BYTES`) as well as the
// signature check: a 16-byte body is refused as an error page, correctly.
const PNG = new Uint8Array(64);
PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
PNG.set([0x49, 0x48, 0x44, 0x52], 12);
const HTML = new TextEncoder().encode('<!doctype html><html>rate limited</html>');

function picture(): Response {
  return new Response(PNG, {
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': String(PNG.byteLength) },
  });
}

function rateLimited(): Response {
  return new Response(HTML, {
    status: 429,
    headers: {
      'content-type': 'text/html',
      // The header that made one bad minute last a week: an ordinary browser
      // cache stores this, per URL, for a day.
      'cache-control': 'public, max-age=86400',
      expires: 'Thu, 01 Jan 2099 00:00:00 GMT',
      etag: '"rate-limited"',
    },
  });
}

/** A `no-cors` answer: nothing about it can be read. */
function opaque(): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, 'type', { value: 'opaque' });
  Object.defineProperty(response, 'ok', { value: false });
  Object.defineProperty(response, 'status', { value: 0 });
  return response;
}

interface FakeCache {
  store: Map<string, Response>;
  puts: number;
  deletes: string[];
}

function fakeCaches(initial: Record<string, Response> = {}): {
  caches: CacheStorage;
  cache: FakeCache;
  opened: string[];
} {
  const store = new Map<string, Response>(Object.entries(initial));
  const cache: FakeCache = { store, puts: 0, deletes: [] };
  const opened: string[] = [];
  const api = {
    match: (request: Request) => Promise.resolve(store.get(request.url)?.clone()),
    put: (request: Request, response: Response) => {
      cache.puts += 1;
      store.set(request.url, response.clone());
      return Promise.resolve();
    },
    delete: (request: Request) => {
      cache.deletes.push(request.url);
      return Promise.resolve(store.delete(request.url));
    },
    keys: () => Promise.resolve([...store.keys()].map((url) => new Request(url))),
  };
  const caches = {
    open: (name: string) => {
      opened.push(name);
      return Promise.resolve(api as unknown as Cache);
    },
  } as unknown as CacheStorage;
  return { caches, cache, opened };
}

/** A picture the worker stored earlier, with the stamp it would have written. */
function cachedPicture(storedAt = Date.now()): Response {
  const original = new Response(PNG, {
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': String(PNG.byteLength) },
  });
  return new Response(PNG, { status: 200, headers: stampStored(original, storedAt) });
}

function request(url: string): Request {
  return new Request(url, { headers: { accept: 'image/*' } });
}

function config(
  overrides: Partial<ImageStrategyConfig> & { caches: CacheStorage; fetch: typeof fetch },
): ImageStrategyConfig {
  return {
    cacheName: CACHE,
    trustMs: TRUST,
    networkTimeoutMs: 1_000,
    maxEntries: 400,
    ...overrides,
  };
}

describe('a fresh picture in the cache', () => {
  it('is served without touching the network at all', async () => {
    // The first version revalidated every hit in the background with
    // `cache: 'no-store'`, so every visit to the feed re-downloaded every image
    // on it while the visible pictures waited on the same connection.
    const { caches } = fakeCaches({ 'https://i.ibb.co/a.webp': cachedPicture() });
    const network = vi.fn();

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: network as unknown as typeof fetch }),
    );

    expect(network).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(PNG.byteLength);
  });

  it('does not leak the worker bookkeeping into the page', async () => {
    const { caches } = fakeCaches({ 'https://i.ibb.co/a.webp': cachedPicture() });
    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: vi.fn() as unknown as typeof fetch }),
    );
    expect(response.headers.get(STORED_AT_HEADER)).toBeNull();
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});

describe('asking the network', () => {
  it('asks for a readable answer first, because no-cors can only be opaque', async () => {
    // This is why the cache was never written for a single real ImgBB image.
    const { caches, cache } = fakeCaches();
    const network = vi.fn(() => Promise.resolve(picture()));

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: network as unknown as typeof fetch }),
    );

    expect(network).toHaveBeenCalledTimes(1);
    expect((network.mock.calls[0] as unknown as [string, RequestInit])[1].mode).toBe('cors');
    expect(cache.puts).toBe(1);
    expect(response.status).toBe(200);
  });

  it('falls back to the request the element would have made when CORS is refused', async () => {
    const { caches, cache } = fakeCaches();
    const network = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(opaque());

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: network as unknown as typeof fetch }),
    );

    const calls = network.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([, init]) => init.mode)).toEqual(['cors', 'no-cors']);
    // The picture still paints; it simply is not cached. A cache miss is never
    // worth a broken image.
    expect(response.type).toBe('opaque');
    expect(cache.puts).toBe(0);
  });

  it('stores a verified picture, stamped with when it was stored', async () => {
    const { caches, cache } = fakeCaches();
    await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(picture())) as unknown as typeof fetch }),
    );
    const stored = cache.store.get('https://i.ibb.co/a.webp');
    expect(stored?.headers.get(STORED_AT_HEADER)).not.toBeNull();
  });

  it('refuses to store an HTML page wearing an image content type', async () => {
    // The header said `image/png`; the bytes said "rate limited". The old worker
    // stored the second one as the picture and served it for a month.
    const { caches, cache } = fakeCaches();
    const impostor = new Response(HTML, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(HTML.byteLength) },
    });

    await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(impostor)) as unknown as typeof fetch }),
    );

    expect(cache.store.size).toBe(0);
  });

  it('never stores a rate limit, a server error or half a picture', async () => {
    for (const response of [
      rateLimited(),
      new Response('oops', { status: 503, headers: { 'content-type': 'text/html' } }),
      new Response(PNG, { status: 206, headers: { 'content-type': 'image/png' } }),
      // A 200 with a body too small to be a picture.
      new Response('x', { status: 200, headers: { 'content-type': 'image/png' } }),
    ]) {
      const { caches, cache } = fakeCaches();
      await handleManagedImage(
        request('https://i.ibb.co/a.webp'),
        config({ caches, fetch: (() => Promise.resolve(response)) as unknown as typeof fetch }),
      );
      expect(cache.store.size).toBe(0);
    }
  });
});

describe('an answer the worker will not store', () => {
  it('is delivered without the headers that let a browser remember it', async () => {
    // A 429 is an ordinary cacheable response. Left alone, the browser's HTTP
    // cache keeps it per URL for as long as it says — and the picture stays
    // broken after the host has recovered. Clearing the cache was the "fix".
    const { caches } = fakeCaches();
    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(rateLimited())) as unknown as typeof fetch }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('expires')).toBeNull();
    expect(response.headers.get('etag')).toBeNull();
  });

  it('passes an opaque answer through untouched, because nothing can be read', async () => {
    const { caches } = fakeCaches();
    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(opaque())) as unknown as typeof fetch }),
    );
    expect(response.type).toBe('opaque');
  });

  it('answers 504 with no-store when nothing arrives at all', async () => {
    const { caches } = fakeCaches();
    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({
        caches,
        fetch: (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch,
      }),
    );
    expect(response.status).toBe(504);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('an entry that has aged', () => {
  it('is served while the host is unreachable but the entry is still usable', async () => {
    const { caches, cache } = fakeCaches({
      'https://i.ibb.co/a.webp': cachedPicture(Date.now() - 8 * DAY),
    });

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({
        caches,
        fetch: (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch,
      }),
    );

    expect(response.status).toBe(200);
    expect(cache.deletes).toEqual([]);
  });

  it('is replaced when the network confirms it', async () => {
    const { caches, cache } = fakeCaches({
      'https://i.ibb.co/a.webp': cachedPicture(Date.now() - 8 * DAY),
    });

    await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(picture())) as unknown as typeof fetch }),
    );

    expect(cache.puts).toBe(1);
  });

  it('is deleted once it is past twice the trust window and unconfirmable', async () => {
    // A picture that has not been confirmable for a fortnight is a picture that
    // is gone. Holding it would mean holding it forever.
    const { caches, cache } = fakeCaches({
      'https://i.ibb.co/a.webp': cachedPicture(Date.now() - 30 * DAY),
    });

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({
        caches,
        fetch: (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch,
      }),
    );

    expect(response.status).toBe(504);
    expect(cache.deletes).toEqual(['https://i.ibb.co/a.webp']);
  });
});

describe('when storage is not available', () => {
  it('still serves the picture from the network', async () => {
    const caches = {
      open: () => Promise.reject(new Error('SecurityError')),
    } as unknown as CacheStorage;

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(picture())) as unknown as typeof fetch }),
    );

    expect(response.status).toBe(200);
  });

  it('still refuses to let a failure be remembered', async () => {
    const caches = {
      open: () => Promise.reject(new Error('SecurityError')),
    } as unknown as CacheStorage;

    const response = await handleManagedImage(
      request('https://i.ibb.co/a.webp'),
      config({ caches, fetch: (() => Promise.resolve(rateLimited())) as unknown as typeof fetch }),
    );

    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

describe('the entry ceiling', () => {
  it('drops the oldest entries rather than growing without bound', async () => {
    const { caches, cache } = fakeCaches({
      'https://i.ibb.co/1.webp': cachedPicture(),
      'https://i.ibb.co/2.webp': cachedPicture(),
    });

    await handleManagedImage(
      request('https://i.ibb.co/3.webp'),
      config({
        caches,
        maxEntries: 2,
        fetch: (() => Promise.resolve(picture())) as unknown as typeof fetch,
      }),
    );

    expect(cache.store.size).toBe(2);
    expect(cache.deletes).toEqual(['https://i.ibb.co/1.webp']);
  });
});

describe('the worker delegates, it does not re-implement', () => {
  // The rules above are only true of production if `sw.ts` calls them. It used
  // to hold its own copy, which is how a cache that was never written, a
  // revalidation nobody asked for and a cacheable failure all shipped.
  // Read lazily, from the package root vitest runs in.
  const readWorker = (): string => readFileSync('src/sw.ts', 'utf8');

  it('imports the strategy instead of holding its own', () => {
    const worker = readWorker();
    expect(worker).toContain('handleManagedImage');
    expect(worker).not.toContain('function putVerified');
    expect(worker).not.toContain('async function networkWithDeadline');
  });

  it('still owns the decision about which requests it is responsible for', () => {
    const worker = readWorker();
    expect(worker).toContain('function isManagedImage');
    expect(worker).toContain('isAllowedMediaHost');
  });
});
