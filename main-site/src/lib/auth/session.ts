import { getRedirectResult, onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { fetchProfile } from '@/lib/profile/profile-service';
import { readClaims } from '@/lib/auth/session-claims';
import { DEFAULT_CLAIMS, type SessionClaims } from '@/store/auth-store';
import type { Profile } from '@/lib/profile/profile-service';

export const AUTH_CHANNEL = 'bsdc.auth';

export interface SessionHandlers {
  onSession: (user: User | null, claims: SessionClaims) => void;
  onProfile: (profile: Profile | null) => void;
  onProfileError: (message: string) => void;
  onProfileSettled: () => void;
}

/**
 * Subscribes to Firebase authentication and keeps the stores in step. It is
 * imported dynamically so the Firebase SDK stays out of the initial bundle.
 */
export function startAuthListener(handlers: SessionHandlers): () => void {
  const auth = getFirebaseAuth();
  let active = true;

  // Completes an OAuth redirect started because a popup was blocked.
  void getRedirectResult(auth).catch(() => undefined);

  const channel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(AUTH_CHANNEL) : null;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    channel?.postMessage({ type: 'session', uid: user?.uid ?? null });

    if (!user) {
      handlers.onSession(null, DEFAULT_CLAIMS);
      handlers.onProfile(null);
      return;
    }

    void user
      .getIdTokenResult()
      .then((token) => {
        if (active) handlers.onSession(user, readClaims(token.claims));
      })
      .catch(() => {
        if (active) handlers.onSession(user, DEFAULT_CLAIMS);
      });

    void fetchProfile(user.uid)
      .then((profile) => {
        if (!active) return;
        handlers.onProfile(profile);
        handlers.onProfileSettled();
      })
      .catch(() => {
        if (!active) return;
        handlers.onProfileError('profile/load-failed');
        handlers.onProfileSettled();
      });
  });

  // Keeps claims fresh after a role change without a full page reload.
  const unsubscribeToken = onIdTokenChanged(auth, (user) => {
    if (!active || !user) return;
    void user.getIdTokenResult().then((token) => {
      if (active) handlers.onSession(user, readClaims(token.claims));
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
