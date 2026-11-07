/**
 * The hosts a picture may live on.
 *
 * One list, imported by all four places that have to agree about it: the
 * service worker that caches pictures, the browser component that draws them,
 * the Pages Function that repairs a broken one, and the test that proves the
 * three agree. A allowlist duplicated in four places is an allowlist that
 * drifts, and the drift shows up as pictures that load in the feed and not in
 * the lightbox — which is the sort of bug that gets diagnosed as "the CDN is
 * flaky" for a month.
 *
 * This file has no imports at all, on purpose. The service worker bundle, the
 * main bundle and the edge bundle all reach it, and none of them share a module
 * graph.
 */

/**
 * Image hosts the platform itself writes to, or reads faces and avatars from.
 *
 * Deliberately exact rather than a wide `*.host` pattern where the host is
 * shared infrastructure:
 *
 *   res.cloudinary.com      uploads that need transforms (avatars, covers,
 *                           project and product images, PDFs, voice notes)
 *   i.ibb.co / ibb.co       ordinary member pictures (posts, comments, chat),
 *                           uploaded through the edge proxy
 *   firebasestorage...      the legacy bucket some rows still point at
 *   *.googleusercontent.com Google profile pictures after OAuth sign-in
 *   avatars.githubusercontent.com  GitHub profile pictures after OAuth sign-in
 *   *.tile.openstreetmap.org  map tiles for the location field
 */
const EXACT_HOSTS: readonly string[] = ['res.cloudinary.com', 'i.ibb.co', 'ibb.co'];

const SUFFIX_HOSTS: readonly string[] = [
  'googleusercontent.com',
  'firebasestorage.app',
  'tile.openstreetmap.org',
  'yimg.com',
];

/** Hosts whose pictures are third-party data and must never be transformed. */
export function isAllowedMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host.length === 0) return false;
  if (EXACT_HOSTS.includes(host)) return true;
  return SUFFIX_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * The suffix a picture's file name ends with, when it has one.
 *
 * Used to decide whether a URL is a picture at all before anything is asked of
 * a network. A URL with no extension is still allowed — Cloudinary serves
 * extensionless delivery URLs — so this answers "is this definitely not an
 * image" rather than "is this definitely an image".
 */
const NOT_IMAGE_SUFFIX =
  /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|mp4|mov|avi|mkv|webm|mp3|wav|ogg|opus|m4a|json|txt|csv|sql|ts|js)$/i;

export function looksLikeDocument(url: string): boolean {
  const withoutQuery = url.split('?')[0] ?? '';
  const withoutHash = withoutQuery.split('#')[0] ?? '';
  return NOT_IMAGE_SUFFIX.test(withoutHash);
}

/**
 * The paths a repaired picture is served from.
 *
 * `/media/i` answers with the bytes of an allowlisted picture, fetched by the
 * edge and handed back from this origin. It is the last rung of the ladder in
 * `resilience.ts`: it fixes two failures a browser cannot fix by itself — a
 * host that stopped sending `access-control-allow-origin`, and a provider whose
 * signed URL has expired.
 */
export const MEDIA_PROXY_PATH = '/media/i';

/**
 * The query parameter a retry appends.
 *
 * A picture that fails once is usually a picture this browser has already
 * stored a bad answer for: a 0-byte body, an HTML error page saved under a
 * `.jpg`, a response header that was missing the day it was fetched. Asking
 * for the same URL asks the cache for the same wrong answer, so the retry asks
 * for a different one. `i.ibb.co` and `res.cloudinary.com` both ignore unknown
 * query parameters.
 */
export const BUST_PARAM = 'bsdc_r';

/**
 * How long a cached picture is trusted before the worker checks again.
 *
 * The whole point. A 30-day `StaleWhileRevalidate` on an `<img>` is a cache
 * that never revalidates while the member keeps using the site, because the
 * revalidation goes into the background and its result is only seen by the
 * *next* page load - and if the network answer was bad, the bad answer is what
 * gets stored. Seven days, with a network-first path at the end of the window,
 * means a poisoned entry cannot outlive a week, and the failure mode stops
 * being "clear your cookies".
 */
export const MEDIA_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** The subset of the platform's own uploads that may be proxied for repair. */
export function isRepairableMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  // Only the hosts the platform controls the credentials for. A third-party
  // avatar service is never proxied: it costs an edge request and the browser
  // already renders it, or the initials do.
  return host === 'res.cloudinary.com' || host === 'i.ibb.co' || host === 'ibb.co';
}
