/**
 * The hosts a picture may live on.
 *
 * Imported by the service worker, the browser image renderer, the edge media
 * proxy (`/media/i`), and unit tests so all four share one exact allowlist.
 *
 * Pure module with zero imports so every bundle can include it cleanly.
 */

/**
 * First-party upload hosts (ImgBB CDN & mirror) plus OAuth/map suffix hosts:
 *
 *   i.ibb.co / ibb.co / i.ibb.co.com  all BSDC member, project, product, cover
 *                                     and avatar images uploaded via ImgBB
 *   *.firebasestorage.app             legacy bucket rows
 *   *.googleusercontent.com           Google profile pictures after OAuth sign-in
 *   *.tile.openstreetmap.org          map tiles for location fields
 */
const EXACT_HOSTS: readonly string[] = [
  'i.ibb.co',
  'ibb.co',
  'i.ibb.co.com',
  'ibb.co.com',
  'image.ibb.co',
  'preview.ibb.co',
  'thumb.ibb.co',
];

const IMGBB_NUMBERED_SUBDOMAIN = /^i\d+\.ibb\.co(?:\.com)?$/;

const SUFFIX_HOSTS: readonly string[] = [
  'googleusercontent.com',
  'firebasestorage.app',
  'tile.openstreetmap.org',
  'yimg.com',
];

/** Whether a hostname belongs to an allowed image host. */
export function isAllowedMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host.length === 0) return false;
  if (EXACT_HOSTS.includes(host) || IMGBB_NUMBERED_SUBDOMAIN.test(host)) return true;
  return SUFFIX_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

const NOT_IMAGE_SUFFIX =
  /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|mp4|mov|avi|mkv|webm|mp3|wav|ogg|opus|m4a|json|txt|csv|sql|ts|js)$/i;

export function looksLikeDocument(url: string): boolean {
  const withoutQuery = url.split('?')[0] ?? '';
  const withoutHash = withoutQuery.split('#')[0] ?? '';
  return NOT_IMAGE_SUFFIX.test(withoutHash);
}

/** Same-origin edge delivery & repair endpoint. */
export const MEDIA_PROXY_PATH = '/media/i';

/** Cache-busting query parameter appended during recovery retries. */
export const BUST_PARAM = 'bsdc_r';

/** Trust window (7 days) for verified service-worker image cache entries. */
export const MEDIA_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Hosts that BSDC uploads to and permits `/media/i` to fetch and edge-cache. */
export function isRepairableMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return EXACT_HOSTS.includes(host) || IMGBB_NUMBERED_SUBDOMAIN.test(host);
}
