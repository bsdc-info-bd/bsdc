/**
 * Firebase Cloud Messaging (FCM) browser token acquisition and Firestore sync.
 *
 * Loaded dynamically only when push runs via Firebase Cloud Messaging
 * (`VITE_FIREBASE_VAPID_PUBLIC_KEY`) so `firebase/messaging` never enters the
 * initial bundle.
 */
import { env, isConfigured } from '@/lib/env';

export async function supportsFcmBrowser(): Promise<boolean> {
  if (!isConfigured.firebase) return false;
  try {
    return await (await import('firebase/messaging')).isSupported();
  } catch {
    return false;
  }
}

export async function getFcmBrowserToken(
  vapidKey: string,
  registration: ServiceWorkerRegistration,
): Promise<string> {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const { getFirebaseApp } = await import('@/lib/firebase');
  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: vapidKey.trim(),
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('Firebase returned no browser token');
  return token;
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

// Firebase's modular Web SDK has no onTokenRefresh. getToken revalidates its
// cached token; keep only the previously persisted hash for replacement.
export function readRegisteredFcmHash(uid: string): string | null {
  try {
    return localStorage.getItem(`bsdc.push.fcm.${uid}`);
  } catch {
    return null;
  }
}

export function writeRegisteredFcmHash(uid: string, hash: string | null): void {
  try {
    const key = `bsdc.push.fcm.${uid}`;
    if (hash) localStorage.setItem(key, hash);
    else localStorage.removeItem(key);
  } catch {
    // Storage can be disabled; the authoritative registration still succeeded.
  }
}
