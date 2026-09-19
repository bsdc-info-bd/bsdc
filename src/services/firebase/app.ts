/**
 * BSDC — src/services/firebase/app.ts
 * Purpose : Lazy, single-instance accessors for the Firebase JS SDK.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Every entry point is a dynamic import, so the application shell never downloads the SDK
 *   until a feature actually needs it (PART 25 bundle budget). Initialization happens at most
 *   once per document and is idempotent under React strict mode and Fast Refresh.
 *   Emulator connection is opt-in through VITE_FIREBASE_USE_EMULATOR and is refused in a
 *   production build, so a misconfigured environment can never point production at localhost.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { FIREBASE_OPTIONS, isFirebaseConfigured } from '@/core/config/firebase';
import { AppError } from '@/core/errors/AppError';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Database } from 'firebase/database';

let appPromise: Promise<FirebaseApp> | null = null;
let dbPromise: Promise<Firestore> | null = null;
let authPromise: Promise<Auth> | null = null;
let rtdbPromise: Promise<Database> | null = null;

/** Whether the emulator may be used. Never true in a production bundle. */
const EMULATORS_ENABLED =
  import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true' && !import.meta.env.PROD;

/**
 * Returns the default Firebase app, initialising it on first use.
 * @returns the app instance
 */
export function firebaseApp(): Promise<FirebaseApp> {
  appPromise ??= (async () => {
    if (!isFirebaseConfigured()) {
      throw new AppError('BSDC-NET-005', { reason: 'firebase-options-missing' });
    }
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    return getApps().length === 0 ? initializeApp(FIREBASE_OPTIONS) : getApp();
  })();
  return appPromise;
}

/**
 * Returns the Firestore instance for the configured project.
 * @returns a Firestore client
 */
export function firestoreDb(): Promise<Firestore> {
  dbPromise ??= (async () => {
    const app = await firebaseApp();
    const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
    const db = getFirestore(app);
    if (EMULATORS_ENABLED) connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return db;
  })();
  return dbPromise;
}

/**
 * Returns the Firebase Auth instance with local persistence.
 * @returns an Auth client
 */
export function firebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const app = await firebaseApp();
    const { getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator } =
      await import('firebase/auth');
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    if (EMULATORS_ENABLED)
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    return auth;
  })();
  return authPromise;
}

/**
 * Returns the Realtime Database instance (the ephemeral plane).
 * @returns a Database client
 */
export function realtimeDb(): Promise<Database> {
  rtdbPromise ??= (async () => {
    const app = await firebaseApp();
    const { getDatabase, connectDatabaseEmulator } = await import('firebase/database');
    const url = FIREBASE_OPTIONS.databaseURL;
    const db = url.length > 0 ? getDatabase(app, url) : getDatabase(app);
    if (EMULATORS_ENABLED) connectDatabaseEmulator(db, '127.0.0.1', 9000);
    return db;
  })();
  return rtdbPromise;
}

/**
 * Forgets every cached instance. Used by tests and by a full sign-out of the SDK.
 */
export function resetFirebaseInstances(): void {
  appPromise = null;
  dbPromise = null;
  authPromise = null;
  rtdbPromise = null;
}
