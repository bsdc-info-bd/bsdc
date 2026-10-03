import { isConfigured } from '@/lib/env';
import {
  EMPTY_STATS,
  type Profile,
  type ProfileBackend,
  type ProfileDraft,
  type ProfileFields,
  type ProfileSeed,
  type ProfileStats,
} from './types';

export * from './types';

/**
 * Backend facade.
 *
 * Supabase Postgres is used whenever it is configured; otherwise the Firestore
 * cache answers on its own. Callers see one stable interface either way, and
 * both modules are dynamically imported so neither SDK reaches the initial
 * bundle.
 */
let cached: Promise<ProfileBackend> | null = null;

export function activeBackendName(): 'supabase' | 'firestore' {
  return isConfigured.supabase ? 'supabase' : 'firestore';
}

async function backend(): Promise<ProfileBackend> {
  if (!cached) {
    cached = isConfigured.supabase
      ? import('./supabase-backend').then((module) => module.supabaseProfileBackend)
      : import('./firestore-backend').then((module) => module.firestoreProfileBackend);
  }
  return cached;
}

/** Test helper: drops the memoised backend so configuration can change. */
export function resetProfileBackend(): void {
  cached = null;
}

export async function fetchProfile(uid: string): Promise<Profile | null> {
  return (await backend()).fetchProfile(uid);
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  return (await backend()).fetchProfileByUsername(username);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return (await backend()).isUsernameAvailable(username);
}

export async function saveProfile(uid: string, draft: ProfileDraft): Promise<Profile> {
  const active = await backend();
  const saved = await active.saveProfile(uid, draft);

  // When Postgres owns the data the Firestore copy is refreshed in the
  // background: a cache failure must never fail the write the member made.
  if (active.name === 'supabase' && isConfigured.firebase) {
    void import('./firestore-backend')
      .then((module) => module.firestoreProfileBackend.saveProfile(uid, draft))
      .catch(() => undefined);
  }

  return saved;
}

export async function updateProfileFields(uid: string, fields: ProfileFields): Promise<void> {
  const active = await backend();
  await active.updateProfileFields(uid, fields);

  if (active.name === 'supabase' && isConfigured.firebase) {
    void import('./firestore-backend')
      .then((module) => module.firestoreProfileBackend.updateProfileFields(uid, fields))
      .catch(() => undefined);
  }
}

export async function fetchProfileStats(uid: string): Promise<ProfileStats> {
  const active = await backend();
  return active.fetchStats ? active.fetchStats(uid) : EMPTY_STATS;
}

/**
 * The display name a bootstrap row can carry on a member's behalf: their
 * sign-up name if they gave one, otherwise the part of their email before the
 * @, otherwise a neutral word. Always 1–60 characters so the row satisfies
 * the database check.
 */
export function bootstrapDisplayName(user: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const fromName = (user.displayName ?? '').trim();
  if (fromName.length > 0) return fromName.slice(0, 60);
  const local = (user.email ?? '').split('@')[0]?.trim() ?? '';
  if (local.length > 0) return local.slice(0, 60);
  return 'Member';
}

/**
 * First-sign-in bootstrap: makes sure the member has a row, so the database
 * always has the foreign-key target every write points at. A no-op when the
 * active backend has no bootstrap of its own or the row already exists.
 */
export async function ensureProfile(uid: string, seed: ProfileSeed): Promise<void> {
  const active = await backend();
  if (active.ensureProfile) await active.ensureProfile(uid, seed);
}
