/// <reference lib="webworker" />
/**
 * The service worker: the offline shell, the picture cache, and the thing that
 * answers a push.
 *
 * ## Why the picture cache is written by hand
 *
 * This worker used to hand every `request.destination === 'image'` to Workbox's
 * `StaleWhileRevalidate` with a 200-entry, 30-day expiration. That reads like a
 * performance decision and behaves like a permanent one. Three things went
 * wrong, and together they produce the exact symptom every member reported:
 * images load, and a few minutes later none of them do until the cache is
 * cleared.
 *
 *   1. **Workbox's default `cacheWillUpdate` accepts any response with
 *      `status === 200` or `type === 'opaque'`.** An image host that answers a
 *      rate limit or an expired-signature page with `200` and `text/html` — or
 *      answers with `206`/`304` shapes the strategy does not recognise — gets
 *      that body stored *as the picture*.
 *   2. **`StaleWhileRevalidate` serves the cache first, always.** So the moment
 *      one bad body lands in the cache, every subsequent paint of that picture
 *      uses it. The background revalidation cannot heal it, because the cache
 *      entry it replaces is the one the next paint reads, and the bad answer is
 *      often what comes back.
 *   3. **30 days is longer than any provider keeps a signed delivery URL
 *      alive.** A URL that expires is a URL that will answer `403` forever from
 *      the cache's point of view, and the browser never asks again.
 *
 * Putting those together: one bad minute at a picture host poisons the cache for
 * a month, and the only way out a member has is to clear site data. That is not
 * a bug in a CDN; it is a bug in this file.
 *
 * So the router below is explicit, and it enforces five rules:
 *
 *   - Only the platform's own picture hosts are cached at all.
 *   - A response is stored only when it is `ok`, carries an `image/*` content
 *     type, and has a non-zero body. Anything else is dropped, never stored.
 *   - Every entry carries the time it was stored, and is only served from the
 *     cache inside a seven-day window measured from that time.
 *   - Outside that window the worker asks the network first, so an expired
 *     signature cannot outlive its signature.
 *   - A cached entry never survives a version bump: the cache name carries the
 *     version, which is what heals every browser that is already poisoned the
 *     first time it loads this file.
 *
 * ## Push
 *
 * A push arrives with no payload. The wake-up is empty — a body would have to be
 * encrypted for this one subscription — so the worker asks `/api/push/content`
 * what this device missed and writes it up. The endpoint is the capability: a
 * long random address only this browser, its push service and the database hold,
 * which is why the request needs no session. When the push *does* carry a JSON
 * payload — a deployment that signs its own pushes, or a future FCM path —
 * that payload is used instead of a round trip.
 */
import type { WorkboxPlugin } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

import {
  FONT_CACHE_NAME,
  IMAGE_CACHE_NAME,
  isStaleFontCacheName,
  isStaleImageCacheName,
} from '@/lib/media/cache-names';
import { isAllowedMediaHost, MEDIA_MAX_AGE_SECONDS, MEDIA_PROXY_PATH } from '@/lib/media/hosts';
import { handleManagedImage } from '@/lib/media/image-strategy';
import { parsePushContent, summarize, type PushContent } from '@/lib/notifications/copy';
import { urlBase64ToUint8Array } from '@/lib/push/webpush';

declare let self: ServiceWorkerGlobalScope;

const CONTENT_URL = '/api/push/content';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/maskable-512.png';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '';

/**
 * The names live in `lib/media/cache-names`, because the page deletes what it
 * does not recognise and a second copy of a version string is how the page ends
 * up deleting the worker's live cache. See that file for the bug.
 */
const IMAGE_CACHE = IMAGE_CACHE_NAME;
const FONT_CACHE = FONT_CACHE_NAME;

/** How long a stored picture is served without asking the network. */
const IMAGE_TRUST_MS = MEDIA_MAX_AGE_SECONDS * 1000;
/** How long a revalidation may take before the stale copy is served instead. */
const IMAGE_NETWORK_TIMEOUT_MS = 9_000;
/** How many pictures the cache keeps. */
const IMAGE_CACHE_ENTRIES = 400;

precacheAndRoute(self.__WB_MANIFEST);

// A navigation that is not in the precache gets the app shell, except where the
// shell would be a lie: the API, the Firebase callbacks, the feeds and the bots.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [
      /^\/playground\/runner$/,
      /^\/api\//,
      /^\/__\//,
      /^\/sitemap/,
      /^\/rss/,
      /^\/robots\.txt$/,
      /^\/media\/i$/,
    ],
  }),
);

