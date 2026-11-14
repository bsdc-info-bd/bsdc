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

const CONTENT_URL = '/api/push/content';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/maskable-512.png';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '';

const LEGACY_CACHE_PREFIXES: readonly string[] = ['bsdc-images', 'bsdc-fonts', 'workbox-'];

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

/** A payload, when one was sent. Supports RFC 8291 JSON and FCM shapes. */
interface RawPushPayload {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  icon?: unknown;
  tag?: unknown;
  notification?: {
    title?: unknown;
    body?: unknown;
    icon?: unknown;
    tag?: unknown;
    click_action?: unknown;
  };
  data?: {
    title?: unknown;
    body?: unknown;
    url?: unknown;
    path?: unknown;
    link?: unknown;
    icon?: unknown;
    tag?: unknown;
  };
  fcmOptions?: {
    link?: unknown;
  };
}

interface NormalizedPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
}

function normalizeTargetPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '/notifications';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed.slice(0, 300);
  try {
    const parsed = new URL(trimmed);
    if (parsed.origin === self.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 300);
    }
  } catch {
    // Invalid URL; fall back safely.
  }
  return '/notifications';
}

function readPayload(event: PushEvent): NormalizedPushPayload | null {
  const data = event.data;
  if (data === null || typeof data === 'undefined') return null;
  try {
    const parsed = data.json() as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const raw = parsed as RawPushPayload;
    const title =
      payloadText(raw.title, 120) ||
      payloadText(raw.notification?.title, 120) ||
      payloadText(raw.data?.title, 120);
    if (title.length === 0) return null;

    const body =
      payloadText(raw.body, 240) ||
      payloadText(raw.notification?.body, 240) ||
      payloadText(raw.data?.body, 240);
    const rawUrl =
      payloadText(raw.url, 500) ||
      payloadText(raw.data?.url, 500) ||
      payloadText(raw.data?.path, 500) ||
      payloadText(raw.data?.link, 500) ||
      payloadText(raw.fcmOptions?.link, 500) ||
      payloadText(raw.notification?.click_action, 500);
    const tag =
      payloadText(raw.tag, 80) ||
      payloadText(raw.data?.tag, 80) ||
      payloadText(raw.notification?.tag, 80);
    const icon =
      payloadText(raw.icon, 500) ||
      payloadText(raw.data?.icon, 500) ||
      payloadText(raw.notification?.icon, 500);

    return {
      title,
      body,
      url: normalizeTargetPath(rawUrl),
      tag,
      icon,
    };
  } catch {
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
    silent: false,
    data: { url },
  });
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
  const payload = readPayload(event);
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

  const summary = summarize(answer.items);
  if (summary !== null) {
    await Promise.all([
      show(summary.title, summary.body, summary.url, `bsdc-summary-${Date.now()}`),
      notifyOpenClients(summary.url, 'bsdc-summary'),
    ]);
    return;
  }

  if (answer.items.length > 0) {
    for (const item of answer.items) {
      await show(
        notificationTitle(item),
        notificationBody(item),
        item.url,
        notificationTag(item),
        item.actorAvatar,
      );
    }
    await notifyOpenClients(answer.items[0]!.url, notificationTag(answer.items[0]!));
    return;
  }

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
  const url = urlOf(event.notification);
  event.notification.close();
  event.waitUntil(openTarget(url));
});

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  void event.notification.tag;
});

interface SubscriptionChange {
  newSubscription?: PushSubscription | null;
  waitUntil(promise: Promise<unknown>): void;
}

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const change = event as Event & SubscriptionChange;
  change.waitUntil(
    (async () => {
      if (change.newSubscription) return;
      let publicKey = VAPID_PUBLIC_KEY;
      if (publicKey.length === 0) {
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
      if (publicKey.length === 0) return;
      try {
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch {
        // Permission may be revoked while closed; app handles re-opt-in when opened.
      }
    })(),
  );
});
