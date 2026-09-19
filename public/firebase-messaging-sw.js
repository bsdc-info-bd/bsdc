// BSDC — public/firebase-messaging-sw.js
// Purpose : The Firebase Cloud Messaging service worker for web push.
// Owner   : RRC Development / BSDC Platform Team
// Notes   :
//   This is a browser service worker — a static asset served by Cloudflare Pages. It is not a
//   Cloudflare Worker and contains no request-time logic (ADR-036).
//   The Firebase configuration is read from /messaging-config.js, which the build writes from
//   environment variables. When no project is configured the worker still installs and simply
//   does not register a messaging handler, so a preview or a device-local session never breaks.
//   Notification copy is never composed here: the server sends both languages and the worker
//   picks one from the payload, keeping all copy in the translation dictionaries.
// Licence : Source-available. Re-deployment or rebranding is not permitted.

/* eslint-disable no-undef */

const CONFIG_URL = '/messaging-config.js';

let config = null;

try {
  importScripts(CONFIG_URL);
  config = self.BSDC_MESSAGING_CONFIG ?? null;
} catch {
  config = null;
}

const configured =
  config !== null && typeof config.projectId === 'string' && config.projectId.length > 0;

if (configured) {
  importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });

  firebase.messaging().onBackgroundMessage((payload) => {
    const data = payload.data ?? {};
    const locale = data.locale === 'en' ? 'en' : 'bn';
    const title = (locale === 'bn' ? data.titleBn : data.titleEn) || data.titleBn || 'BSDC';
    const body = (locale === 'bn' ? data.bodyBn : data.bodyEn) || data.bodyEn || '';
    const options = {
      body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge-72.png',
      tag: data.collapseKey || 'bsdc',
      data: { path: data.path || '/notifications' },
    };
    return self.registration.showNotification(title, options);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.path) || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          void client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
