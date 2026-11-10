/**
 * The one place that knows what this platform's caches are called.
 *
 * There used to be two: `IMAGE_CACHE` in `src/sw.ts` (`bsdc-images-v5`) and
 * `IMAGE_CACHE_VERSION` in `src/pwa.ts` (`bsdc-images-v4`). The page deletes
 * every picture cache whose name is not *its* idea of the current one, so on
 * every fresh browser it deleted the cache the running worker was writing to.
 * The result was pictures that loaded twice, a cache that never got warm, and a
 * repair routine that was itself the damage.
 *
 * Two constants that must be equal are one constant. Both files import this, so
 * they cannot drift, and `cache-names.test.ts` reads the sources to prove it —
 * because a future edit that reintroduces a literal is exactly the mistake this
 * file exists to prevent.
 *
 * Pure module: no imports, no globals, safe in the worker, the page and a test.
 */

/**
 * Picture cache. The version is part of the name on purpose: bumping it
 * abandons every entry an older worker wrote, which is how a browser whose
 * cache is already poisoned is fixed without asking its owner to clear
 * anything. Bump this whenever the rules for what may be stored change.
 *
 * v6 — stores only bodies whose first bytes are a real image signature, and
 *      never lets a failed answer be remembered by the HTTP cache.
 */
export const IMAGE_CACHE_NAME = 'bsdc-images-v6';

/** Font cache. Not versioned per build: font filenames are content-hashed. */
export const FONT_CACHE_NAME = 'bsdc-fonts-v2';

/** Every cache prefix this platform owns; anything else belongs to someone else. */
export const MANAGED_CACHE_PREFIXES: readonly string[] = ['bsdc-images', 'bsdc-fonts'];

/** Whether a cache name belongs to this platform at all. */
export function isManagedCacheName(name: string): boolean {
  return MANAGED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Whether this is a picture cache from a worker this build no longer runs.
 *
 * Only the picture cache is versioned per build, and only the picture cache has
 * ever been poisoned by what it stored, so only the picture cache is healed.
 */
export function isStaleImageCacheName(name: string): boolean {
  return name.startsWith('bsdc-images') && name !== IMAGE_CACHE_NAME;
}

/** Whether this is a font cache from a worker this build no longer runs. */
export function isStaleFontCacheName(name: string): boolean {
  return name.startsWith('bsdc-fonts') && name !== FONT_CACHE_NAME;
}
