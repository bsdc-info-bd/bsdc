import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { z } from 'zod';
import { getDb } from '@/lib/firebase';
import type { Language } from '@/i18n';

/**
 * Lightweight profile cache.
 *
 * Supabase Postgres becomes the source of truth for `users` in Response 3;
 * Firestore holds the small, fast-read profile document plus the username
 * uniqueness index, which is exactly the "small usage only" role the data
 * policy assigns to it. The service interface below does not change when the
 * Supabase writer is added behind it.
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

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function fromDocument(uid: string, data: DocumentData): Profile | null {
  const parsed = profileSchema.safeParse({
    ...data,
    uid,
    createdAt: toIso(data['createdAt']),
    updatedAt: toIso(data['updatedAt']),
  });
  return parsed.success ? parsed.data : null;
}

export async function fetchProfile(uid: string): Promise<Profile | null> {
  const snapshot = await getDoc(doc(getDb(), 'users', uid));
  if (!snapshot.exists()) return null;
  return fromDocument(uid, snapshot.data());
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const normalized = username.trim().toLowerCase();
  const indexSnapshot = await getDoc(doc(getDb(), 'usernames', normalized));
  if (!indexSnapshot.exists()) return null;
  const uid = (indexSnapshot.data() as Record<string, unknown>)['uid'];
  if (typeof uid !== 'string') return null;
  return fetchProfile(uid);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return false;
  const snapshot = await getDoc(doc(getDb(), 'usernames', parsed.data));
  return !snapshot.exists();
}

/**
 * Claims a username and writes the profile atomically, so two members can
 * never end up holding the same handle.
 */
export async function saveProfile(uid: string, draft: ProfileDraft): Promise<Profile> {
  const username = usernameSchema.parse(draft.username);
  const db = getDb();
  const usernameRef = doc(db, 'usernames', username);
  const profileRef = doc(db, 'users', uid);

  await runTransaction(db, async (transaction) => {
    const [usernameSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(usernameRef),
      transaction.get(profileRef),
    ]);

    const ownedByOther =
      usernameSnapshot.exists() &&
      (usernameSnapshot.data() as Record<string, unknown>)['uid'] !== uid;
    if (ownedByOther) throw new Error('profile/username-taken');

    const previousUsername = profileSnapshot.exists()
      ? ((profileSnapshot.data() as Record<string, unknown>)['username'] as string | undefined)
      : undefined;

    if (previousUsername && previousUsername !== username) {
      transaction.delete(doc(db, 'usernames', previousUsername));
    }

    transaction.set(usernameRef, { uid, updatedAt: serverTimestamp() });
    transaction.set(
      profileRef,
      {
        uid,
        username,
        displayName: draft.displayName,
        bio: draft.bio,
        avatarUrl: draft.avatarUrl,
        location: draft.location,
        website: draft.website,
        skills: draft.skills,
        interests: draft.interests,
        language: draft.language,
        onboardingComplete: draft.onboardingComplete,
        createdAt: profileSnapshot.exists()
          ? ((profileSnapshot.data() as Record<string, unknown>)['createdAt'] ?? serverTimestamp())
          : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  const saved = await fetchProfile(uid);
  if (!saved) throw new Error('profile/save-failed');
  return saved;
}

/** Used by the settings screen for partial updates that keep the handle. */
export async function updateProfileFields(
  uid: string,
  fields: Partial<Omit<Profile, 'uid' | 'username' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await setDoc(
    doc(getDb(), 'users', uid),
    { ...fields, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
