/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { BaseEntity, LanguagePreference, ThemePreference, UserSnapshot } from './common';
import type { GeoPoint } from '@/lib/geo';

export type UserRole =
  | 'superadmin'
  | 'admin'
  | 'manager'
  | 'moderator'
  | 'verified'
  | 'user'
  | 'restricted'
  | 'banned';

export const ROLE_RANK: Record<UserRole, number> = {
  superadmin: 70,
  admin: 60,
  manager: 50,
  moderator: 40,
  verified: 20,
  user: 10,
  restricted: 5,
  banned: 0,
};

export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export type CreatorProgramStatus = 'none' | 'applied' | 'approved' | 'rejected';

export interface UserProfile extends BaseEntity, UserSnapshot {
  uid: string;
  email: string;
  coverPhoto: string;
  bio: string;
  bioTitle: string;
  location: string;
  geo: GeoPoint | null;
  website: string;
  github: string;
  linkedin: string;
  twitter: string;
  skills: string[];
  education: string;
  work: string;
  joinedAt: number;
  lastActive: number;
  role: UserRole;
  isVerified: boolean;
  isCreator: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  bsdcPoints: number;
  language: LanguagePreference;
  theme: ThemePreference;
  isOnline: boolean;
  emailVerified: boolean;
  creatorProgramStatus: CreatorProgramStatus;
  softwareLicenses: string[];
  profileCompleted: boolean;
  onboardingStep: number;
  provider: string;
  streak: number;
  lastLoginDay: string;
}

/** Minimal fields every profile document must carry; missing ones are defaulted on read. */
export type UserProfileInput = Partial<UserProfile> & Pick<UserProfile, 'uid' | 'email'>;

export function userSnapshotOf(u: UserProfile): UserSnapshot {
  return {
    uid: u.uid,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    isVerified: u.isVerified,
  };
}
