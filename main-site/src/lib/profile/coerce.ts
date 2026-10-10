import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  profileSchema,
  type NotificationPrefs,
  type PrivacyPrefs,
  type Profile,
} from './types';

/**
 * Turning a stored row into a profile, without ever throwing the row away.
 *
 * A profile is read on every sign-in, and what the UI does when the read
 * returns nothing is drop the member's picture, name and handle from the
 * screen — the exact symptom of a picture that "disappears later" while the
 * database still has it. So the rule here is that a row which exists is a
 * profile which exists: every field is coerced, clamped or defaulted on its
 * own, and one odd value degrades one field.
 *
 * The columns are not all guarded by the database. `skills` and `interests`
 * are text arrays with no length or element check, so a 40-character skill or
 * an empty string is storable — and a strict schema then rejects the whole
 * row, avatar and all. Those arrays are cleaned here instead.
 */

/** A string field: trimmed, clamped to what the column allows, never null. */
export function coerceText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * A text array: drops what is not a non-empty string, trims and clamps each
 * entry, removes duplicates, and caps the list. The order the member chose is
 * kept, because on a profile it is the order things are displayed in.
 */
export function coerceList(value: unknown, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const item = entry.trim().slice(0, maxItemLength);
    if (item.length === 0 || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** One boolean out of a jsonb blob, falling back to the platform default. */
function flag(value: unknown, key: string, fallback: boolean): boolean {
  if (typeof value !== 'object' || value === null) return fallback;
  const raw = (value as Record<string, unknown>)[key];
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return fallback;
}

export function coerceNotifications(value: unknown): NotificationPrefs {
  return {
    followers: flag(value, 'followers', DEFAULT_NOTIFICATIONS.followers),
    comments: flag(value, 'comments', DEFAULT_NOTIFICATIONS.comments),
    mentions: flag(value, 'mentions', DEFAULT_NOTIFICATIONS.mentions),
    messages: flag(value, 'messages', DEFAULT_NOTIFICATIONS.messages),
    digest: flag(value, 'digest', DEFAULT_NOTIFICATIONS.digest),
  };
}

export function coercePrivacy(value: unknown): PrivacyPrefs {
  return {
    discoverable: flag(value, 'discoverable', DEFAULT_PRIVACY.discoverable),
    showActivity: flag(value, 'showActivity', DEFAULT_PRIVACY.showActivity),
    showEmail: flag(value, 'showEmail', DEFAULT_PRIVACY.showEmail),
  };
}

/** A timestamp: an ISO string when there is one, the epoch when there is not. */
export function coerceTimestamp(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return new Date(0).toISOString();
}

/** The limits the columns themselves carry, so the client and the row agree. */
export const PROFILE_LIMITS = {
  displayName: 60,
  bio: 280,
  location: 80,
  skills: { items: 20, length: 32 },
  interests: { items: 20, length: 32 },
} as const;

export interface ProfileInput {
  uid?: unknown;
  username?: unknown;
  displayName?: unknown;
  bio?: unknown;
  avatarUrl?: unknown;
  coverUrl?: unknown;
  location?: unknown;
  website?: unknown;
  skills?: unknown;
  interests?: unknown;
  language?: unknown;
  onboardingComplete?: unknown;
  notifications?: unknown;
  privacy?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * Builds a profile out of anything a backend can hand over. Returns null only
 * when the row has no uid — when there is genuinely no member to describe.
 */
export function coerceProfile(input: ProfileInput): Profile | null {
  const uid = typeof input.uid === 'string' ? input.uid.trim() : '';
  if (uid.length === 0) return null;

  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const displayName = coerceText(input.displayName, PROFILE_LIMITS.displayName, 'Member');

  return profileSchema.parse({
    uid,
    username,
    displayName,
    bio: coerceText(input.bio, PROFILE_LIMITS.bio),
    avatarUrl: typeof input.avatarUrl === 'string' ? input.avatarUrl.trim() : '',
    coverUrl: typeof input.coverUrl === 'string' ? input.coverUrl.trim() : '',
    location: coerceText(input.location, PROFILE_LIMITS.location),
    website: typeof input.website === 'string' ? input.website.trim() : '',
    skills: coerceList(input.skills, PROFILE_LIMITS.skills.items, PROFILE_LIMITS.skills.length),
    interests: coerceList(
      input.interests,
      PROFILE_LIMITS.interests.items,
      PROFILE_LIMITS.interests.length,
    ),
    language: input.language === 'en' ? 'en' : 'bn',
    onboardingComplete: input.onboardingComplete === true,
    notifications: coerceNotifications(input.notifications),
    privacy: coercePrivacy(input.privacy),
    createdAt: coerceTimestamp(input.createdAt),
    updatedAt: coerceTimestamp(input.updatedAt),
  });
}
