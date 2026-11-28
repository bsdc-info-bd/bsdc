/// <reference lib="webworker" />
/**
 * Push-only service worker for BSDC.
 *
 * All offline precaching, offline shell routing, and image/feed fetch
 * caching have been removed from the website so every page, feed query,
 * and image request goes directly through the browser's live network stack.
 *
 * When upgrading from an earlier offline-caching worker, `install` and
 * `activate` delete any leftover Workbox/image/font caches immediately.
 */
import { getMessaging } from 'firebase/messaging/sw';
import { initializeApp } from 'firebase/app';
import { isFirebasePushPayload, readPushPayload } from '@/lib/push/payload';
import {
  notificationBody,
  notificationTag,
  notificationTitle,
  parsePushContent,
  summarize,
  type PushContent,
} from '@/lib/notifications/copy';
import { urlBase64ToUint8Array } from '@/lib/push/webpush';

declare let self: ServiceWorkerGlobalScope;
declare const __BSDC_FIREBASE_CONFIG__: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL: string;
};

const CONTENT_URL = '/api/push/content';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/maskable-512.png';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '';

const LEGACY_CACHE_PREFIXES: readonly string[] = ['bsdc-images', 'bsdc-fonts', 'workbox-'];

// Firebase's service-worker messaging integration is what understands FCM's
// envelope and owns its background notification/click lifecycle. Do not claim
// FCM capability unless this SDK was actually initialized in the installed SW.
let fcmEnabled = false;
try {
  if (
    __BSDC_FIREBASE_CONFIG__.apiKey &&
    __BSDC_FIREBASE_CONFIG__.projectId &&
    __BSDC_FIREBASE_CONFIG__.messagingSenderId &&
    __BSDC_FIREBASE_CONFIG__.appId
  ) {
    const app = initializeApp(__BSDC_FIREBASE_CONFIG__, 'bsdc-push-worker');
    getMessaging(app);
    fcmEnabled = true;
  }
} catch {
  // Web Push remains available if this deployment lacks usable Firebase config.
}

async function purgeLegacyOfflineCaches(): Promise<void> {
  try {
    const names = await caches.keys();
    const stale = names.filter((name) =>
      LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    );
    await Promise.all(stale.map((name) => caches.delete(name)));
  } catch {
    // Storage access may be restricted in private/embedded browser contexts.
  }
}

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await purgeLegacyOfflineCaches();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await purgeLegacyOfflineCaches();
      await self.clients.claim();
    })(),
  );
});

// ------------------------------------------------------------------- push ---

interface ContentAnswer {
  ok: boolean;
  items: PushContent[];
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
    return { ok: false, items: [] };
  }
}

function language(): 'bn' | 'en' {
  const tag = (self.navigator?.language ?? 'bn').toLowerCase();
  return tag.startsWith('en') ? 'en' : 'bn';
}

function isOrderAlarmUrl(url: string): boolean {
  return /[?&]alarm=new(?:&|#|$)/.test(url);
}

async function show(
  title: string,
  body: string,
  url: string,
  tag: string,
  icon?: string,
): Promise<void> {
  const alarm = isOrderAlarmUrl(url);
  const options: NotificationOptions & {
    renotify?: boolean;
    requireInteraction?: boolean;
    vibrate?: number[];
  } = {
    body,
    tag,
    icon: icon !== undefined && icon.length > 0 ? icon : ICON,
    badge: BADGE,
    lang: language(),
    dir: 'ltr',
    silent: false,
    renotify: alarm,
    requireInteraction: alarm,
    data: { url, alarm },
  };
  if (alarm) {
    options.vibrate = [400, 200, 400, 200, 600];
  }
  await self.registration.showNotification(title, options);
}

async function notifyOpenClients(url: string, tag: string): Promise<void> {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'bsdc:notification', url, tag });
    }
  } catch {
    // Client messaging is best-effort alongside showing the OS notification.
  }
}

