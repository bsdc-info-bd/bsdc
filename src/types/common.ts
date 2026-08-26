/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */

/** Reaction types rendered exclusively with SVG icons — never native emoji. */
export type ReactionType = 'like' | 'love' | 'celebrate' | 'insightful' | 'curious' | 'support' | 'fire';

export const REACTION_TYPES: ReactionType[] = [
  'like',
  'love',
  'celebrate',
  'insightful',
  'curious',
  'support',
  'fire',
];

export type Visibility = 'public' | 'followers' | 'private' | 'group';

export type ThemePreference = 'light' | 'dark';

export type LanguagePreference = 'en' | 'bn';

export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Counters {
  [key: string]: number;
}

/** A public user snapshot embedded in denormalized documents (notifications, chats). */
export interface UserSnapshot {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  isVerified: boolean;
}
