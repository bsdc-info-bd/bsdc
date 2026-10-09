/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_SITE_NAME?: string;
  readonly VITE_FB_API_KEY?: string;
  readonly VITE_FB_AUTH_DOMAIN?: string;
  readonly VITE_FB_PROJECT_ID?: string;
  readonly VITE_FB_STORAGE_BUCKET?: string;
  readonly VITE_FB_MSG_SENDER_ID?: string;
  readonly VITE_FB_APP_ID?: string;
  readonly VITE_FB_DATABASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_FIREBASE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_PUSH_VAPID_PUBLIC_KEY?: string;
  readonly VITE_ONESIGNAL_APP_ID?: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  readonly VITE_CLOUDINARY_UNSIGNED_PRESET?: string;
  readonly VITE_IMGBB_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
