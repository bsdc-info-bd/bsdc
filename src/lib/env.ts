/**
 * Typed environment access. Only VITE_-prefixed variables exist here.
 *
 * All Firebase client values are OPTIONAL at build time so CI can build
 * without secrets; features that need Firebase check `isFirebaseConfigured`
 * and degrade explicitly. Server-only secrets are never read client-side
 * (see docs/SECURITY.md).
 */
interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  databaseURL?: string;
}

const env = import.meta.env;

export const firebaseEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
} as const;

export const isFirebaseConfigured = Boolean(
  firebaseEnv.apiKey && firebaseEnv.projectId && firebaseEnv.appId,
);

export function getFirebaseConfig(): FirebaseClientConfig | null {
  if (!isFirebaseConfigured) return null;
  return {
    apiKey: firebaseEnv.apiKey as string,
    authDomain: firebaseEnv.authDomain ?? `${firebaseEnv.projectId}.firebaseapp.com`,
    projectId: firebaseEnv.projectId as string,
    storageBucket: firebaseEnv.storageBucket,
    messagingSenderId: firebaseEnv.messagingSenderId,
    appId: firebaseEnv.appId as string,
    databaseURL: firebaseEnv.databaseURL,
  };
}

export const cloudinaryEnv = {
  cloudName: env.VITE_CLOUDINARY_CLOUD_NAME ?? null,
  uploadPreset: env.VITE_CLOUDINARY_UPLOAD_PRESET ?? null,
} as const;

export const onesignalAppId = env.VITE_ONESIGNAL_APP_ID ?? null;
