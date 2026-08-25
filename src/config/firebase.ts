/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBNXVLt5eVghQAFySnGEKy6P8H407hwA1E',
  authDomain: 'bsdc-bd.firebaseapp.com',
  projectId: 'bsdc-bd',
  storageBucket: 'bsdc-bd.firebasestorage.app',
  messagingSenderId: '1041487418449',
  appId: '1:1041487418449:web:350786ca8caf66266a9470',
  databaseURL: 'https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app/',
} as const;

function readEnv(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getFirebaseConfig() {
  return {
    // Firebase web client settings are public identifiers. Environment values
    // override these defaults for staging or a different Firebase project.
    apiKey: readEnv('VITE_FIREBASE_API_KEY') || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: readEnv('VITE_FIREBASE_APP_ID') || DEFAULT_FIREBASE_CONFIG.appId,
    databaseURL: readEnv('VITE_FIREBASE_DATABASE_URL') || DEFAULT_FIREBASE_CONFIG.databaseURL,
  };
}

const firebaseConfig = getFirebaseConfig();

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let rtdbInstance: Database | null = null;
let storageInstance: FirebaseStorage | null = null;

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const;
export const firebaseConfigured = requiredConfigKeys.every((key) => Boolean(firebaseConfig[key]));

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
