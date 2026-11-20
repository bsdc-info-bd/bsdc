/**
 * Public runtime configuration.
 *
 * Only VITE_* values are read here — they are designed to be shipped in the
 * client bundle. Server-only secrets (service-role keys, passkeys, REST API
 * keys, ImgBB API key) are never imported into the client; Pages Functions read
 * them from `context.env`. See ../../SECURITY.md.
 */
export interface PublicEnv {
  siteUrl: string;
  siteName: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    databaseURL: string;
  };
  supabase: { url: string; publishableKey: string };
  push: {
    /** Firebase Cloud Messaging's key. Kept because a deployment may already hold it. */
    vapidPublicKey: string;
    /** This site's own VAPID key, the one web push is signed with. */
    webPushPublicKey: string;
  };
  oneSignalAppId: string;
}

/**
 * Checks the two values a wrong deployment can actually break, and nothing
 * else — everything else is optional by design, and `isConfigured` below is
 * what decides whether a client is built.
 *
 * This used to run through a schema library. Two checks are not worth 40 kB of
 * validation code on the entry chunk, which every visitor downloads before the
 * first page can paint; the rest of that schema was `z.string()` and always
 * would be.
 */
function validate(value: PublicEnv): PublicEnv {
  let parsed: URL;
  try {
    parsed = new URL(value.siteUrl);
  } catch {
    throw new Error(`BSDC: VITE_SITE_URL is not an absolute URL (received "${value.siteUrl}")`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`BSDC: VITE_SITE_URL must be http or https (received "${value.siteUrl}")`);
  }
  if (value.siteName.trim().length === 0) {
    throw new Error('BSDC: VITE_SITE_NAME must not be empty');
  }
  return value;
}

const raw: PublicEnv = {
  siteUrl: import.meta.env.VITE_SITE_URL ?? 'https://www.bsdc.info.bd',
  siteName: import.meta.env.VITE_SITE_NAME ?? 'Bangladesh Software Development Community',
  firebase: {
    apiKey: import.meta.env.VITE_FB_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FB_PROJECT_ID ?? '',
    storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET ?? '',
    messagingSenderId: import.meta.env.VITE_FB_MSG_SENDER_ID ?? '',
    appId: import.meta.env.VITE_FB_APP_ID ?? '',
    databaseURL: import.meta.env.VITE_FB_DATABASE_URL ?? '',
  },
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  },
  push: {
    vapidPublicKey: import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY ?? '',
    webPushPublicKey: import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '',
  },
  oneSignalAppId: import.meta.env.VITE_ONESIGNAL_APP_ID ?? '',
};

export const env: PublicEnv = validate(raw);

/** Service clients are only constructed when their configuration is present. */
export const isConfigured = {
  firebase: raw.firebase.apiKey.length > 0 && raw.firebase.projectId.length > 0,
  supabase: raw.supabase.url.length > 0 && raw.supabase.publishableKey.length > 0,
  // Push is configured when either this site's VAPID key or Firebase's FCM
  // Web Push certificate key is present.
  push: raw.push.webPushPublicKey.length > 0 || raw.push.vapidPublicKey.length > 0,
  oneSignal: raw.oneSignalAppId.length > 0,
} as const;
