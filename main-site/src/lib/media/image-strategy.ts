/**
 * The picture strategy: what the service worker does with an image request.
 *
 * ## Why this is a module and not a few functions inside `sw.ts`
 *
 * It *was* inside `sw.ts`, and every rule in it was wrong in a way that no unit
 * test could see, because `sw.ts` imports Workbox, speaks to `self`, and cannot
 * be imported by a test at all. The result was a worker whose picture cache was
 * never written once for a real image, whose fresh hits re-downloaded everything
 * on the page, and whose failures were handed to the browser with cache headers
 * that let it remember them for a week. Each of those is a decision, and each is
 * now a decision a test can make on a fake cache and a fake network.
 *
 * Nothing here touches `self` or imports Workbox. The worker supplies the
 * numbers and the names; the caller supplies nothing else.
 *
 * The rules, in the order they matter:
 *
 *   1. A fresh entry is served and the network is not asked. ImgBB URLs are
 *      content-addressed, so revalidation could only spend a member's data plan
 *      to learn what the cache already knows.
 *   2. The network is asked for a *readable* response first (`cors`). A plain
 *      `<img>` produces a `no-cors` request, and `no-cors` can only ever deliver
 *      an opaque body — status 0, no headers, no bytes to verify — which is why
 *      the cache was never written. If the host does not allow the read, the
 *      request falls back to exactly what the element would have made itself.
 *   3. Only a response that is `200`, `image/*`, long enough to be a picture,
 *      and whose first bytes carry an image signature is stored.
 *   4. A stale entry is served only while the host cannot be reached, and only
 *      inside twice the trust window; past that it is deleted.
 *   5. An answer the worker refuses to store is delivered to the page **without
 *      cache headers**, so the browser's own HTTP cache cannot remember a 429 or
 *      an HTML error page as if it were the picture. This is the rule that ends
 *      "images stay broken until I clear my cache".
 */
import {
  deliveredHeaders,
  isFresh,
  isStorableImage,
  isUsableWhenStale,
  looksLikeImageBytes,
  MIN_IMAGE_BYTES,
  stampStored,
  uncachedHeaders,
} from './cache-policy';

export interface ImageStrategyConfig {
  /** The picture cache this worker owns. */
  cacheName: string;
  /** How long a stored picture is served without asking the network. */
  trustMs: number;
  /** How long a network request may take before the tile is given up on. */
  networkTimeoutMs: number;
  /** How many pictures the cache keeps. */
  maxEntries: number;
  /** Milliseconds since the epoch; injectable so freshness is testable. */
  now?: () => number;
  /** Injected for tests. Defaults to the worker's own globals. */
  caches?: CacheStorage;
  fetch?: typeof fetch;
}

/** The response as the page sees it: the worker's own bookkeeping removed. */
function asDelivered(stored: Response): Response {
  return new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers: deliveredHeaders(stored),
  });
}

/**
 * An answer the worker will not vouch for, delivered so it cannot be remembered.
 *
 * An opaque body is passed through untouched because nothing about it can be
 * read — it is exactly what the element would have received on its own.
 */
function refused(response: Response): Response {
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: uncachedHeaders(response),
  });
}

/**
 * The network, with a deadline, so a stalled connection does not hang a tile.
 *
 * The request is re-issued rather than reused: the element's own request is
 * `no-cors`, and re-using it guarantees an opaque body that can be neither
 * verified nor stored.
 */
async function fromNetwork(url: string, config: ImageStrategyConfig): Promise<Response | null> {
  const doFetch = config.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.networkTimeoutMs);
  const options: RequestInit = {
    signal: controller.signal,
    // The worker is the cache. Asking the HTTP cache as well would let a
    // poisoned disk entry survive the eviction rules above.
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  };
  try {
    try {
      return await doFetch(url, { ...options, mode: 'cors' });
    } catch {
      // Not a CORS-enabled host. Nothing to verify, nothing to store — but the
      // picture is still there, so ask for it the way the element did.
    }
    return await doFetch(url, { ...options, mode: 'no-cors' });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Writes a picture only after its bytes have been read and recognised. */
async function storeVerified(
  cache: Cache,
  request: Request,
  response: Response,
  maxEntries: number,
): Promise<void> {
  try {
    // A body read twice needs a clone; the original is what the page receives.
    const body = await response.clone().blob();
    if (body.size < MIN_IMAGE_BYTES) {
      // A body that claimed a length and then delivered nothing is a stub, and a
      // stub is how a "successful" response poisons a cache.
      await cache.delete(request).catch(() => undefined);
      return;
    }
    // The header said `image/*`; this is the picture itself. A host that answers
    // an image URL with an HTML rate-limit page under the right content type is
    // rare, and it was enough to break every later paint of that picture.
    const head = new Uint8Array(await body.slice(0, 32).arrayBuffer());
    if (!looksLikeImageBytes(head)) {
      await cache.delete(request).catch(() => undefined);
      return;
    }
    await cache.put(request, new Response(body, { status: 200, headers: stampStored(response) }));
    // Enforce the entry ceiling without waiting for an expiration sweep: the
    // Cache API has no eviction of its own, and a phone that has scrolled a feed
    // for an hour should not be holding a thousand decoded pictures.
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      for (const key of keys.slice(0, keys.length - maxEntries)) {
        await cache.delete(key).catch(() => undefined);
      }
    }
  } catch {
    // Quota, a locked profile, a private window that forbids Cache writes: the
    // picture still paints from the network response. A failed cache write is
    // never a failed picture.
  }
}

/**
 * Answers one managed image request.
 *
 * Called by the worker's `fetch` listener for requests it has already decided it
 * is responsible for (see `isManagedImage` in `sw.ts`).
 */
export async function handleManagedImage(
  request: Request,
  config: ImageStrategyConfig,
): Promise<Response> {
  const store = config.caches ?? caches;
  const now = config.now ?? Date.now;

  let cache: Cache | null = null;
  try {
    cache = await store.open(config.cacheName);
  } catch {
    // No Cache API (a locked-down profile). Fall through to the network only.
    cache = null;
  }

  const cached = cache === null ? undefined : await cache.match(request).catch(() => undefined);

  if (cache !== null && cached !== undefined && isFresh(cached, config.trustMs, now())) {
    return asDelivered(cached);
  }

  const response = await fromNetwork(request.url, config);

  if (response !== null && isStorableImage(response)) {
    if (cache !== null) {
      await storeVerified(cache, request, response.clone(), config.maxEntries);
    }
    return response;
  }

  if (cached !== undefined && isUsableWhenStale(cached, config.trustMs, now())) {
    // Unconfirmable right now (the host is down, the member is on a train) but
    // recently good. A stale picture beats an empty tile.
    return asDelivered(cached);
  }

  if (cache !== null && cached !== undefined) {
    // Past twice the trust window and still unconfirmable: the picture is gone,
    // not slow. Holding the entry would mean holding it forever.
    await cache.delete(request).catch(() => undefined);
  }

  if (response !== null) return refused(response);

  return new Response('', {
    status: 504,
    statusText: 'Gateway Timeout',
    headers: { 'cache-control': 'no-store' },
  });
}
