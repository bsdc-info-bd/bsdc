import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

/**
 * Shown to signed-in members whose address is still unverified. It is a
 * reminder, never a blocker — reading the community stays open.
 */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status !== 'authenticated' || !user || user.emailVerified) return null;
  if (location.pathname.startsWith('/auth/')) return null;

  return (
    <div role="status" className="border-b border-border bg-warn/10">
      <div className="fab-container flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span>{t('auth.banner.unverified')}</span>
        <Link to={ROUTES.verify} className="font-semibold text-green-700 underline">
          {t('auth.banner.action')}
        </Link>
      </div>
    </div>
  );
}
