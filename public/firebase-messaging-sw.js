/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/*
 * Firebase Cloud Messaging service worker — background Web Push for BSDC.
 * Served from /firebase-messaging-sw.js and registered by lib/pushNotifications.ts.
 * Handles push messages while the app is closed and focuses/opens BSDC on click.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBNXVLt5eVghQAFySnGEKy6P8H407hwA1E',
  authDomain: 'bsdc-bd.firebaseapp.com',
  projectId: 'bsdc-bd',
  storageBucket: 'bsdc-bd.firebasestorage.app',
  messagingSenderId: '1041487418449',
  appId: '1:1041487418449:web:350786ca8caf66266a9470',
  databaseURL: 'https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app/',
});

try {
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || 'BSDC';
    const body = (payload.notification && payload.notification.body) || 'You have a new update';
    self.registration.showNotification(title, {
      body,
      icon: '/favicon-192.png',
      badge: '/favicon-192.png',
      tag: 'bsdc-push',
      data: { url: (payload.data && payload.data.url) || '/messages' },
    });
  });
} catch (e) {
  // Messaging unsupported in this browser — local notifications still work.
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
