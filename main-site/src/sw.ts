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
  deliveredHeaders,
  isFresh,
  isStorableImage,
  isUsableWhenStale,
  MIN_IMAGE_BYTES,
  stampStored,
} from '@/lib/media/cache-policy';
import { isAllowedMediaHost, MEDIA_MAX_AGE_SECONDS, MEDIA_PROXY_PATH } from '@/lib/media/hosts';
import { parsePushContent, summarize, type PushContent } from '@/lib/notifications/copy';
import { urlBase64ToUint8Array } from '@/lib/push/webpush';

declare let self: ServiceWorkerGlobalScope;

const CONTENT_URL = '/api/push/content';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/maskable-512.png';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '';

/**
 * The name carries the version on purpose. Bumping it abandons every entry the
 * previous worker wrote, which is how a browser whose cache is already poisoned
 * is fixed without asking its owner to clear anything.
 */
const IMAGE_CACHE = 'bsdc-images-v5';
const FONT_CACHE = 'bsdc-fonts-v2';

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

async function putVerified(cacheName: string, request: Request, response: Response): Promise<void> {
  try {
    const cache = await caches.open(cacheName);
    // A body read twice needs a clone; the original is what the page receives.
    const body = await response.clone().blob();
    if (body.size < MIN_IMAGE_BYTES) {
      // A body that claimed a length and then delivered nothing is a stub, and a
      // stub is how a "successful" response poisons a cache.
      await cache.delete(request);
      return;
    }
    await cache.put(request, new Response(body, { status: 200, headers: stampStored(response) }));
    // Enforce the entry ceiling without waiting for an expiration sweep: the
    // Cache API has no eviction of its own, and a phone that has scrolled a
    // feed for an hour should not be holding a thousand decoded JPEGs.
    const keys = await cache.keys();
    if (keys.length > IMAGE_CACHE_ENTRIES) {
      const excess = keys.length - IMAGE_CACHE_ENTRIES;
      for (const key of keys.slice(0, excess)) await cache.delete(key);
    }
  } catch {
    // Quota, a locked profile, a private window that forbids Cache writes: the
    // picture still paints from the network response. A failed cache write is
    // never a failed picture.
  }
}

/** The response as the page sees it: the worker's own bookkeeping removed. */
function asDelivered(stored: Response): Response {
  return new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers: deliveredHeaders(stored),
  });
}

/** The network, with a deadline, so a stalled connection does not hang a tile. */
async function networkWithDeadline(request: Request): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(request, {
      signal: controller.signal,
      // The worker is the cache. Asking the HTTP cache as well would let a
      // poisoned disk entry survive the eviction above.
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The picture strategy.
 *
 * Fresh entry: serve it and revalidate quietly. That is the fast path and the
 * common one.
 *
 * Stale entry: ask the network first, because a stale entry is a body this
 * worker cannot vouch for. If the network answers with something unstorable,
 * the stale body is still better than nothing while it is inside twice the trust
 * window; past that it is deleted, because a picture that has not been
 * confirmable for two weeks is a picture that is gone.
 *
 * No entry: network, store if verifiable, and otherwise let the request fail to
 * the page, where `MediaImage` runs its ladder.
 */
async function handleImage(event: FetchEvent, request: Request): Promise<Response> {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached && isFresh(cached, IMAGE_TRUST_MS)) {
    // Fresh: answer immediately, and let the network correct the entry in the
    // background. `waitUntil` keeps the worker alive for the revalidation, so a
    // slow host cannot leave a half-finished request behind.
    event.waitUntil(
      (async () => {
        const fresh = await networkWithDeadline(request);
        if (fresh !== null && isStorableImage(fresh)) {
          await putVerified(IMAGE_CACHE, request, fresh);
        }
      })(),
    );
    return asDelivered(cached);
  }

  const response = await networkWithDeadline(request);

  if (response !== null && isStorableImage(response)) {
    await putVerified(IMAGE_CACHE, request, response.clone());
    return response;
  }

  if (cached && isUsableWhenStale(cached, IMAGE_TRUST_MS)) {
    // Unconfirmable right now (the host is down, the member is on a train) but
    // recently good. A stale picture beats an empty tile.
    return asDelivered(cached);
  }

  if (cached) await cache.delete(request);

  if (response !== null) {
    // A real answer the worker will not store: an HTML error page, a 403 from an
    // expired signature. It goes to the page unchanged, and the page's ladder
    // decides what to do about it.
    return response;
  }

  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!isManagedImage(request)) return;
  event.respondWith(handleImage(event, request));
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
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith('bsdc-images') && name !== IMAGE_CACHE)
            .map((name) => caches.delete(name)),
        );
        await self.skipWaiting();
      })(),
    );
  }
  if (asked === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE));
  }
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith('bsdc-images') && name !== IMAGE_CACHE) ||
              (name.startsWith('bsdc-fonts') && name !== FONT_CACHE),
          )
          .map((name) => caches.delete(name)),
      );
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
