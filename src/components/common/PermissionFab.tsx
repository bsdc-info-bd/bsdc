/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Permission FAB + /permissions page.
 *
 * Guarantees BSDC can always ASK: a floating bell button appears on every page
 * whenever ANY permission is still in the browser's "default" (never asked)
 * state — one tap opens the permission center whose buttons fire the REAL
 * native prompts. Works signed-in or signed-out.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ShieldCheck } from 'lucide-react';
import { queryPermission } from '@/lib/permissions';
import { getNotificationState } from '@/lib/pushNotifications';
import { SEOHead } from '@/components/seo/SEOHead';
import { PermissionRow } from '@/components/common/PermissionRow';
import { PermissionSoftPrompt } from '@/components/permissions/PermissionSoftPrompt';
import { Button } from '@/components/ui/Button';
import { openPermissionsStandalone } from '@/lib/permissions';
import { inIframe } from '@/lib/permissions';
import { cn } from '@/lib/utils';

/** Floating action button — visible whenever something has not been asked yet. */
export function PermissionFab() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const [mic, loc] = await Promise.all([
        queryPermission('microphone'),
        queryPermission('geolocation'),
      ]);
      const notif = getNotificationState();
      if (cancelled) return;
      setPending(mic === 'prompt' || loc === 'prompt' || notif === 'default');
    }
    void check();
    const interval = window.setInterval(check, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!pending) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('bsdc:open-permissions'))}
      aria-label={t('settings.onboardingTitle')}
      title={t('settings.onboardingTitle')}
      className={cn(
        'bsdc-glow-anim fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full',
        'bg-brand-600 text-white shadow-raised transition-transform hover:scale-110 lg:bottom-6',
      )}
    >
      <Bell className="h-5 w-5" aria-hidden />
      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
        !
      </span>
    </button>
  );
}

/** Full-page permission center at /permissions — always reachable, always asks. */
export function PermissionsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-1 py-6">
      <SEOHead title="Permissions — BSDC" description="Manage microphone, location and notification permissions for BSDC." path="/permissions" noindex />
      <div className="bsdc-surface bsdc-mesh p-6 sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-raised">
          <ShieldCheck className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-center text-xl font-extrabold sm:text-2xl">{t('settings.permissionsTitle')}</h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-neutral-500 dark:text-neutral-400">
          {t('settings.onboardingDesc')}
        </p>
        {inIframe() ? (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{t('settings.onboardingIframeDesc')}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={openPermissionsStandalone}>
              {t('settings.permOpenTab')}
            </Button>
          </div>
        ) : null}
        <div className="mt-6 divide-y divide-surface-light-border dark:divide-surface-dark-border">
          <PermissionRow kind="notifications" />
        </div>
        <div className="mt-4">
          <PermissionSoftPrompt />
        </div>
        <p className="mt-6 text-center text-xs text-neutral-400">
          <Link to="/settings" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('settings.title')}
          </Link>
          {' · '}
          {t('settings.onboardingPrivacy')}
        </p>
      </div>
    </div>
  );
}
