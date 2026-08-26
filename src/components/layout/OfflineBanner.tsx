/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useTranslation } from 'react-i18next';
import { WifiOff, Megaphone, X } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useState } from 'react';

export function OfflineBanner() {
  const { t } = useTranslation();
  return (
    <div role="status" className="bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
      <div className="bsdc-container flex items-center gap-2 py-2 text-sm font-medium">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        {t('common.offlineBanner')}
      </div>
    </div>
  );
}

export function AnnouncementBanner() {
  const { t } = useTranslation();
  const settings = useUIStore((s) => s.systemSettings);
  const [dismissed, setDismissed] = useState(false);
  if (!settings.announcementEnabled || !settings.announcementBanner || dismissed) return null;
  return (
    <div role="region" aria-label={t('admin.announcement')} className="bg-brand-600 text-white">
      <div className="bsdc-container flex items-center gap-3 py-2.5">
        <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-left">{settings.announcementBanner}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('common.close')}
          className="bsdc-tap shrink-0 rounded-full p-1.5 hover:bg-white/15"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
