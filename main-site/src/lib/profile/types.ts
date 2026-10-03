import { z } from 'zod';
import type { Language } from '@/i18n';

/**
 * Profile shape shared by every storage backend.
 *
 * Supabase Postgres is the source of truth; Firestore keeps a small cache for
 * fast reads and offline deployments. Both backends produce exactly the types
 * declared here, so callers never learn which one answered.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'bsdc',
  'rrc',
  'support',
  'help',
  'about',
  'contact',
  'settings',
  'messages',
  'notifications',
  'search',
  'explore',
  'auth',
  'login',
  'signup',
  'api',
  'vendor',
  'marketplace',
  'jobs',
  'moderator',
  'staff',
  'owner',
  'official',
  'system',
  'root',
  'null',
  'undefined',
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(/^[a-z0-9_]+$/)
  .refine((value) => !/^_/.test(value) && !/_$/.test(value))
  .refine((value) => !RESERVED_USERNAMES.has(value));

export const notificationPrefsSchema = z.object({
  followers: z.boolean().default(true),
  comments: z.boolean().default(true),
  mentions: z.boolean().default(true),
  messages: z.boolean().default(true),
  digest: z.boolean().default(true),
});

export const privacyPrefsSchema = z.object({
  discoverable: z.boolean().default(true),
  showActivity: z.boolean().default(true),
  showEmail: z.boolean().default(false),
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export type PrivacyPrefs = z.infer<typeof privacyPrefsSchema>;

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = notificationPrefsSchema.parse({});
export const DEFAULT_PRIVACY: PrivacyPrefs = privacyPrefsSchema.parse({});

export const profileSchema = z.object({
  uid: z.string().min(1),
  username: z.string().min(USERNAME_MIN),
  displayName: z.string().min(1).max(60),
  bio: z.string().max(280).default(''),
  avatarUrl: z.string().url().or(z.literal('')).default(''),
  location: z.string().max(80).default(''),
  website: z.string().url().or(z.literal('')).default(''),
  skills: z.array(z.string().min(1).max(32)).max(20).default([]),
  interests: z.array(z.string().min(1).max(32)).max(20).default([]),
  language: z.enum(['bn', 'en']).default('bn'),
  onboardingComplete: z.boolean().default(false),
  notifications: notificationPrefsSchema.default(DEFAULT_NOTIFICATIONS),
  privacy: privacyPrefsSchema.default(DEFAULT_PRIVACY),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;

export type ProfileDraft = Pick<
  Profile,
  'username' | 'displayName' | 'bio' | 'avatarUrl' | 'location' | 'website' | 'skills' | 'interests'
> & { language: Language; onboardingComplete: boolean };

/** Counters are owned by the database and are read-only in the client. */
export interface ProfileStats {
  followers: number;
  following: number;
  posts: number;
  reputation: number;
}

export const EMPTY_STATS: ProfileStats = { followers: 0, following: 0, posts: 0, reputation: 0 };

/**
 * The least a row needs to exist. The display name is the only field a
 * bootstrap can honestly fill on a member's behalf; their handle stays unset
 * until they choose one in onboarding.
 */
export interface ProfileSeed {
  displayName: string;
}

export interface ProfileBackend {
  readonly name: 'supabase' | 'firestore';
  fetchProfile(uid: string): Promise<Profile | null>;
  fetchProfileByUsername(username: string): Promise<Profile | null>;
  isUsernameAvailable(username: string): Promise<boolean>;
  saveProfile(uid: string, draft: ProfileDraft): Promise<Profile>;
  updateProfileFields(uid: string, fields: ProfileFields): Promise<void>;
  /**
   * Creates the member's row if it is not there yet, and changes nothing if
   * it is. Idempotent by construction. `username` stays null, so the result
   * does not parse into a client `Profile` — by design the member still has
   * to finish onboarding, but the database now has the foreign-key target
   * every write points at.
   */
  ensureProfile?(uid: string, seed: ProfileSeed): Promise<void>;
  fetchStats?(uid: string): Promise<ProfileStats>;
}

export type ProfileFields = Partial<Omit<Profile, 'uid' | 'username' | 'createdAt' | 'updatedAt'>>;
