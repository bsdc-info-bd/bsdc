import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseConfig } from '@/lib/env';

/**
 * Lazy Firebase service access. Everything returns `null` when the client
 * config is absent (e.g. CI builds) — callers must handle that explicitly
 * instead of crashing.
 *
 * Security model (brief §12): these client identifiers are safe to expose
 * by design; actual data access is gated by Firestore/Storage security
 * rules + App Check, which ship alongside the features that use them.
 */

export function getFirebaseApp(): FirebaseApp | null {
  const config = getFirebaseConfig();
  if (!config) return null;
  return getApps()[0] ?? initializeApp(config);
}

export function getAuthOrNull(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

export function getFirestoreOrNull(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export function getDatabaseOrNull(): Database | null {
  const app = getFirebaseApp();
  return app ? getDatabase(app) : null;
}

export function getStorageOrNull(): FirebaseStorage | null {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}
