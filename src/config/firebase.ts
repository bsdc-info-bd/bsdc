/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'bsdc-bd.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bsdc-bd',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'bsdc-bd.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1041487418449',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app/',
};

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let rtdbInstance: Database | null = null;
let storageInstance: FirebaseStorage | null = null;

/** Firebase is only initialized when the API key is present (avoids crashes in isolated tests). */
export const firebaseConfigured = Boolean(firebaseConfig.apiKey);

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function auth(): Auth {
  if (!authInstance) {
    const a = getFirebaseApp();
    if (!a) throw new Error('Firebase is not configured');
    authInstance = getAuth(a);
  }
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    const a = getFirebaseApp();
    if (!a) throw new Error('Firebase is not configured');
    dbInstance = getFirestore(a);
  }
  return dbInstance;
}

export function rtdb(): Database {
  if (!rtdbInstance) {
    const a = getFirebaseApp();
    if (!a) throw new Error('Firebase is not configured');
    rtdbInstance = getDatabase(a);
  }
  return rtdbInstance;
}

export function storage(): FirebaseStorage {
  if (!storageInstance) {
    const a = getFirebaseApp();
    if (!a) throw new Error('Firebase is not configured');
    storageInstance = getStorage(a);
  }
  return storageInstance;
}