/**
 * `workbox-expiration` types its optional callbacks as `T | undefined`, which
 * `exactOptionalPropertyTypes` will not accept where `workbox-core` types them as
 * merely optional. It is the same object at either end; the cast belongs to the
 * type system, not to the runtime.
 */
function expire(maxEntries: number, maxAgeSeconds: number): WorkboxPlugin[] {
  return [new ExpirationPlugin({ maxEntries, maxAgeSeconds }) as unknown as WorkboxPlugin];
}

registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: FONT_CACHE,
    plugins: expire(20, 60 * 60 * 24 * 365),
  }),
);

// ------------------------------------------------------------------ images ---

/** Whether this request is a picture on a host the platform is responsible for. */
function isManagedImage(request: Request): boolean {
  if (request.destination !== 'image') return false;
  // Range requests are a video element probing a poster; the Cache API cannot
  // answer them and storing a 206 would store half a picture.
  if (request.headers.has('range')) return false;
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.pathname === MEDIA_PROXY_PATH) return false;
    if (url.origin === self.location.origin) {
      // The site's own icons, brand art and og images. Assets under `/assets/`
      // are content-hashed and precached; `/icons` and `/og` are stable names
      // that change rarely and are worth a cache.
      return /^\/(?:icons|og|brand|apple-touch|favicon)/.test(url.pathname);
    }
    return isAllowedMediaHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The picture strategy itself lives in `lib/media/image-strategy.ts`.
 *
 * It was in this file, where nothing could import it without Workbox and a
 * service-worker global, so its rules — when to store, when to revalidate, what
 * to do with a refusal — were asserted only by reading them. Every one of them
 * was wrong in production. The worker now supplies the numbers; the module makes
 * the decisions, and `image-strategy.test.ts` makes them on a fake cache and a
 * fake network.
 */
function handleImage(request: Request): Promise<Response> {
  return handleManagedImage(request, {
    cacheName: IMAGE_CACHE,
    trustMs: IMAGE_TRUST_MS,
    networkTimeoutMs: IMAGE_NETWORK_TIMEOUT_MS,
    maxEntries: IMAGE_CACHE_ENTRIES,
  });
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!isManagedImage(request)) return;
  event.respondWith(handleImage(request));
});

// ------------------------------------------------------------------- cache ---

/**
 * The worker is registered as `prompt`: it waits, and the app decides when the
 * member is told a new version is ready. Applying it is the app's message, not
 * a decision made while somebody is reading.
 *
 * A version being applied is also the moment to throw away the picture cache
 * from the previous worker, because the reason a new worker exists may well be
 * that the old one stored something it should not have.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as string | { type?: string } | undefined;
  const asked = typeof data === 'string' ? data : (data?.type ?? '');
  if (asked === 'SKIP_WAITING') {
    event.waitUntil(
      (async () => {
        await purgeStaleCaches();
        await self.skipWaiting();
      })(),
    );
  }
  if (asked === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE));
  }
});

/**
 * Delete every cache an older worker wrote, at install time.
 *
 * `install` runs while the new worker is still *waiting* — before it activates,
 * and therefore before a member has been asked to reload anything. That timing
 * is the whole point: the worker that poisoned a browser's picture cache is the
 * one still serving it, and a cleanup that only happens on activation waits for
 * a prompt nobody presses. Caches are shared across workers, so the waiting
 * worker can reclaim them, and the old worker's next `cache.match` simply misses
 * and goes to the network.
 *
 * Nothing that belongs to another application on this origin is touched.
 */
async function purgeStaleCaches(): Promise<string[]> {
  try {
    const names = await caches.keys();
    const stale = names.filter((name) => isStaleImageCacheName(name) || isStaleFontCacheName(name));
    await Promise.all(stale.map((name) => caches.delete(name)));
    return stale;
  } catch {
    // Storage forbidden, or an implementation that throws on `keys()`. The
    // picture still loads; it just is not cached here.
    return [];
  }
}

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(purgeStaleCaches());
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await purgeStaleCaches();
      await self.clients.claim();
    })(),
  );
});

// ------------------------------------------------------------------- push ---

interface ContentAnswer {
  ok: boolean;
  items: PushContent[];
}

/** A payload, when one was sent. Notification-shaped, and bounded. */
interface PushPayload {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  icon?: unknown;
  tag?: unknown;
}

function readPayload(event: PushEvent): PushPayload | null {
  const data = event.data;
  if (data === null || typeof data === 'undefined') return null;
  try {
    const parsed = data.json() as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as PushPayload;
  } catch {
    // A payload that is not JSON is not a payload this worker understands. The
    // empty-body path is still correct, so it is used instead.
    return null;
  }
}

