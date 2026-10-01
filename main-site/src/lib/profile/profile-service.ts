import { isConfigured } from '@/lib/env';
import {
  EMPTY_STATS,
  type Profile,
  type ProfileBackend,
  type ProfileDraft,
  type ProfileFields,
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
