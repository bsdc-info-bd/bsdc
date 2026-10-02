import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router-dom';
import { PageSkeleton } from '@/design-system';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

/** Keeps signed-in members away from the login and signup screens. */
export function RequireGuest() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);

  if (status === 'initializing') return <PageSkeleton label={t('common.loading')} />;
  if (status === 'authenticated') return <Navigate to={ROUTES.home} replace />;
  return <Outlet />;
}
