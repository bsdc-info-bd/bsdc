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
  const { ensureDataAccess } = await import('@/lib/auth/data-access');
  const token = await ensureDataAccess(user);
  // Never send a previous account's token after a sign-out/account switch.
  if (getFirebaseAuth().currentUser !== user) throw new Error('auth/required');
  return token.token;
}

/**
 * The token every request to this project carries.
 *
 * Exported for the media pipeline, which posts bytes straight at Supabase
 * Storage with an XHR because that is the only way to be told how much of an
 * upload has arrived — and an XHR is not a supabase-js call, so it has to ask
 * for the same token the client would have used.
 */
export function supabaseAccessToken(): Promise<string> {
  return currentAccessToken();
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

/**
 * Hands the Realtime socket a current Firebase ID token.
 *
 * supabase-js sets Realtime's token once, from the `accessToken` callback, and
 * never refreshes it — but a Firebase ID token expires after an hour and a
 * socket that is open all day outlives several of them. Postgres evaluates row
 * level security for every change event it publishes, so an expired token
 * silently stops delivering the member's own rows. Re-authenticating is cheap
 * and idempotent.
 */
export async function ensureRealtimeAuth(): Promise<void> {
  if (!isConfigured.supabase) return;
  const supabase = getSupabase();
  try {
    const token = await currentAccessToken();
    if (token.length > 0) void supabase.realtime.setAuth(token);
  } catch {
    // A signed-out or offline member keeps the socket; the next call retries.
  }
}

/** Test and sign-out helper: forces the next call to build a fresh client. */
export function resetSupabase(): void {
  client = null;
}
