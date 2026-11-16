import { getRedirectResult, onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { clearQueryCache } from '@/lib/query-client';
import { bootstrapDisplayName, ensureProfile, fetchProfile } from '@/lib/profile/profile-service';
import { ensureDataAccess } from '@/lib/auth/data-access';
import { syncRoleWithDatabase } from '@/lib/auth/db-role';
import { authErrorKey } from '@/lib/auth/errors';
import {
  clearPendingOAuthRedirect,
  consumePendingOAuthRedirect,
  hasPendingOAuthRedirect,
} from '@/lib/auth/oauth-state';
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
 *
 * Three answers, because two of them look identical from the outside and are
 * not the same event. `none` is a member with no row: the screen should be
 * empty. `failed` is a read that did not complete — a token still being
 * minted, a moment offline, a database that hiccuped — and the profile already
 * on screen is more true than nothing, so it is left alone. Collapsing the two
 * into one `null` is what made a picture appear at sign-in and vanish a moment
 * later while the database still held it.
 */
export type ProfileOutcome =
  | { kind: 'profile'; profile: Profile }
  | { kind: 'none' }
  | { kind: 'failed' };

async function loadOrBootstrapProfile(user: User): Promise<ProfileOutcome> {
  let existing: Profile | null;
  try {
    existing = await fetchProfile(user.uid);
  } catch {
    return { kind: 'failed' };
  }
  if (existing) return { kind: 'profile', profile: existing };

  try {
    await ensureProfile(user.uid, { displayName: bootstrapDisplayName(user) });
    // Read it straight back: the row now exists, and returning it means the
    // member's avatar and preferences are on screen from the first render.
    const created = await fetchProfile(user.uid);
    return created ? { kind: 'profile', profile: created } : { kind: 'none' };
  } catch {
    return { kind: 'failed' };
  }
}

export interface SessionHandlers {
  onSession: (user: User | null, claims: SessionClaims) => void;
  onProfile: (profile: Profile | null) => void;
  onProfileError: (message: string) => void;
  onProfileSettled: () => void;
  onRedirectError: (messageKey: string) => void;
  onRedirectResolving?: (resolving: boolean) => void;
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
  // Whose profile is on screen. A failed read may keep it, but never for a
  // different member: switching accounts clears it first.
  let publishedUid: string | null = null;
  // Tracks the last signed-in member so switching accounts or signing out
  // clears cached React Query results and stale Supabase auth tokens.
  let lastSessionUid: string | null = null;

  if (hasPendingOAuthRedirect()) handlers.onRedirectResolving?.(true);

  // Completes an OAuth redirect started on mobile/webview or after popup block.
  void getRedirectResult(auth)
    .then((result) => {
      if (!active) return;
      if (result?.user) {
        clearPendingOAuthRedirect();
      } else if (!auth.currentUser && consumePendingOAuthRedirect() !== null) {
        handlers.onRedirectError('auth.errors.redirectLost');
      }
    })
    .catch((error: unknown) => {
      clearPendingOAuthRedirect();
      if (active) handlers.onRedirectError(authErrorKey(error));
    })
    .finally(() => {
      if (active) handlers.onRedirectResolving?.(false);
    });

  const channel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(AUTH_CHANNEL) : null;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    const currentGeneration = ++generation;
    readyUser = null;
    const isCurrent = () => active && generation === currentGeneration && auth.currentUser === user;
    const nextUid = user?.uid ?? null;
    if (lastSessionUid !== null && nextUid !== lastSessionUid) {
      clearQueryCache();
      void import('@/lib/supabase/client')
        .then(({ resetSupabase }) => resetSupabase())
        .catch(() => undefined);
    }
    lastSessionUid = nextUid;
    channel?.postMessage({ type: 'session', uid: nextUid });

    if (!user) {
      handlers.onSession(null, DEFAULT_CLAIMS);
      handlers.onProfile(null);
      publishedUid = null;
      return;
    }

    clearPendingOAuthRedirect();
    handlers.onRedirectResolving?.(false);

    if (publishedUid !== null && publishedUid !== user.uid) {
      // Somebody else's face comes off the screen before theirs is fetched.
      handlers.onProfile(null);
      publishedUid = null;
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
        const outcome = await loadOrBootstrapProfile(user);
        if (!isCurrent()) return { outcome, claims: tokenClaims };
        // The database is the authority on rank: it is what the server
        // enforces, and a token can predate a promotion — or, for the first
        // administrator of a deployment, name a rank the token was never
        // minted with. Adopt its answer and repair both sides.
        const claims = await syncRoleWithDatabase(user, tokenClaims);
        if (isCurrent() && claims !== tokenClaims) handlers.onSession(user, claims);
        return { outcome, claims };
      })
      .then((result) => {
        if (!isCurrent() || result === null) return;
        if (result.outcome.kind === 'profile') {
          handlers.onProfile(result.outcome.profile);
          publishedUid = user.uid;
        } else if (result.outcome.kind === 'none') {
          handlers.onProfile(null);
          publishedUid = user.uid;
        } else {
          // The read did not complete. Say so, and keep what is on screen.
          handlers.onProfileError('profile/access-failed');
        }
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

/**
 * Re-runs Firebase data-access token exchange + Postgres profile hydration for
 * the currently authenticated user after a transient failure. Used by error
 * recovery surfaces so an existing member is never misrouted into onboarding.
 */
export async function retryProfileSync(): Promise<boolean> {
  const [{ useAuthStore }, { useProfileStore }] = await Promise.all([
    import('@/store/auth-store'),
    import('@/store/profile-store'),
  ]);
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    useAuthStore.getState().setSession(null, DEFAULT_CLAIMS);
    useProfileStore.getState().setProfile(null);
    return false;
  }

  useProfileStore.getState().setLoading(true);
  try {
    const { resetSupabase } = await import('@/lib/supabase/client');
    resetSupabase();
  } catch {
    // Ignore when Supabase client is not active.
  }

  try {
    await user.getIdToken(true);
    const token = await ensureDataAccess(user);
    if (auth.currentUser !== user) return false;
    const tokenClaims = readClaims(token.claims);
    useAuthStore.getState().setSession(user, tokenClaims);
    const outcome = await loadOrBootstrapProfile(user);
    if (auth.currentUser !== user) return false;
    const claims = await syncRoleWithDatabase(user, tokenClaims);
    if (auth.currentUser === user && claims !== tokenClaims) {
      useAuthStore.getState().setSession(user, claims);
    }
    if (outcome.kind === 'profile') {
      useProfileStore.getState().setProfile(outcome.profile);
      useAuthStore.getState().setProfileLoaded(true);
      return true;
    }
    if (outcome.kind === 'none') {
      useProfileStore.getState().setProfile(null);
      useAuthStore.getState().setProfileLoaded(true);
      return true;
    }
    useProfileStore.getState().setError('profile/access-failed');
    useAuthStore.getState().setProfileLoaded(true);
    return false;
  } catch {
    if (auth.currentUser === user) {
      useProfileStore.getState().setError('profile/access-failed');
      useAuthStore.getState().setProfileLoaded(true);
    }
    return false;
  }
}
