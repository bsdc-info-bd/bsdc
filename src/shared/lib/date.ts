/**
 * BSDC — src/shared/lib/date.ts
 * Purpose : Date and time formatting with Bangla and English first-class (PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : dayjs is the canonical date library (ADR-019). The Bangla locale ships with the app
 *           so no network fetch is needed and the calendar works offline.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/bn';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

/** Timezone of Bangladesh — the platform default for scheduling (PART 03.05). */
export const BD_TIMEZONE = 'Asia/Dhaka';

/**
 * Builds a dayjs instance in a given locale.
 * @param value date input
 * @param locale 'bn' or 'en'
 * @returns a locale-aware dayjs instance
 */
export function toDayjs(value: dayjs.ConfigType, locale: 'bn' | 'en' = 'bn'): dayjs.Dayjs {
  return dayjs(value).locale(locale);
}

/**
 * Relative time ("৫ মিনিট আগে" / "5 minutes ago").
 * @param value date input
 * @param locale 'bn' or 'en'
 * @returns humanised relative time
 */
export function fromNow(value: dayjs.ConfigType, locale: 'bn' | 'en' = 'bn'): string {
  return toDayjs(value, locale).fromNow();
}

/**
 * Absolute date in the platform's display format.
 * @param value date input
 * @param locale 'bn' or 'en'
 * @returns formatted date (e.g. ১২ জানুয়ারি ২০২৬)
 */
export function formatDate(value: dayjs.ConfigType, locale: 'bn' | 'en' = 'bn'): string {
  return toDayjs(value, locale).format(locale === 'bn' ? 'D MMMM YYYY' : 'D MMMM YYYY');
}

/**
 * Date and time with minutes.
 * @param value date input
 * @param locale 'bn' or 'en'
 * @returns formatted date and time
 */
export function formatDateTime(value: dayjs.ConfigType, locale: 'bn' | 'en' = 'bn'): string {
  return toDayjs(value, locale).format('D MMM YYYY, HH:mm');
}

/**
 * ISO 8601 with timezone, used for sitemaps, RSS and JSON-LD (PART 10.03).
 * @param value date input
 * @returns ISO string with offset
 */
export function toIsoWithOffset(value: dayjs.ConfigType): string {
  return dayjs(value).tz(BD_TIMEZONE).format();
}

/**
 * RFC-822 date for RSS pubDate (PART 10.04).
 * @param value date input
 * @returns RFC-822 formatted date
 */
export function toRfc822(value: dayjs.ConfigType): string {
  return dayjs(value).utc().format('ddd, DD MMM YYYY HH:mm:ss ZZ');
}

/**
 * Splits a duration into days, hours, minutes and seconds for the launch countdown.
 * @param target future timestamp
 * @param now current timestamp (injectable for tests and SSR safety)
 * @returns a non-negative breakdown
 */
export function countdownParts(
  target: number,
  now: number = Date.now(),
): { days: number; hours: number; minutes: number; seconds: number; total: number; past: boolean } {
  const total = Math.max(0, target - now);
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / (1000 * 60)) % 60;
  const hours = Math.floor(total / (1000 * 60 * 60)) % 24;
  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds, total, past: target - now <= 0 };
}

export { dayjs };
