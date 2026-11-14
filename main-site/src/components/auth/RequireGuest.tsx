import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, PageSkeleton } from '@/design-system';
import { sanitizeRedirect } from '@/lib/auth/redirect';
import { isProfileOnboarded } from '@/lib/profile/types';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

function isOnboardingTarget(next: string | null): boolean {
  if (!next) return false;
  const trimmed = next.trim();
  return (
    trimmed === ROUTES.onboarding ||
    trimmed.startsWith(`${ROUTES.onboarding}?`) ||
    trimmed.startsWith(`${ROUTES.onboarding}/`)
  );
}

/** Keeps signed-in members away from the login and signup screens. */
export function RequireGuest() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const profileLoaded = useAuthStore((state) => state.profileLoaded);
  const redirectResolving = useAuthStore((state) => state.redirectResolving);
  const profile = useProfileStore((state) => state.profile);
  const profileError = useProfileStore((state) => state.error);
  const [params] = useSearchParams();
  const [retrying, setRetrying] = useState(false);

  if (status === 'initializing' || redirectResolving) {
    return <PageSkeleton label={t('common.loading')} />;
  }

  if (status === 'authenticated') {
    if (!profileLoaded) return <PageSkeleton label={t('common.loading')} />;

    // Never drop an authenticated user onto onboarding just because loading
    // their existing profile hit a transient error: offer an explicit retry.
    if (profileError && !profile) {
      return (
        <div className="fab-container flex justify-center py-10">
          <Card className="w-full max-w-md space-y-4">
            <Alert tone="warning" title={t('auth.profileSync.title')}>
              {t('auth.profileSync.body')}
            </Alert>
            <div className="grid gap-2">
              <Button
                block
                loading={retrying}
                iconStart={<RefreshCw size={16} />}
                onClick={() => {
                  setRetrying(true);
                  void import('@/lib/auth/session')
                    .then(({ retryProfileSync }) => retryProfileSync())
                    .finally(() => setRetrying(false));
                }}
              >
                {t('auth.profileSync.retry')}
              </Button>
              <Link to={ROUTES.home}>
                <Button variant="secondary" block>
                  {t('auth.profileSync.continueHome')}
                </Button>
              </Link>
              <Button
                variant="ghost"
                block
                onClick={() => {
                  void import('@/lib/auth/sign-out').then(({ signOutNow }) => signOutNow());
                }}
              >
                {t('auth.signOut')}
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    const onboarded = isProfileOnboarded(profile);
    const requestedNext = params.get('next');
    const safeNext = onboarded && isOnboardingTarget(requestedNext) ? null : requestedNext;
    const destination = sanitizeRedirect(safeNext, onboarded ? ROUTES.home : ROUTES.onboarding);
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
