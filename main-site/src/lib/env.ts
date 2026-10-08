import { z } from 'zod';

/**
 * Public runtime configuration.
 *
 * Only VITE_* values are read here — they are designed to be shipped in the
 * client bundle. Server-only secrets (service-role keys, passkeys, REST API
 * keys) are never imported into the client; Pages Functions read them from
 * `context.env`. See ../../SECURITY.md.
 */
const envSchema = z.object({
  siteUrl: z.string().url(),
  siteName: z.string().min(1),
  firebase: z.object({
    apiKey: z.string(),
    authDomain: z.string(),
    projectId: z.string(),
    storageBucket: z.string(),
    messagingSenderId: z.string(),
    appId: z.string(),
    databaseURL: z.string(),
  }),
  supabase: z.object({
    url: z.string(),
    publishableKey: z.string(),
  }),
  push: z.object({ vapidPublicKey: z.string() }),
  oneSignalAppId: z.string(),
  cloudinary: z.object({ cloudName: z.string(), unsignedPreset: z.string() }),
  imgbbApiKey: z.string(),
});

export type PublicEnv = z.infer<typeof envSchema>;

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
  push: { vapidPublicKey: import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY ?? '' },
  oneSignalAppId: import.meta.env.VITE_ONESIGNAL_APP_ID ?? '',
  cloudinary: {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '',
    unsignedPreset: import.meta.env.VITE_CLOUDINARY_UNSIGNED_PRESET ?? '',
  },
  imgbbApiKey: import.meta.env.VITE_IMGBB_API_KEY ?? '',
};

export const env: PublicEnv = envSchema.parse(raw);

/**
 * Both halves of the Cloudinary pair are needed: an unsigned upload without
 * its preset is rejected by the API, so a deployment that has only the cloud
 * name reports "not configured" instead of a generic upload failure.
 */
export function cloudinaryConfigured(cloudName: string, preset: string): boolean {
  return cloudName.length > 0 && preset.length > 0;
}

/** Service clients are only constructed when their configuration is present. */
export const isConfigured = {
  firebase: raw.firebase.apiKey.length > 0 && raw.firebase.projectId.length > 0,
  supabase: raw.supabase.url.length > 0 && raw.supabase.publishableKey.length > 0,
  push: raw.push.vapidPublicKey.length > 0,
  oneSignal: raw.oneSignalAppId.length > 0,
  cloudinary: cloudinaryConfigured(raw.cloudinary.cloudName, raw.cloudinary.unsignedPreset),
  imgbb: raw.imgbbApiKey.length > 0,
} as const;
