/**
 * BSDC — src/shared/lib/relativeTime.ts
 * Purpose : Coarse relative-time buckets used by counters, receipts and presence labels.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Separate from date.ts because these strings are short, cached in bundles and used by
 *           translation keys rather than by Intl directly (PART 09.02 copy governance).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A relative-time bucket and its translation key suffix. */
export type RelativeBucket = 'now' | 'minutes' | 'hours' | 'today' | 'yesterday' | 'week' | 'older';

/**
 * Buckets a timestamp for display.
 * @param timestamp epoch milliseconds
 * @param now current epoch milliseconds
 * @returns the bucket that should be rendered
 */
export function bucketRelative(timestamp: number, now: number = Date.now()): RelativeBucket {
  const diff = now - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'now';
  if (diff < hour) return 'minutes';
  if (diff < day) return 'hours';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return 'week';
  return 'older';
}

/**
 * Formats a duration in mm:ss for voice notes and media players.
 * @param seconds duration in seconds
 * @returns zero-padded mm:ss
 */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
