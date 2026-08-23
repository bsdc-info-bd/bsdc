/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { completeRedirectIfPending, ensureUserProfile, watchAuthState } from '@/lib/auth';
import { initOneSignal } from '@/config/onesignal';
import { initPresence } from '@/lib/realtime';
import { claimDailyLoginIfDue } from '@/lib/points';

/**
 * Single auth bootstrap — runs once from <App/>. Wires Firebase auth state into
 * the global auth store, ensures the Firestore profile exists, bootstraps the
 * superadmin role, presence and OneSignal.
 */
export function useAuthBootstrap(): void {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let unsubscribePresence: (() => void) | null = null;
    let cancelled = false;

    void completeRedirectIfPending().finally(() => {
      unsubscribe = watchAuthState(async (user) => {
        if (!user) {
          useAuthStore.setState({ authUser: null, profile: null, stage: 'signedOut' });
          return;
        }
        useAuthStore.setState({ authUser: user, stage: 'loading' });
        try {
          const profile = await ensureUserProfile(user);
          if (cancelled) return;
          useAuthStore.setState({ profile, stage: 'ready' });
          unsubscribePresence?.();
          unsubscribePresence = initPresence(user.uid);
          void initOneSignal();
          void claimDailyLoginIfDue(profile.uid, profile.streak, profile.lastLoginDay).then((r) => {
            if (r.awarded) useAuthStore.getState().patchProfile({ streak: r.streak });
          });
        } catch {
          if (!cancelled) useAuthStore.setState({ profile: null, stage: 'ready' });
        }
      });
    });

    // Runs once per mount: the auth listener itself re-fires on every auth-state change.
    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribePresence?.();
    };
  }, []);
}

export function useAuth() {
  return useAuthStore();
}
