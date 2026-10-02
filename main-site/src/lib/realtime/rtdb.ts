import { getDatabase, ref, type Database, type DatabaseReference } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase';
import { env } from '@/lib/env';

/**
 * Realtime Database carries ephemeral signals only — presence, typing and
 * public counters. Durable data lives in Supabase Postgres. Keeping the RTDB
 * surface this small is what keeps it inside the free tier.
 */
export function getRtdb(): Database {
  return getDatabase(getFirebaseApp(), env.firebase.databaseURL);
}

export const RTDB_PATHS = {
  presence: (uid: string) => `presence/${uid}`,
  presenceRoot: () => 'presence',
  typing: (threadId: string, uid: string) => `typing/${threadId}/${uid}`,
  counter: (scope: string) => `counters/${scope}`,
} as const;

export function rtdbRef(path: string): DatabaseReference {
  return ref(getRtdb(), path);
}
