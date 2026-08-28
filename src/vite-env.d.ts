/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_DATABASE_URL: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
  readonly VITE_IMGBB_API_KEY: string;
  readonly VITE_ONESIGNAL_APP_ID: string;
  readonly VITE_ENABLE_MARKETPLACE: string;
  readonly VITE_ENABLE_JOBS: string;
  readonly VITE_ENABLE_MESSAGING: string;
  readonly VITE_ENABLE_CREATOR_PROGRAM: string;
  readonly VITE_ENABLE_ADS: string;
  readonly VITE_ENABLE_GROUPS: string;
  readonly VITE_ENABLE_EVENTS: string;
  readonly VITE_ENABLE_LICENSES: string;
  readonly VITE_USE_EMULATORS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
