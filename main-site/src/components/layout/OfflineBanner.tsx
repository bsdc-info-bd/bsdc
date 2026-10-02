import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';

/** Persistent, polite notice while the device has no connection. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-warn/15 px-3 py-1.5 text-xs font-semibold text-text"
    >
      <CloudOff size={14} aria-hidden="true" />
      <span>{t('errors.offlineTitle')}</span>
    </div>
  );
}
