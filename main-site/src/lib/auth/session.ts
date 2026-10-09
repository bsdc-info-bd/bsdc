import { getRedirectResult, onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { bootstrapDisplayName, ensureProfile, fetchProfile } from '@/lib/profile/profile-service';
import { ensureDataAccess } from '@/lib/auth/data-access';
import { syncRoleWithDatabase } from '@/lib/auth/db-role';
import { authErrorKey } from '@/lib/auth/errors';
import { readClaims } from '@/lib/auth/session-claims';
import { DEFAULT_CLAIMS, type SessionClaims } from '@/store/auth-store';
import type { Profile } from '@/lib/profile/profile-service';

export const AUTH_CHANNEL = 'bsdc.auth';

/**
 * Reads the member's profile, and on the very first sign-in — when no row
 * exists at all — writes the bare bootstrap row first and then reads it back.
 * A bootstrap row has no handle yet, which is a valid profile: onboarding is
 * decided by `onboarding_complete`, not by whether the row can be read, so
 * the member still lands on onboarding and the database has the foreign-key
 * target their first post or comment points at.
 */
async function loadOrBootstrapProfile(user: User): Promise<Profile | null> {
  const existing = await fetchProfile(user.uid);
  if (existing) return existing;
  await ensureProfile(user.uid, { displayName: bootstrapDisplayName(user) }).catch(() => undefined);
  // Read it straight back: the row now exists, and returning it means the
  // member's avatar and preferences are on screen from the first render.
  return fetchProfile(user.uid).catch(() => null);
}

export interface SessionHandlers {
  onSession: (user: User | null, claims: SessionClaims) => void;
  onProfile: (profile: Profile | null) => void;
  onProfileError: (message: string) => void;
  onProfileSettled: () => void;
  onRedirectError: (messageKey: string) => void;
}

/**
 * Subscribes to Firebase authentication and keeps the stores in step. It is
 * imported dynamically so the Firebase SDK stays out of the initial bundle.
 */
export function startAuthListener(handlers: SessionHandlers): () => void {
  const auth = getFirebaseAuth();
  let active = true;
  let generation = 0;
  let readyUser: User | null = null;

  // Completes an OAuth redirect started because a popup was blocked.
  void getRedirectResult(auth).catch((error: unknown) => {
    if (active) handlers.onRedirectError(authErrorKey(error));
  });

  const channel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(AUTH_CHANNEL) : null;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    const currentGeneration = ++generation;
    readyUser = null;
    const isCurrent = () => active && generation === currentGeneration && auth.currentUser === user;
    channel?.postMessage({ type: 'session', uid: user?.uid ?? null });

    if (!user) {
      handlers.onSession(null, DEFAULT_CLAIMS);
      handlers.onProfile(null);
      return;
    }

    // Firebase tokens begin without the custom PostgREST role. Mint the
    // least-privileged claim and force-refresh the token before any profile
    // read/write; otherwise Supabase evaluates the member as `anon` and RLS
    // correctly refuses profile setup with a permission error.
    void ensureDataAccess(user)
      .then(async (token) => {
        if (!isCurrent()) return null;
        readyUser = user;
        const tokenClaims = readClaims(token.claims);
        handlers.onSession(user, tokenClaims);
        const profile = await loadOrBootstrapProfile(user);
        if (!isCurrent()) return { profile, claims: tokenClaims };
        // The database is the authority on rank: it is what the server
        // enforces, and a token can predate a promotion — or, for the first
        // administrator of a deployment, name a rank the token was never
        // minted with. Adopt its answer and repair both sides.
        const claims = await syncRoleWithDatabase(user, tokenClaims);
        if (isCurrent() && claims !== tokenClaims) handlers.onSession(user, claims);
        return { profile, claims };
      })
      .then((result) => {
        if (!isCurrent() || result === null) return;
        handlers.onProfile(result.profile);
        handlers.onProfileSettled();
      })
      .catch(() => {
        if (!isCurrent()) return;
        handlers.onSession(user, DEFAULT_CLAIMS);
        handlers.onProfileError('profile/access-failed');
        handlers.onProfileSettled();
      });
  });

  // Keeps claims fresh after a role change without a full page reload.
  const unsubscribeToken = onIdTokenChanged(auth, (user) => {
    if (!active || !user || readyUser !== user) return;
    const currentGeneration = generation;
    void ensureDataAccess(user)
      .then((token) => {
        if (active && generation === currentGeneration && auth.currentUser === user) {
          handlers.onSession(user, readClaims(token.claims));
        }
      })
      .catch(() => {
        if (active && generation === currentGeneration && auth.currentUser === user) {
          handlers.onProfileError('profile/access-failed');
        }
      });
  });

  if (channel) {
    channel.onmessage = (event: MessageEvent<{ type?: string; uid?: string | null }>) => {
      const currentUid = auth.currentUser?.uid ?? null;
      if (event.data?.type === 'session' && event.data.uid !== currentUid) {
        void auth.currentUser?.reload();
      }
    };
  }

  return () => {
    active = false;
    unsubscribeAuth();
    unsubscribeToken();
    channel?.close();
  };
}
