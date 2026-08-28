import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator, type Database } from 'firebase/database';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { config, isFirebaseConfigured } from '@/config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let rtdb: Database | null = null;
let storage: FirebaseStorage | null = null;

export const initFirebase = () => {
  if (app) return { app, auth: auth!, db: db!, rtdb: rtdb!, storage: storage! };

  if (!isFirebaseConfigured()) {
    console.warn(
      '[BSDC] Firebase is not configured. Set VITE_FIREBASE_* environment variables. ' +
      'The app will run in limited mode without backend connectivity.'
    );
    return null;
  }

  app = initializeApp(config.firebase);

  auth = getAuth(app);

  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  rtdb = getDatabase(app, config.firebase.databaseURL || undefined);

  storage = getStorage(app);

  // Emulator support for development
  if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    connectStorageEmulator(storage, 'localhost', 9199);
  }

  return { app, auth, db, rtdb, storage };
};

export const getFirebaseAuth = (): Auth | null => {
  if (!auth) initFirebase();
  return auth;
};

export const getFirestoreDb = (): Firestore | null => {
  if (!db) initFirebase();
  return db;
};

export const getRTDB = (): Database | null => {
  if (!rtdb) initFirebase();
  return rtdb;
};

export const getFirebaseStorage = (): FirebaseStorage | null => {
  if (!storage) initFirebase();
  return storage;
};
