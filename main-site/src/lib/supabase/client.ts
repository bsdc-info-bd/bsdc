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
async function currentAccessToken(): Promise<string | null> {
  if (!isConfigured.firebase) return null;
  const { getFirebaseAuth } = await import('@/lib/firebase');
  const auth = getFirebaseAuth() as ReturnType<typeof getFirebaseAuth> & {
    authStateReady?: () => Promise<void>;
  };
  await auth.authStateReady?.();
  const user = auth.currentUser;
  if (!user) return null;
  const { ensureDataAccess } = await import('@/lib/auth/data-access');
  const token = await ensureDataAccess(user);
  // Never send a previous account's token after a sign-out/account switch.
  if (auth.currentUser !== user) throw new Error('auth/required');
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
export async function supabaseAccessToken(): Promise<string> {
  return (await currentAccessToken()) ?? '';
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
 * Hands Realtime the current Firebase token. For account-scoped subscriptions,
 * require that exact Firebase user throughout the async token refresh and
 * setAuth. Swallowing a failure here could otherwise join with the previous
 * account's cached socket token. Calls without an expected uid retain the
 * best-effort behavior needed by anonymous diagnostics.
 */
export async function ensureRealtimeAuth(expectedUid?: string): Promise<void> {
  if (!isConfigured.supabase) {
    if (expectedUid !== undefined) throw new SupabaseNotConfiguredError();
    return;
  }
  try {
    if (expectedUid !== undefined && !isConfigured.firebase) throw new Error('auth/required');
    const auth =
      expectedUid === undefined ? null : (await import('@/lib/firebase')).getFirebaseAuth();
    const user = auth?.currentUser ?? null;
    if (expectedUid !== undefined && user?.uid !== expectedUid) throw new Error('auth/required');
    const token = await currentAccessToken();
    if (
      expectedUid !== undefined &&
      (token === null || token.length === 0 || auth?.currentUser !== user)
    ) {
      throw new Error('auth/required');
    }
    if (token !== null && token.length > 0) await getSupabase().realtime.setAuth(token);
    if (expectedUid !== undefined && auth?.currentUser !== user) throw new Error('auth/required');
  } catch (error) {
    if (expectedUid !== undefined) throw error;
    // Anonymous diagnostics and other best-effort callers can keep polling.
  }
}

/** Test and sign-out helper: forces the next call to build a fresh client. */
export function resetSupabase(): void {
  client = null;
}
