import { formatDistanceToNowStrict, format as formatDate } from 'date-fns';
import { bn as bnLocale, enUS } from 'date-fns/locale';
import type { Language } from '@/i18n';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

/** Converts Latin digits to Bengali digits for Bangla surfaces. */
export function toBengaliDigits(value: string): string {
  return value.replace(/\d/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

export function formatNumber(value: number, language: Language): string {
  const formatted = new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-US').format(value);
  return formatted;
}

/** Bangladeshi Taka, rendered with the ৳ sign in both languages. */
export function formatTaka(value: number, language: Language): string {
  const amount = new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-US', {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(value);
  return amount;
}

export function formatAbsoluteDate(date: Date, language: Language): string {
  return formatDate(date, 'd MMMM yyyy', { locale: language === 'bn' ? bnLocale : enUS });
}

export function formatRelativeTime(date: Date, language: Language): string {
  return formatDistanceToNowStrict(date, {
    addSuffix: true,
    locale: language === 'bn' ? bnLocale : enUS,
  });
}

/** Zero-padded countdown segment, localized per language. */
export function formatCountdownSegment(value: number, language: Language): string {
  const padded = String(Math.max(0, value)).padStart(2, '0');
  return language === 'bn' ? toBengaliDigits(padded) : padded;
}
