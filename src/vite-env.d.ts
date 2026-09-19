/**
 * BSDC — src/vite-env.d.ts
 * Purpose : Typed contract for `import.meta.env` (PART 06.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Typing the environment is what makes `no-unsafe-assignment` enforceable: an untyped
 *           env object is `any`, and `any` is banned (LAW of types).
 *           Only VITE_-prefixed, PUBLIC values are declared here. Anything secret lives in
 *           Firebase Functions configuration and is deliberately absent from this file.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL: string;
  readonly VITE_APP_PREVIEW_URL: string;
  readonly VITE_APP_LAUNCH_DATE: string;
  readonly VITE_DEFAULT_LOCALE: 'bn' | 'en';

  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string;

  readonly VITE_FIREBASE_USE_EMULATOR?: string;

  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  readonly VITE_CLOUDINARY_API_KEY?: string;
  readonly VITE_CLOUDINARY_UNSIGNED_PRESET?: string;
  readonly VITE_IMGBB_API_KEY?: string;
  readonly VITE_ONESIGNAL_APP_ID?: string;
  readonly VITE_ANALYTICS_ENABLED?: string;
  readonly VITE_ENABLE_INDEXNOW?: string;
  readonly VITE_OSM_TILE_URL?: string;
  readonly VITE_OSM_ATTRIBUTION?: string;

  /** Provided by Vite itself. */
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
