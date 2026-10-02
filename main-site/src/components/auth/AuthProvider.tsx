import { useEffect, type ReactNode } from 'react';
import { isConfigured } from '@/lib/env';
import { useAuthStore } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

/**
 * Owns the authentication lifecycle: redirect results, session state, custom
 * claims, the profile cache and cross-tab synchronisation. The Firebase SDK is
 * loaded on demand so it never enters the initial bundle.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((state) => state.setSession);
  const setUnavailable = useAuthStore((state) => state.setUnavailable);
  const setProfileLoaded = useAuthStore((state) => state.setProfileLoaded);
  const setProfile = useProfileStore((state) => state.setProfile);
  const setProfileError = useProfileStore((state) => state.setError);

  useEffect(() => {
    if (!isConfigured.firebase) {
      setUnavailable();
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;

    void import('@/lib/auth/session')
      .then(({ startAuthListener }) => {
        if (cancelled) return;
        stop = startAuthListener({
          onSession: setSession,
          onProfile: setProfile,
          onProfileError: setProfileError,
          onProfileSettled: () => setProfileLoaded(true),
        });
      })
      .catch(() => {
        if (!cancelled) setUnavailable();
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [setSession, setUnavailable, setProfile, setProfileError, setProfileLoaded]);

  return <>{children}</>;
}
