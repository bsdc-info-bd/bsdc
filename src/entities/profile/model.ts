/**
 * BSDC — src/entities/profile/model.ts
 * Purpose : The user profile entity: shape, defaults and derived display values.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A profile is created by a Cloud Function on first sign-in, never by the client, so
 *   the `role` field can never be self-granted. The client may edit presentation fields only.
 *   Names are stored twice: the Latin-script name and, optionally, the Bangla name. When a
 *   Bangla name exists and the viewer reads Bangla, that is the name shown.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { DEFAULT_LOCALE, type Locale } from '@/core/config/app';
import { USERNAME } from '@/core/config/limits';
import type { Role } from '@/core/config/permissions';

/** What a profile reveals to whom. */
export interface ProfilePrivacy {
  readonly profileVisibility: 'public' | 'members' | 'private';
  readonly showEmail: boolean;
  readonly showRegion: boolean;
  readonly showLastSeen: boolean;
}

/** A BSDC member profile. */
export interface Profile {
  /** Equals the Firebase Auth uid. */
  readonly id: string;
  readonly uid: string;
  readonly username: string;
  readonly displayName: string;
  readonly displayNameBn: string;
  readonly photoUrl: string;
  readonly headline: string;
  readonly bio: string;
  readonly locale: Locale;
  readonly region: string;
  readonly district: string;
  readonly website: string;
  readonly role: Role;
  readonly verifiedCreator: boolean;
  readonly suspended: boolean;
  readonly skills: readonly string[];
  readonly socialLinks: Readonly<Record<string, string>>;
  readonly privacy: ProfilePrivacy;
  readonly onboardingComplete: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/**
 * Builds the shell of a profile for an account that the mirror has not seen yet.
 * @param uid account id
 * @param overrides fields known from the session
 * @returns a profile with safe defaults
 */
export function emptyProfile(
  uid: string,
  overrides: Partial<Omit<Profile, 'id' | 'uid'>> = {},
): Profile {
  const now = new Date().toISOString();
  return {
    id: uid,
    uid,
    username: '',
    displayName: 'BSDC member',
    displayNameBn: 'BSDC সদস্য',
    photoUrl: '',
    headline: '',
    bio: '',
    locale: DEFAULT_LOCALE,
    region: '',
    district: '',
    website: '',
    role: 'member',
    verifiedCreator: false,
    suspended: false,
    skills: [],
    socialLinks: {},
    privacy: {
      profileVisibility: 'public',
      showEmail: false,
      showRegion: true,
      showLastSeen: true,
    },
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Picks the name to display for a locale.
 * @param profile the profile
 * @param locale viewer locale
 * @returns the Bangla name when available and requested, otherwise the Latin name
 */
export function displayNameFor(profile: Profile, locale: Locale): string {
  if (locale === 'bn' && profile.displayNameBn.trim().length > 0) return profile.displayNameBn;
  return profile.displayName.trim().length > 0 ? profile.displayName : profile.username;
}

/**
 * Derives up to two initials for the avatar fallback.
 * @param profile the profile
 * @param locale viewer locale
 * @returns one or two uppercase characters
 */
export function profileInitials(profile: Profile, locale: Locale): string {
  const name = displayNameFor(profile, locale).trim();
  if (name.length === 0) return 'B';
  const words = name.split(/\s+/).filter((word) => word.length > 0);
  const first = words[0] ?? '';
  const second = words[1] ?? '';
  const firstChar = Array.from(first)[0] ?? 'B';
  if (second.length === 0) return firstChar.toUpperCase();
  return `${firstChar}${Array.from(second)[0] ?? ''}`.toUpperCase();
}

/**
 * Reports whether a username is structurally claimable.
 * @param username candidate handle
 * @returns true when length, charset and the reserved list all pass
 */
export function isUsernameWellFormed(username: string): boolean {
  const value = username.trim().toLowerCase();
  if (value.length < USERNAME.minLength || value.length > USERNAME.maxLength) return false;
  if (!USERNAME.pattern.test(value)) return false;
  return !(USERNAME.reserved as readonly string[]).includes(value);
}

/**
 * Builds the canonical profile route for a handle.
 * @param username profile handle
 * @returns the profile path
 */
export function profileHref(username: string): string {
  return `/u/${username}`;
}
