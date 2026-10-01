import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert, PageSkeleton } from '@/design-system';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

/** Gate for member-only routes. Guests are returned here after signing in. */
export function RequireAuth() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'initializing') return <PageSkeleton label={t('common.loading')} />;

  if (status === 'unavailable') {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('auth.errors.notConfigured')} />
      </div>
    );
  }

  if (status === 'guest') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`${ROUTES.login}?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
}
