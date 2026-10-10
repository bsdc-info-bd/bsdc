import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { env, isConfigured } from './env';

/**
 * Firebase project "bsdc-bd" powers the main site and the Android app.
 * Corporate apps use the separate "bsdc-second" project.
 *
 * Everything is created lazily so that a deployment without configuration
 * renders an honest error state instead of crashing at import time.
 */
const APP_NAME = 'bsdc-bd';

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super('Firebase is not configured for this deployment');
    this.name = 'FirebaseNotConfiguredError';
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!isConfigured.firebase) throw new FirebaseNotConfiguredError();
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return getApp(APP_NAME);
  return initializeApp(
    {
      apiKey: env.firebase.apiKey,
      authDomain: env.firebase.authDomain,
      projectId: env.firebase.projectId,
      storageBucket: env.firebase.storageBucket,
      messagingSenderId: env.firebase.messagingSenderId,
      appId: env.firebase.appId,
      databaseURL: env.firebase.databaseURL,
    },
    APP_NAME,
  );
}

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  auth.useDeviceLanguage();
  return auth;
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

/**
 * "Keep me signed in" maps to local persistence; otherwise the session ends
 * with the tab. Tokens are never written to localStorage by application code.
 */
export async function applyPersistence(remember: boolean): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    // Private-mode Safari, an in-app browser and a page opened from a file have
    // no usable storage, and the SDK refuses to pick a persistence for them.
    // An in-memory session still signs the member in for this visit, which is
    // the difference between "you will not stay signed in" and a sign-in that
    // fails on a phone and works on a tablet.
    try {
      await setPersistence(auth, inMemoryPersistence);
    } catch {
      // Nothing left to choose; the SDK keeps whatever persistence it had.
    }
  }
}
