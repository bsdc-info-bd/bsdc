/**
 * BSDC — src/features/pwa/OfflineBanner.tsx
 * Purpose : Says plainly that the connection is gone, what still works, and what is waiting.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Offline is not an error state and must not look like one. The mirror on the device keeps
 *   the feed, the groups and the messages readable, and the outbox keeps writes queued, so the
 *   honest message is "you are offline, what you do still counts" rather than a red failure.
 *   The banner is the only place that says it, and it disappears by itself the moment the network
 *   comes back, because a banner that has to be dismissed is a banner people stop reading.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import { FLAG_KEYS } from '@/core/config/features';
import { useFlag } from '@/shared/hooks';
import { useOnline } from '@/shared/hooks';
import { pendingCount } from '@/services/offline/outbox';

/** Props for the offline banner. */
export interface OfflineBannerProps {
  readonly locale: Locale;
}

/**
 * Renders the offline banner while the connection is down.
 * @param props component props
 * @returns the banner, or nothing while online
 */
export function OfflineBanner({ locale }: OfflineBannerProps): React.ReactElement | null {
  const { t } = useTranslation('pwa');
  const enabled = useFlag(FLAG_KEYS.pwaOffline);
  const online = useOnline();
  const [queued, setQueued] = useState(0);
  const lang = locale === 'bn' ? 'bn' : 'en';

  useEffect(() => {
    if (online || !enabled) return;
    let active = true;
    const tick = (): void => {
      void pendingCount().then((count) => {
        if (active) setQueued(count);
      });
    };
    tick();
    const timer = window.setInterval(tick, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [online, enabled]);

  if (!enabled || online) return null;

  return (
    <div className="bsdc-pwa__offline" role="status" aria-live="polite">
      <Text as="p" size="sm" lang={lang}>
        {queued > 0 ? t('offline.queued', { count: queued }) : t('offline.body')}
      </Text>
    </div>
  );
}
