import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CorporateEnv } from './env';
import { ensureCorporateDataAccess } from './data-access';

/**
 * One Firebase app and one Supabase client per console. Identity comes from
 * the corporate Firebase project; PostgREST receives that ID token, so row
 * level security sees the staff member through `bsdc.current_uid()` and the
 * browser never holds a privileged key.
 */

export class NotConfiguredError extends Error {
  constructor() {
    super('This console is not configured for the current deployment.');
    this.name = 'NotConfiguredError';
  }
}

let app: FirebaseApp | null = null;
let supabase: SupabaseClient | null = null;
let publicSupabase: SupabaseClient | null = null;

export function getFirebase(env: CorporateEnv): FirebaseApp {
  if (!env.firebase.apiKey) throw new NotConfiguredError();
  if (app) return app;
  const existing = getApps().find((candidate) => candidate.name === 'bsdc-corporate');
  app =
    existing ??
    initializeApp(
      {
        apiKey: env.firebase.apiKey,
        authDomain: env.firebase.authDomain,
        projectId: env.firebase.projectId,
        appId: env.firebase.appId,
        databaseURL: env.firebase.databaseURL,
      },
      'bsdc-corporate',
    );
  return app;
}

export function getCorporateAuth(env: CorporateEnv): Auth {
  return getAuth(getFirebase(env));
}

export function getDb(env: CorporateEnv): SupabaseClient {
  if (!env.supabase.url || !env.supabase.publishableKey) throw new NotConfiguredError();
  if (supabase) return supabase;
  supabase = createClient(env.supabase.url, env.supabase.publishableKey, {
    accessToken: async () => {
      const auth = getCorporateAuth(env);
      const user = auth.currentUser;
      if (!user) return null;
      const token = await ensureCorporateDataAccess(env, user);
      // Never send the previous account's token after a sign-out or switch.
      if (auth.currentUser !== user) throw new Error('Your session changed. Sign in again.');
      return token.token;
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-bsdc-app': env.appId } },
    db: { schema: 'public' },
  });
  return supabase;
}

/** Anonymous-only client for public desks; it never initializes Firebase. */
export function getPublicDb(env: CorporateEnv): SupabaseClient {
  if (!env.supabase.url || !env.supabase.publishableKey) throw new NotConfiguredError();
  if (!publicSupabase) {
    publicSupabase = createClient(env.supabase.url, env.supabase.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-bsdc-app': env.appId } },
      db: { schema: 'public' },
    });
  }
  return publicSupabase;
}

export function watchUser(env: CorporateEnv, handler: (user: User | null) => void): () => void {
  return onIdTokenChanged(getCorporateAuth(env), handler);
}

export async function signIn(env: CorporateEnv, email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getCorporateAuth(env), email.trim(), password);
}

export async function signOut(env: CorporateEnv): Promise<void> {
  await firebaseSignOut(getCorporateAuth(env));
}

export { claimsEndpoints, mediaUploadEndpoints } from './data-access';

export async function getCorporateIdToken(env: CorporateEnv): Promise<string> {
  const auth = getCorporateAuth(env);
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as staff first.');
  const token = await ensureCorporateDataAccess(env, user);
  if (auth.currentUser !== user) throw new Error('Your session changed. Sign in again.');
  return token.token;
}

/** Test helper: forces the next call to build fresh singletons. */
export function resetClients(): void {
  app = null;
  supabase = null;
  publicSupabase = null;
}

export type { User };