function payloadText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}

async function fetchContent(endpoint: string): Promise<ContentAnswer> {
  try {
    const response = await fetch(CONTENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, limit: 10 }),
    });
    if (!response.ok) return { ok: false, items: [] };
    return { ok: true, items: parsePushContent(await response.json()) };
  } catch {
    // No answer at all — a device that came online for a moment and lost it
    // again. The caller still shows something, because a push did arrive.
    return { ok: false, items: [] };
  }
}

function language(): 'bn' | 'en' {
  const tag = (self.navigator?.language ?? 'bn').toLowerCase();
  return tag.startsWith('en') ? 'en' : 'bn';
}

async function show(
  title: string,
  body: string,
  url: string,
  tag: string,
  icon?: string,
): Promise<void> {
  await self.registration.showNotification(title, {
    body,
    tag,
    icon: icon !== undefined && icon.length > 0 ? icon : ICON,
    badge: BADGE,
    lang: language(),
    dir: 'ltr',
    // A notification that replaces its predecessor should still be visible: one
    // that silently replaces another looks like nothing arrived at all.
    silent: false,
    data: { url },
  });
}

async function handlePush(event: PushEvent): Promise<void> {
  const payload = readPayload(event);
  const title = payloadText(payload?.title, 120);
  const body = payloadText(payload?.body, 240);

  if (title.length > 0) {
    // The push carried words of its own. Nothing is asked of the network: a
    // notification should not depend on a request that may fail.
    const url = payloadText(payload?.url, 300);
    await show(
      title,
      body,
      url.startsWith('/') ? url : '/notifications',
      payloadText(payload?.tag, 80) || `bsdc-push-${Date.now()}`,
      payloadText(payload?.icon, 500),
    );
    return;
  }

  const subscription = await self.registration.pushManager.getSubscription();
  if (subscription === null) return;

  const answer = await fetchContent(subscription.endpoint);

  // The flush woke every device of this member; another one may already have
  // been told. Silence is better than a duplicate.
  if (answer.ok && answer.items.length === 0) return;

  const summary = summarize(answer.items);
  if (summary !== null) {
    await show(summary.title, summary.body, summary.url, `bsdc-summary-${Date.now()}`);
    return;
  }

  await show(
    language() === 'en' ? 'BSDC' : 'বিএসডিসি',
    language() === 'en'
      ? 'Something new is waiting for you.'
      : 'আপনার জন্য নতুন কিছু অপেক্ষা করছে।',
    '/notifications',
    `bsdc-wake-${Date.now()}`,
  );
}

self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(handlePush(event));
});

function urlOf(notification: Notification): string {
  const data = notification.data as { url?: unknown } | undefined;
  const url = typeof data?.url === 'string' ? data.url : '/notifications';
  return url.startsWith('/') ? url : '/notifications';
}

/**
 * Opens the thing the notification was about. A tab already on that page is
 * focused rather than duplicated; a tab elsewhere on the site is navigated, so
 * the member does not end up with a second copy of the app; only then is a
 * window opened.
 */
async function openTarget(url: string): Promise<void> {
  const target = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of windows) {
    if (client.url === target) {
      await client.focus();
      return;
    }
  }

  const ours = windows.find((client) => {
    try {
      return new URL(client.url).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  if (ours !== undefined) {
    try {
      const navigated = await ours.navigate(target);
      if (navigated !== null) {
        await navigated.focus();
        return;
      }
    } catch {
      // A tab with a half-written post can refuse to navigate; open a new one.
    }
  }

  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const url = urlOf(event.notification);
  event.notification.close();
  event.waitUntil(openTarget(url));
});

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  // Nothing to undo, but a closed notification that stayed in the tray of a
  // device that reboots is a stale one; the tag makes the next push replace it.
  void event.notification.tag;
});

/**
 * The push service rotated this subscription — a browser update, a restored
 * profile, a key that expired. Re-subscribing keeps something deliverable on the
 * device; the app re-registers the new endpoint the next time it is opened,
 * which is the only moment it can prove who it belongs to. The old row is
 * retired by the flush when the push service answers 404.
 */
interface SubscriptionChange {
  newSubscription?: PushSubscription | null;
  waitUntil(promise: Promise<unknown>): void;
}

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const change = event as Event & SubscriptionChange;
  change.waitUntil(
    (async () => {
      if (change.newSubscription) return;
      if (VAPID_PUBLIC_KEY.length === 0) return;
      try {
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch {
        // Permission can have been withdrawn while the site was closed. There is
        // nothing to subscribe with, and the app will ask again when it is open.
      }
    })(),
  );
});
