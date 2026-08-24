/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Native browser notifications & Web Push for BSDC — real and working.
 *
 * Layers:
 *   1. Permission — triggers the REAL native browser prompt (must be called from
 *      a user gesture; browsers refuse otherwise, which is why nothing asked before).
 *   2. Local native notifications — shown through the Service Worker
 *      (`registration.showNotification`) so they work on every platform including
 *      mobile Chrome/Android where `new Notification()` is unavailable.
 *   3. Server push (optional, real) — if `VITE_FIREBASE_VAPID_KEY` is configured,
 *      we register the browser PushSubscription via Firebase Cloud Messaging and
 *      store the FCM token on the user's profile. The Cloud Function in
 *      `functions/` (`onChatMessagePush`) then delivers real background push to
 *      every device token when a chat message arrives.
 */
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { getFirebaseApp, firebaseConfigured } from '@/config/firebase';
import { COL, fsDb } from '@/lib/firestore';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationState(): NotificationState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotificationState;
}

/** Trigger the REAL native permission prompt (call from a click/tap handler). */
export async function requestNotificationPermission(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission as NotificationState;
  try {
    const result = await Notification.requestPermission();
    return result as NotificationState;
  } catch {
    return 'denied';
  }
}

/* ------------------------------------------------------- service worker */

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  try {
    // The PWA plugin serves /sw.js; firebase-messaging-sw.js is separate and
    // registered explicitly for background push.
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  } catch {
    try {
      return (await navigator.serviceWorker.getRegistrations())[0] ?? null;
    } catch {
      return null;
    }
  }
}

export interface NativeNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

/**
 * Show a REAL native notification. Prefers the Service Worker (works on Android
 * Chrome and survives page focus rules); falls back to `new Notification`.
 */
export async function showNativeNotification(options: NativeNotificationOptions): Promise<boolean> {
  const state = getNotificationState();
  if (state !== 'granted') return false;
  const registration = await getServiceWorkerRegistration();
  if (registration) {
    try {
      await registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon-192.png',
        badge: options.badge || '/favicon-192.png',
        tag: options.tag || 'bsdc',
        data: { url: options.url || '/' },
      });
      return true;
    } catch {
      /* fall through to constructor */
    }
  }
  try {
    const n = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/favicon-192.png',
      tag: options.tag || 'bsdc',
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Fire a real test notification (used by Settings to prove it works). */
export async function sendTestNotification(): Promise<boolean> {
  return showNativeNotification({
    title: 'BSDC — notifications are working',
    body: 'You will receive alerts like this for new messages and updates.',
    tag: 'bsdc-test',
    url: '/messages',
  });
}

/* -------------------------------------------------------- web push (FCM) */

let foregroundHandlerBound = false;

/**
 * Register this browser for real Web Push via FCM (requires VAPID key + the
 * firebase-messaging-sw.js service worker). The token is stored on the user
 * profile so the Cloud Function can push to this device.
 */
export async function registerWebPush(uid: string): Promise<{ ok: boolean; token?: string; reason?: string }> {
  if (!firebaseConfigured) return { ok: false, reason: 'Firebase not configured' };
  const supported = await isSupported().catch(() => false);
  if (!supported) return { ok: false, reason: 'Push not supported on this browser' };
  const state = getNotificationState();
  if (state !== 'granted') return { ok: false, reason: 'Notification permission not granted' };

  try {
    const app = getFirebaseApp();
    if (!app) return { ok: false, reason: 'Firebase app unavailable' };
    const swReg = (await getServiceWorkerRegistration()) ?? undefined;
    const messaging = getMessaging(app);
    // With a VAPID key → standard subscription; without it → legacy FCM
    // sender-id subscription (still a real Web Push registration).
    const token = VAPID_PUBLIC_KEY
      ? await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: swReg ?? undefined })
      : await getToken(messaging, { serviceWorkerRegistration: swReg ?? undefined }).catch(() =>
          getToken(messaging, {}),
        );
    if (!token) return { ok: false, reason: 'Could not obtain a push token' };
    await updateDoc(doc(fsDb(), COL.users, uid), {
      pushTokens: arrayUnion(token),
      updatedAt: Date.now(),
    }).catch(() => undefined);

    if (!foregroundHandlerBound) {
      foregroundHandlerBound = true;
      // Messages that arrive while the page is in the foreground.
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || 'BSDC';
        const body = payload.notification?.body || 'You have a new update';
        void showNativeNotification({ title, body, tag: 'bsdc-fcm', url: '/messages' });
      });
    }
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Push registration failed' };
  }
}

/** Remove this browser's push token (Settings → disable). */
export async function unregisterWebPush(uid: string): Promise<void> {
  if (!firebaseConfigured || !VAPID_PUBLIC_KEY) return;
  try {
    const app = getFirebaseApp();
    if (!app) return;
    const messaging = getMessaging(app);
    const token = await getToken(
      messaging,
      VAPID_PUBLIC_KEY ? { vapidKey: VAPID_PUBLIC_KEY } : {},
    ).catch(() => null);
    if (token) {
      await updateDoc(doc(fsDb(), COL.users, uid), {
        pushTokens: arrayRemove(token),
        updatedAt: Date.now(),
      }).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}
