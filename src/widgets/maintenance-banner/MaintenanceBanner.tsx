/**
 * BSDC — src/widgets/maintenance-banner/MaintenanceBanner.tsx
 * Purpose : Announces a scheduled maintenance window (PART 03.05 scheduled windows, F-476).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The banner is dismissible per session and never blocks interaction: it is a status
 *           region, not a modal, so a member can keep reading while it is visible.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { formatDateTime } from '@/shared/lib/date';

/** Props for the banner. */
export interface MaintenanceBannerProps {
  /** ISO start time of the window. */
  readonly startsAt: string;
  /** ISO end time of the window. */
  readonly endsAt: string;
  readonly locale?: ('bn' | 'en') | undefined;
}

/**
 * Renders the maintenance banner.
 * @param props component props
 * @returns a banner element or null once dismissed
 */
export function MaintenanceBanner({
  startsAt,
  endsAt,
  locale = 'bn',
}: MaintenanceBannerProps): React.ReactElement | null {
  const { t } = useTranslation(['common']);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="flex items-start gap-3 border-b border-line bg-[var(--bsdc-warning)]/15 px-4 py-3 text-sm"
      role="status"
    >
      <Icon name="clock" size={18} className="mt-[2px] text-[var(--bsdc-warning)]" />
      <p className="min-w-0 flex-1 text-ink-2" lang={locale}>
        {t('maintenanceWindow', { ns: 'common' })}{' '}
        <strong className="font-semibold text-ink">{formatDateTime(startsAt, locale)}</strong>
        {' — '}
        <strong className="font-semibold text-ink">{formatDateTime(endsAt, locale)}</strong>
      </p>
      <button
        type="button"
        className="bsdc-button"
        data-variant="ghost"
        data-size="xs"
        aria-label={t('dismiss', { ns: 'common' })}
        onClick={(): void => setDismissed(true)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
