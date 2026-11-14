/**
 * Firebase Cloud Messaging (FCM) browser token acquisition and Firestore sync.
 *
 * Loaded dynamically only when push runs via Firebase Cloud Messaging
 * (`VITE_FIREBASE_VAPID_PUBLIC_KEY`) so `firebase/messaging` never enters the
 * initial bundle.
 */
import { env, isConfigured } from '@/lib/env';

export async function getFcmBrowserToken(vapidKey: string): Promise<string | null> {
  if (!isConfigured.firebase || vapidKey.trim().length === 0) return null;
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  const registration = await globalThis.navigator.serviceWorker.ready;
  const { getFirebaseApp } = await import('@/lib/firebase');
  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: vapidKey.trim(),
    serviceWorkerRegistration: registration,
  });
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export async function deleteFcmBrowserToken(): Promise<void> {
  if (!isConfigured.firebase) return;
  try {
    const { deleteToken, getMessaging, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return;
    const { getFirebaseApp } = await import('@/lib/firebase');
    await deleteToken(getMessaging(getFirebaseApp()));
  } catch {
    // Best effort: the server row is still removed via forget_fcm_token.
  }
}

export async function syncFcmTokenToFirestore(
  uid: string,
  tokenHash: string,
  platform: 'web' | 'android' | 'ios',
  language: 'bn' | 'en',
): Promise<void> {
  if (!isConfigured.firebase || !env.firebase.projectId) return;
  try {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const { getDb } = await import('@/lib/firebase');
    await setDoc(
      doc(getDb(), 'devices', uid, 'tokens', tokenHash),
      {
        tokenHash,
        platform,
        language,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Postgres `fcm_tokens` is authoritative; Firestore device cache is best-effort.
  }
}

export async function removeFcmTokenFromFirestore(uid: string, tokenHash: string): Promise<void> {
  if (!isConfigured.firebase || !env.firebase.projectId) return;
  try {
    const { deleteDoc, doc } = await import('firebase/firestore');
    const { getDb } = await import('@/lib/firebase');
    await deleteDoc(doc(getDb(), 'devices', uid, 'tokens', tokenHash));
  } catch {
    // Best-effort Firestore cleanup.
  }
}
