/**
 * BSDC — src/widgets/countdown/LaunchCountdown.tsx
 * Purpose : Launch countdown driven by admin settings, safe under prerender (PART 03.05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The first paint shows dashes rather than zeros: a countdown that renders 00:00:00 in
 *           the prerendered HTML and then jumps is worse than one that fills in after hydration.
 *           Digits are rendered in Bangla or English following the active locale (PART 09.01).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Card, CardBody } from '@/shared/ui/Card';
import { useCountdown } from '@/shared/hooks';
import { toBanglaNumerals } from '@/shared/lib/number.bn';
import { LAUNCH_DATE } from '@/core/config/app';

/** Props for the countdown. */
export interface LaunchCountdownProps {
  /** Target timestamp in epoch milliseconds. Defaults to the configured launch date. */
  readonly target?: number | undefined;
  readonly showSeconds?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders the launch countdown.
 * @param props component props
 * @returns a countdown card
 */
export function LaunchCountdown({
  target = LAUNCH_DATE.getTime(),
  showSeconds = true,
  className,
}: LaunchCountdownProps): React.ReactElement {
  const { i18n, t } = useTranslation(['countdown']);
  const countdown = useCountdown(target);
  const bn = i18n.resolvedLanguage !== 'en';
  const fmt = (value: number): string => {
    const padded = String(value).padStart(2, '0');
    return bn ? toBanglaNumerals(padded) : padded;
  };

  const units: readonly { readonly label: string; readonly value: string }[] = [
    { label: t('days', { ns: 'countdown' }), value: fmt(countdown.days) },
    { label: t('hours', { ns: 'countdown' }), value: fmt(countdown.hours) },
    { label: t('minutes', { ns: 'countdown' }), value: fmt(countdown.minutes) },
    ...(showSeconds
      ? [{ label: t('seconds', { ns: 'countdown' }), value: fmt(countdown.seconds) }]
      : []),
  ];

  return (
    <Card variant="brand" className={className}>
      <CardBody>
        <p className="text-center text-sm font-semibold opacity-90" lang={bn ? 'bn' : 'en'}>
          {countdown.launched
            ? t('launched', { ns: 'countdown' })
            : t('launching', { ns: 'countdown' })}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center" role="timer" aria-live="off">
          {units.map((unit) => (
            <div key={unit.label} className="rounded-[var(--radius-md)] bg-white/15 px-2 py-3">
              <div
                className="text-2xl font-extrabold tabular-nums md:text-3xl"
                lang={bn ? 'bn' : 'en'}
              >
                {countdown.ready ? unit.value : '--'}
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {unit.label}
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
