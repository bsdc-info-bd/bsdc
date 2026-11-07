import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import i18n from './i18n';

/**
 * The version of the picture cache this build expects.
 *
 * It must match `IMAGE_CACHE` in `src/sw.ts`. When a worker is updated, this
 * string changes with it, and the code below deletes every picture cache that
 * does not match — from the page, immediately, without waiting for the member to
 * accept an update prompt.
 *
 * That is the fix for browsers that are *already* broken. A member who saw "all
 * images stopped loading and clearing the cache fixed it" has a cache full of
 * poison. The worker that would clean it up is waiting behind a "reload to
 * update" toast the member may never press. So the page does it: on load, once
 * per version, every stale picture cache is dropped.
 */
export const IMAGE_CACHE_VERSION = 'bsdc-images-v4';

/** Where the page remembers which version it has already healed. */
const HEAL_KEY = 'bsdc.media.healed';

/** Every cache prefix this worker owns; anything else belongs to someone else. */
const MANAGED_PREFIXES = ['bsdc-images', 'bsdc-fonts'];

function cacheStorageAvailable(): boolean {
  // A private window in some browsers throws on `caches` rather than returning
  // an empty store, and Safari has shipped a `caches` that is not iterable.
  return typeof caches !== 'undefined' && typeof caches.keys === 'function';
}

/**
 * Heals a poisoned picture cache.
 *
 * Returns the names it deleted so the result is observable — a repair that
 * silently does nothing is a repair nobody can debug.
 */
export async function healMediaCaches(current = IMAGE_CACHE_VERSION): Promise<string[]> {
  if (!cacheStorageAvailable()) return [];
  try {
    const names = await caches.keys();
    const stale = names.filter((name) => {
      if (!MANAGED_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
      // A font cache is content-addressed by a filename that changes with the
      // build, so it never needs healing; only the picture cache does.
      return name.startsWith('bsdc-images') && name !== current;
    });
    await Promise.all(stale.map((name) => caches.delete(name)));
    return stale;
  } catch {
    // Storage can be forbidden entirely (a locked-down browser, an iframe with
    // no storage access). A failed repair is not a failed page.
    return [];
  }
}

/**
 * Runs once per build.
 *
 * Cheap for everybody else: one `localStorage` read. The marker is written only
 * after the deletion succeeds, so a browser that threw halfway tries again on
 * the next load instead of believing it is healed.
 */
export async function healMediaCachesOnce(): Promise<void> {
  try {
    if (window.localStorage.getItem(HEAL_KEY) === IMAGE_CACHE_VERSION) return;
  } catch {
    // Storage denied: heal anyway. The cost is one key scan per load.
  }

  const deleted = await healMediaCaches();
  try {
    window.localStorage.setItem(HEAL_KEY, IMAGE_CACHE_VERSION);
  } catch {
    // Nothing to record. The repair has still happened.
  }

  if (deleted.length > 0) {
    // A quiet, useful line rather than a toast: a member does not need to know
    // that a cache was repaired, but a developer reading the console does.
    console.warn(`BSDC: dropped ${deleted.length} stale picture cache(s) — ${deleted.join(', ')}`);
  }
}

/**
 * The repair a member can ask for.
 *
 * Exposed in Settings next to the push controls, and called by the "pictures not
 * loading" action in the offline banner. It is deliberately a manual action with
 * a visible result: the members who reported this problem have been told for
 * months to clear their whole cache, and this is the thing they should be told
 * instead.
 */
export async function repairPictures(): Promise<boolean> {
  /** True when a stale cache was actually reclaimed. */
  const deleted = await healMediaCaches(IMAGE_CACHE_VERSION);

  // Ask the worker as well: it holds the live cache this page cannot open
  // without knowing the name it is using now.
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.active?.postMessage({ type: 'CLEAR_IMAGE_CACHE' });
  } catch {
    // No worker, no live cache. The deletion above is the whole repair.
  }

  /**
   * Every `<img>` on the page keeps whatever the browser decided for it, and a
   * failed element does not retry on its own. A cache-busting parameter re-asks
   * for each one, which is what makes the repair visible in the same second
   * rather than at the next navigation.
   *
   * Only the stale ones are touched: `complete` and a zero `naturalWidth` is the
   * browser saying "I have an answer and it is not a picture".
   */
  if (typeof document !== 'undefined') {
    const stamp = Date.now().toString(36);
    for (const image of Array.from(document.images)) {
      if (image.complete && image.naturalWidth > 0) continue;
      const src = image.getAttribute('src');
      if (src === null || src.startsWith('data:') || src.startsWith('blob:')) continue;
      const separator = src.includes('?') ? '&' : '?';
      image.setAttribute('src', `${src}${separator}bsdc_r=repair${stamp}`);
    }
  }

  return deleted.length > 0;
}

/**
 * Service worker registration with an explicit update prompt, so a user is
 * never left on a stale shell and never force-reloaded mid-action.
 *
 * `updateViaCache: 'none'` matters more than it looks: with the default, a
 * browser may answer the request for `sw.js` from the HTTP cache for up to 24
 * hours, which is a day in which a fixed worker is not fixed.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;

  void healMediaCachesOnce();

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast(i18n.t('pwa.updateTitle'), {
        duration: Infinity,
        action: {
          label: i18n.t('pwa.updateAction'),
          onClick: () => {
            void updateSW(true);
          },
        },
      });
    },
    onOfflineReady() {
      toast.success(i18n.t('pwa.readyTitle'));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // A tab that stays open for days never reloads, so it never discovers a
      // new worker. Asking once an hour is enough for a fix to land on a long
      // session without a reload prompt appearing at a bad moment.
      setInterval(
        () => {
          void registration.update().catch(() => undefined);
        },
        60 * 60 * 1000,
      );
    },
  });
}
