import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCountdownSegment } from '@/lib/format';
import type { Language } from '@/i18n';
import { cn } from '@/lib/cn';

export interface CountdownProps {
  /** ISO timestamp of the commercial launch, set by the admin in config. */
  target: string;
  className?: string;
}

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function remainingFrom(targetMs: number, nowMs: number): Remaining {
  const delta = Math.max(0, targetMs - nowMs);
  return {
    days: Math.floor(delta / 86_400_000),
    hours: Math.floor((delta / 3_600_000) % 24),
    minutes: Math.floor((delta / 60_000) % 60),
    seconds: Math.floor((delta / 1000) % 60),
    done: delta === 0,
  };
}

/** Live countdown to the admin-configured launch date. */
export function Countdown({ target, className }: CountdownProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as Language;
  const targetMs = useMemo(() => new Date(target).getTime(), [target]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = remainingFrom(targetMs, now);

  if (remaining.done) {
    return (
      <p className={cn('text-lg font-semibold text-green-700', className)}>{t('countdown.live')}</p>
    );
  }

  const segments = [
    { key: 'days' as const, value: remaining.days },
    { key: 'hours' as const, value: remaining.hours },
    { key: 'minutes' as const, value: remaining.minutes },
    { key: 'seconds' as const, value: remaining.seconds },
  ];

  return (
    <ul className={cn('grid grid-cols-4 gap-1.5 sm:gap-3', className)}>
      {segments.map((segment) => (
        <li
          key={segment.key}
          className="rounded-card border border-border bg-surface px-1 py-2 text-center sm:px-2 sm:py-3"
        >
          <span className="block text-xl font-bold tabular-nums sm:text-3xl">
            {formatCountdownSegment(segment.value, language)}
          </span>
          <span className="mt-0.5 block text-2xs font-semibold uppercase tracking-wide text-muted">
            {t(`countdown.${segment.key}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}