async function handlePush(event: PushEvent): Promise<void> {
  // The Firebase SDK owns FCM pushes while no tab is visible (including its
  // background notification and click handling). In a visible tab, it forwards
  // the message to the page; show the same BSDC notification style used by
  // Web Push and notify the page so its inbox can refresh.
  if (fcmEnabled && isFirebasePushPayload(event.data)) {
    const payload = readPushPayload(event.data, self.location.origin);
    if (payload === null) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!windows.some((client) => client.visibilityState === 'visible')) return;
    await Promise.all([
      show(
        payload.title,
        payload.body,
        payload.url,
        payload.tag || `bsdc-fcm-${Date.now()}`,
        payload.icon,
      ),
      notifyOpenClients(payload.url, payload.tag),
    ]);
    return;
  }

  const payload = readPushPayload(event.data, self.location.origin);
  if (payload !== null) {
    await Promise.all([
      show(
        payload.title,
        payload.body,
        payload.url,
        payload.tag || `bsdc-push-${Date.now()}`,
        payload.icon,
      ),
      notifyOpenClients(payload.url, payload.tag),
    ]);
    return;
  }

  const subscription = await self.registration.pushManager.getSubscription();
  if (subscription === null) return;

  const answer = await fetchContent(subscription.endpoint);

  if (answer.ok && answer.items.length === 0) return;

  const alarmItems = answer.items.filter((item) => isOrderAlarmUrl(item.url));
  const otherItems = answer.items.filter((item) => !isOrderAlarmUrl(item.url));

  for (const item of alarmItems) {
    await show(
      notificationTitle(item),
      notificationBody(item),
      item.url,
      notificationTag(item),
      item.actorAvatar,
    );
    await notifyOpenClients(item.url, notificationTag(item));
  }

  const summary = summarize(otherItems);
  if (summary !== null) {
    await Promise.all([
      show(summary.title, summary.body, summary.url, `bsdc-summary-${Date.now()}`),
      notifyOpenClients(summary.url, 'bsdc-summary'),
    ]);
    return;
  }

  if (otherItems.length > 0) {
    for (const item of otherItems) {
      await show(
        notificationTitle(item),
        notificationBody(item),
        item.url,
        notificationTag(item),
        item.actorAvatar,
      );
    }
    await notifyOpenClients(otherItems[0]!.url, notificationTag(otherItems[0]!));
    return;
  }

  if (alarmItems.length > 0) return;

  await Promise.all([
    show(
      language() === 'en' ? 'BSDC' : 'বিএসডিসি',
      language() === 'en'
        ? 'Something new is waiting for you.'
        : 'আপনার জন্য নতুন কিছু অপেক্ষা করছে।',
      '/notifications',
      `bsdc-wake-${Date.now()}`,
    ),
    notifyOpenClients('/notifications', 'bsdc-wake'),
  ]);
}

self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(handlePush(event));
});

/**
 * What this worker can be woken by, answered to the page that asked.
 *
 * The page holds the sign-in session and the build-time configuration, but it
 * cannot know what the *installed* worker was compiled with, and a worker is not
 * replaced the moment a new build ships. So the question goes to the worker: the
 * answer decides whether `VITE_PUSH_TRANSPORT=fcm` is honoured or declined with a
 * reason. Web Push stays supported in every build. Firebase Messaging is bundled
 * into this worker and initialized only when the production Firebase config
 * exists; asking for an FCM subscription without that listener would produce
 * exactly the silent, working-looking failure this exchange exists to prevent.
 */
const CAPABILITIES: readonly string[] = fcmEnabled ? ['webpush', 'fcm'] : ['webpush'];

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type !== 'BSDC_PUSH_CAPABILITIES_REQUEST') return;
  try {
    (event.source as Window | null)?.postMessage({
      type: 'BSDC_PUSH_CAPABILITIES',
      transports: CAPABILITIES,
    });
  } catch {
    // A client that closed between asking and being answered has nothing to hear.
  }
});

function urlOf(notification: Notification): string {
  const data = notification.data as { url?: unknown } | undefined;
  const url = typeof data?.url === 'string' ? data.url : '/notifications';
  return url.startsWith('/') ? url : '/notifications';
}

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
      // A tab with unsaved composer work can decline navigation; open a new tab instead.
    }
  }

  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data = event.notification.data as Record<string, unknown> | null;
  // Firebase wraps its notification payload in FCM_MSG and handles its own
  // click target. Leave that event to the SDK rather than navigating twice.
  if (fcmEnabled && data !== null && typeof data === 'object' && 'FCM_MSG' in data) return;
  const url = urlOf(event.notification);
  event.notification.close();
  event.waitUntil(openTarget(url));
});

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  void event.notification.tag;
});

interface SubscriptionChange {
  oldSubscription?: PushSubscription | null;
  newSubscription?: PushSubscription | null;
  waitUntil(promise: Promise<unknown>): void;
}

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const change = event as Event & SubscriptionChange;
  change.waitUntil(
    (async () => {
      let replacement = change.newSubscription ?? null;
      if (replacement === null) {
        const oldKey = change.oldSubscription?.options?.applicationServerKey;
        let publicKey = VAPID_PUBLIC_KEY;
        if (!oldKey && publicKey.length === 0) {
          try {
            const res = await fetch('/api/push/config', { cache: 'no-store' });
            if (res.ok) {
              const cfg = (await res.json()) as { vapidPublicKey?: unknown };
              if (typeof cfg.vapidPublicKey === 'string') publicKey = cfg.vapidPublicKey.trim();
            }
          } catch {
            return;
          }
        }
        if (!oldKey && publicKey.length === 0) return;
        try {
          replacement = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: oldKey ?? urlBase64ToUint8Array(publicKey),
          });
        } catch {
          // Permission may be revoked while closed; app handles re-opt-in when opened.
          return;
        }
      }

      // A service worker has no authenticated Supabase session. Do not pretend
      // this replacement is saved: hand off to an open signed-in page, whose
      // usePush hook can call register_push_subscription. If no page is open,
      // its normal mount-time registration repairs the endpoint next visit.
      if (replacement !== null) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
          client.postMessage({ type: 'BSDC_PUSH_SUBSCRIPTION_CHANGED' });
        }
      }
    })(),
  );
});
