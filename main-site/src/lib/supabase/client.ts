import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isConfigured } from '@/lib/env';
import type { Database } from './types';

/**
 * Supabase Postgres is the source of truth. Identity stays with Firebase: the
 * client hands PostgREST the current Firebase ID token, so row level security
 * sees the member through `bsdc.current_uid()`.
 *
 * The client is created lazily and this module is only ever reached through a
 * dynamic import, which keeps supabase-js out of the initial bundle.
 */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured for this deployment');
    this.name = 'SupabaseNotConfiguredError';
  }
}

export type BsdcSupabaseClient = SupabaseClient<Database>;

let client: BsdcSupabaseClient | null = null;

/** Reads the caller's Firebase ID token without importing Firebase eagerly. */
async function currentAccessToken(): Promise<string> {
  if (!isConfigured.firebase) return '';
  const { getFirebaseAuth } = await import('@/lib/firebase');
  const user = getFirebaseAuth().currentUser;
  if (!user) return '';
  return user.getIdToken();
}

export function getSupabase(): BsdcSupabaseClient {
  if (!isConfigured.supabase) throw new SupabaseNotConfiguredError();
  if (client) return client;

  client = createClient<Database>(env.supabase.url, env.supabase.publishableKey, {
    accessToken: currentAccessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-bsdc-app': 'main-site' } },
    db: { schema: 'public' },
  });

  return client;
}

/** Test and sign-out helper: forces the next call to build a fresh client. */
export function resetSupabase(): void {
  client = null;
}
