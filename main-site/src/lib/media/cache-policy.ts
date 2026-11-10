/**
 * The rules for what a service worker is allowed to store as a picture.
 *
 * These are here, in a plain module with no worker globals in it, for one
 * reason: the bug they prevent was invisible in review and impossible to
 * reproduce without a browser. `StaleWhileRevalidate` stored anything with a
 * 200, and a 200 that was an HTML error page under an image URL became the
 * picture, forever. A rule that cannot be unit-tested is a rule that gets argued
 * about; a rule that takes a `Response` and returns a boolean is a rule with a
 * test file next to it.
 *
 * `sw.ts` imports this and nothing else decides storage.
 */

/** A body smaller than this cannot be a picture; it is an error page or a stub. */
export const MIN_IMAGE_BYTES = 32;

/** The header the worker writes to remember when it stored a body. */
export const STORED_AT_HEADER = 'x-bsdc-stored-at';

/**
 * Whether this response may be written to the picture cache.
 *
 * Every condition is load-bearing:
 *
 *   - `type` must be `basic` or `cors`. An opaque response has a status of 0
 *     and no readable headers, so nothing about it can be verified — and it is
 *     exactly the shape a hotlink-blocked or rate-limited third-party response
 *     arrives in.
 *   - `ok` and `status === 200`. Not 206 (half a picture), not 304 (a
 *     revalidation, not a body), not 0.
 *   - The content type must be `image/*`. This is the check that would have
 *     stopped the reported bug on its first day.
 *   - A declared length must not be below the stub threshold.
 */
export function isStorableImage(response: Response): boolean {
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  if (!response.ok || response.status !== 200) return false;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('image/')) return false;
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > 0 && declared < MIN_IMAGE_BYTES) return false;
  return true;
}

/** When this body was stored, in milliseconds, or null when unknown. */
export function storedAt(response: Response): number | null {
  const raw = response.headers.get(STORED_AT_HEADER);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether a stored entry may still be served without asking the network.
 *
 * `Infinity` when the entry has no timestamp, which means it was written by a
 * worker that did not record one — the worker this one replaces. Those entries
 * are stale by definition, so the network is asked first and the entry is
 * replaced by one that carries its own age.
 */
export function isFresh(stored: Response, trustMs: number, now = Date.now()): boolean {
  const at = storedAt(stored);
  if (at === null) return false;
  return now - at < trustMs;
}

/**
 * Whether a stale entry is worth serving when the network cannot answer.
 *
 * Twice the trust window: a picture confirmed within a fortnight is very likely
 * still the picture, and a member on a train is better served by a slightly old
 * photograph than by an empty tile. Past that window the entry is deleted, so a
 * permanently broken picture cannot sit in the cache forever.
 */
export function isUsableWhenStale(stored: Response, trustMs: number, now = Date.now()): boolean {
  const at = storedAt(stored);
  if (at === null) return false;
  return now - at < trustMs * 2;
}

/** Stamps a body with the moment it was stored, for the two checks above. */
export function stampStored(response: Response, now = Date.now()): Headers {
  const headers = new Headers(response.headers);
  headers.set(STORED_AT_HEADER, String(now));
  return headers;
}

/** The headers as the page should see them: the bookkeeping is stripped. */
export function deliveredHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  headers.delete(STORED_AT_HEADER);
  return headers;
}

// ------------------------------------------------------- the bytes, not the label ---

/**
 * The signature check itself lives in `image-signature.ts`, which the edge media
 * proxy imports too: that file compiles against the Workers types, where
 * `Response` is not the DOM's `Response`, so the check cannot live next to the
 * `Response` rules below. Re-exported here so the worker has one import.
 */
export { IMAGE_SNIFF_BYTES, looksLikeImageBytes } from './image-signature';

/**
 * The headers an answer must carry when it is *not* being stored.
 *
 * This is the second half of the reported bug, and the half nobody looked for.
 * A 429 from a picture host is an ordinary cacheable response: it carries a
 * `cache-control` and the browser's HTTP cache dutifully remembers it, per URL,
 * for as long as the header says. The picture then stays broken after the host
 * has recovered, and clearing the cache is what "fixes" it.
 *
 * So an answer the worker refuses to vouch for is an answer the browser is told
 * not to remember. `expires` and `etag` go too: a stale ETag invites a
 * conditional request that re-validates the same wrong answer.
 */
export function uncachedHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  headers.delete('expires');
  headers.delete('etag');
  headers.delete('last-modified');
  headers.delete('age');
  return headers;
}
