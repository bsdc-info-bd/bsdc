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

/**
 * A file size a member can act on.
 *
 * Upload limits are the one place a number of bytes has to be read quickly —
 * "10 MB" answers whether the picture will go, "10485760" does not. Units are
 * spelled out in Bangla as well, because a limit written in a language the
 * member is not reading is not a limit.
 */
export function formatBytes(bytes: number, language: Language): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return language === 'bn' ? '০ বাইট' : '0 B';
  }
  const units =
    language === 'bn' ? ['বাইট', 'কেবি', 'এমবি', 'জিবি', 'টিবি'] : ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const formatted = new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-US', {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${units[exponent]}`;
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
