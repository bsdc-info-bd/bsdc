import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { PageSkeleton } from '@/design-system';
import { sanitizeRedirect } from '@/lib/auth/redirect';
import { useProfileStore } from '@/store/profile-store';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

/** Keeps signed-in members away from the login and signup screens. */
export function RequireGuest() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const profileLoaded = useAuthStore((state) => state.profileLoaded);
  const profile = useProfileStore((state) => state.profile);
  const [params] = useSearchParams();

  if (status === 'initializing') return <PageSkeleton label={t('common.loading')} />;
  if (status === 'authenticated') {
    if (!profileLoaded) return <PageSkeleton label={t('common.loading')} />;
    const destination = sanitizeRedirect(
      params.get('next'),
      profile?.onboardingComplete ? ROUTES.home : ROUTES.onboarding,
    );
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
