/**
 * Registers the push-only service worker (`/sw.js`) and cleans up any legacy
 * offline/Workbox/picture caches left over in returning visitors' browsers.
 *
 * The website never caches feeds, HTML shells, or images in a service worker.
 */

const LEGACY_CACHE_PREFIXES: readonly string[] = ['bsdc-images', 'bsdc-fonts', 'workbox-'];
const LEGACY_HEAL_KEY = 'bsdc.media.healed';

function cacheStorageAvailable(): boolean {
  return typeof caches !== 'undefined' && typeof caches.keys === 'function';
}

export async function cleanupLegacyOfflineCaches(): Promise<string[]> {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.removeItem(LEGACY_HEAL_KEY);
    }
  } catch {
    // Locked-down storage contexts may refuse localStorage access.
  }

  if (!cacheStorageAvailable()) return [];
  try {
    const names = await caches.keys();
    const stale = names.filter((name) =>
      LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    );
    await Promise.all(stale.map((name) => caches.delete(name)));
    return stale;
  } catch {
    return [];
  }
}

export function registerPushServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;

  void cleanupLegacyOfflineCaches();

  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch(() => undefined);
}
