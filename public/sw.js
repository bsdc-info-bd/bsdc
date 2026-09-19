/**
 * BSDC — public/sw.js
 * Purpose : Service worker for the offline experience (PART 16.1, PART 26).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   - App-shell caching: the shell and locale dictionaries are precached, content is network-first.
 *   - Navigation fallback: an offline navigation is served /offline from cache, never a blank page.
 *   - Fail-open: any cache failure falls through to the network. A broken cache must never break
 *     the app.
 *   - No Cloudflare Worker is involved anywhere (PART 05.01): this file is a static asset served
 *     by Cloudflare Pages, exactly as intended.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
const VERSION = 'bsdc-shell-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const CONTENT_CACHE = `${VERSION}-content`;

const SHELL_ASSETS = [
  '/',
  '/offline',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/locales/bn/common.json',
  '/locales/en/common.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('bsdc-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'bsdc:skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          void cache.put('/', response.clone());
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match('/offline')) ?? (await cache.match('/')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CONTENT_CACHE);
        const hit = await cache.match(request);
        if (hit !== undefined) return hit;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/locales/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        if (hit !== undefined) {
          void fetch(request)
            .then((response) => (response.ok ? cache.put(request, response.clone()) : undefined))
            .catch(() => undefined);
          return hit;
        }
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
