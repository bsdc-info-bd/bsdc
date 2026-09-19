/**
 * BSDC — src/services/notifications/tokens.ts
 * Purpose : Web-push registration through Firebase Cloud Messaging.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The FCM SDK is imported dynamically, so a visitor who never enables push never
 *   downloads it. Permission is requested only from a real user gesture, never on load, because a
 *   permission prompt a person did not ask for is the fastest way to lose the permission forever.
 *   The raw token is never stored verbatim: the device document is keyed by a SHA-256 digest of the
 *   token, so a leaked device list is not a leaked push address book.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { VAPID_KEY } from '@/core/config/firebase';
import { AppError } from '@/core/errors/AppError';
import { firebaseApp } from '@/services/firebase/app';
import { firestoreDb } from '@/services/firebase/app';

/** Outcome of a registration attempt. */
export type PushRegistration =
  | { readonly status: 'granted'; readonly tokenDigest: string }
  | { readonly status: 'denied' }
  | { readonly status: 'unsupported' }
  | { readonly status: 'default' };

/**
 * Reports whether this browser can do web push at all.
 * @returns true when service workers, PushManager and Notification all exist
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Reports the current permission state without asking for anything.
 * @returns the permission, or 'unsupported' where notification permissions do not exist
 */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Hashes a token to a stable id with the Web Crypto API.
 * @param token the FCM registration token
 * @returns a hex SHA-256 digest
 */
export async function digestToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Asks for push permission and registers this device with FCM.
 * Must be called from a user gesture: browsers refuse a permission request that was not.
 * @param uid account id
 * @returns the registration outcome
 */
export async function registerPush(uid: string): Promise<PushRegistration> {
  if (!isPushSupported()) return { status: 'unsupported' };
  if (uid.length === 0) return { status: 'denied' };
  if (VAPID_KEY.length === 0) return { status: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { status: 'denied' };
  if (permission === 'default') return { status: 'default' };

  // `getToken` is marked deprecated in Firebase 12 in favour of the installation-id API, which the
  // web SDK exposes behind a different registration model. The token API remains the supported way
  // to obtain an FCM registration token for web push, so the deprecation is recorded here rather
  // than chased into an API this platform does not use.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const { getMessaging, getToken } = await import('firebase/messaging');
  const app = await firebaseApp();
  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see the note above the import
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (token.length === 0) return { status: 'denied' };

  const tokenDigest = await digestToken(token);
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const db = await firestoreDb();
  await setDoc(doc(db, `users/${uid}/devices/${tokenDigest}`), {
    tokenDigest,
    platform: 'web',
    userAgent: navigator.userAgent.slice(0, 200),
    enabled: true,
    registeredAt: serverTimestamp(),
  });
  return { status: 'granted', tokenDigest };
}

/**
 * Removes this device from the push list.
 * @param uid account id
 * @param tokenDigest the digest returned at registration
 * @returns true when the device record was removed
 */
export async function unregisterPush(uid: string, tokenDigest: string): Promise<boolean> {
  if (uid.length === 0 || tokenDigest.length === 0) return false;
  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    await deleteDoc(doc(db, `users/${uid}/devices/${tokenDigest}`));
    return true;
  } catch (error) {
    throw new AppError('BSDC-PUSH-001', { uid }, error);
  }
}

/**
 * Translates a push failure into the BSDC vocabulary.
 * @param error the caught error
 * @returns an AppError
 */
export function pushError(error: unknown): AppError {
  const name = (error as { name?: string }).name;
  if (name === 'NotAllowedError') return new AppError('BSDC-PUSH-001', {}, error);
  return new AppError('BSDC-PUSH-002', {}, error);
}
