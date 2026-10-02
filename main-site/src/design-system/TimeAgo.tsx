import { useTranslation } from 'react-i18next';
import type { Language } from '@/i18n';
import { formatAbsoluteDate, formatRelativeTime } from '@/lib/format';

export interface TimeAgoProps {
  date: string | Date;
  className?: string;
}

/** Localized relative timestamp with an absolute value in the tooltip. */
export function TimeAgo({ date, className }: TimeAgoProps) {
  const { i18n } = useTranslation();
  const language = i18n.language as Language;
  const value = typeof date === 'string' ? new Date(date) : date;
  return (
    <time
      dateTime={value.toISOString()}
      title={formatAbsoluteDate(value, language)}
      className={className}
    >
      {formatRelativeTime(value, language)}
    </time>
  );
}
