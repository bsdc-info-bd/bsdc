/**
 * BSDC — src/core/config/firebase.ts
 * Purpose : Client Firebase options and backend mode, derived from public environment variables.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Every value here is public by design — Firebase web configuration is not a secret and the
 *   real authority lives in Firestore rules, Realtime Database rules and custom claims
 *   (LAW-03). No private key, no service account and no pepper ever appears in this file.
 *   `backendMode` decides how the application behaves when the backend is unreachable:
 *     'remote'  — talk to Firestore and the Realtime Database
 *     'local'   — read and write through the offline mirror only (device-local, still real data)
 *   The mode is chosen automatically at runtime by src/services/backend/gateway.ts; it is never
 *   a build flag, so one bundle serves production, preview and a disconnected device.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Firebase web options. All fields are public. */
export interface FirebasePublicOptions {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
  readonly measurementId: string;
  readonly databaseURL: string;
}

const env = import.meta.env;

/** Public Firebase options for the bsdc-bd project. */
export const FIREBASE_OPTIONS: FirebasePublicOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? '',
};

/** Firebase region constants. They must match firebase.json and the Cloud Functions region. */
export const FIREBASE_REGIONS = {
  firestore: 'asia-south1',
  database: 'asia-southeast1',
  functions: 'asia-south1',
  storage: 'asia-south1',
} as const;

/**
 * Reports whether the public configuration is complete enough to attempt a connection.
 * @returns true when every required option is present
 */
export function isFirebaseConfigured(): boolean {
  return (
    FIREBASE_OPTIONS.apiKey.length > 0 &&
    FIREBASE_OPTIONS.projectId.length > 0 &&
    FIREBASE_OPTIONS.appId.length > 0
  );
}

/** Cloudinary public configuration (durable media, LAW-05). */
export const CLOUDINARY = {
  cloudName: env.VITE_CLOUDINARY_CLOUD_NAME ?? '',
  apiKey: env.VITE_CLOUDINARY_API_KEY ?? '',
  unsignedPreset: env.VITE_CLOUDINARY_UNSIGNED_PRESET ?? '',
  uploadUrl: `https://api.cloudinary.com/v1_1/${env.VITE_CLOUDINARY_CLOUD_NAME ?? ''}/image/upload`,
} as const;

/** ImgBB public configuration (bulk, non-critical media, LAW-05). */
export const IMGBB = {
  apiKey: env.VITE_IMGBB_API_KEY ?? '',
  uploadUrl: 'https://api.imgbb.com/1/upload',
} as const;

/** OneSignal public application id. Manual broadcast only (LAW-09). */
export const ONESIGNAL = {
  appId: env.VITE_ONESIGNAL_APP_ID ?? '',
  /** Broadcasts are composed by a human; nothing in the product sends one automatically. */
  automatedSendingAllowed: false,
} as const;

/** Web-push VAPID key for FCM through Firebase Cloud Messaging. */
export const VAPID_KEY: string = env.VITE_FIREBASE_VAPID_KEY ?? '';
