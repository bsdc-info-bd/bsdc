/**
 * The logic behind the telemetry panel, kept out of the component so it can be
 * tested without a browser.
 *
 * The whole job of this file is to make a number hard to trust wrongly. A count
 * with no age, no comparison and no source is the most dangerous object in an
 * operations console, because it looks exactly like a fact.
 */

/** A number is stale after this long, and the panel says so rather than showing it plainly. */
export const STALE_AFTER_SECONDS = 300;

export interface MetricRow {
  key: string;
  label: string;
  unit: string;
  direction: string;
  alert_above: number | null;
  source_table: string | null;
  source_rpc: string | null;
  current_value: number;
  previous_value: number;
  delta: number;
  measured_at: string;
  window_minutes: number;
}

/** How old a measurement is, in whole seconds. */
export function ageInSeconds(measuredAt: string, now: Date): number {
  const then = Date.parse(measuredAt);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - then) / 1000));
}

export interface Freshness {
  seconds: number;
  stale: boolean;
  label: string;
}

/**
 * Whether a number may be shown plainly.
 *
 * The label is deliberately a sentence rather than a colour, because "stale" alone
 * does not tell a reader what to do about it and a colour does not survive a
 * screenshot pasted into an incident channel.
 */
export function freshness(measuredAt: string, now: Date): Freshness {
  const seconds = ageInSeconds(measuredAt, now);
  const stale = seconds > STALE_AFTER_SECONDS;
  return { seconds, stale, label: freshnessLabel(seconds) };
}

export function freshnessLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'age unknown: treat this number as unread';
  if (seconds <= 5) return 'just now';
  if (seconds < 60) return `${String(seconds)} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  return `${String(Math.floor(hours / 24))} days ago`;
}

export type Trend = 'up' | 'down' | 'flat';

export function trend(delta: number): Trend {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

/**
 * The arrow for a delta, and nothing else.
 *
 * A rising number is not automatically bad. `direction` on the metric says which
 * way is the wrong way, and this function refuses to imply a judgement the metric
 * registry has not made.
 */
export function deltaArrow(delta: number): string {
  const t = trend(delta);
  if (t === 'up') return '↑';
  if (t === 'down') return '↓';
  return '·';
}

/** Whether this number is worth a warning, given its own threshold. */
export function isAlarming(row: MetricRow): boolean {
  if (row.alert_above === null) return false;
  return Number(row.current_value) > Number(row.alert_above);
}

/**
 * Whether the movement matters, rather than only the value.
 *
 * A count of zero unresolved errors that rises to one is a new fault; a count of
 * nine hundred that rises to nine hundred and one is not. So the rule is: alarming
 * now, or moved by more than a tenth of its own size.
 */
export function needsAttention(row: MetricRow): boolean {
  if (isAlarming(row)) return true;
  const movement = Math.abs(Number(row.delta));
  const base = Math.max(Math.abs(Number(row.previous_value)), 1);
  return row.direction === 'up_is_bad' && movement / base > 0.1 && movement > 0;
}

/** Where a number came from, in one line a reader can copy. */
export function provenance(row: MetricRow): string {
  if (row.source_rpc) return `computed by ${row.source_rpc}()`;
  if (row.source_table) return `counted from ${row.source_table}`;
  return 'source not recorded';
}

/**
 * The order the panel reads in.
 *
 * Alarming first, then the metrics that moved, then the rest alphabetically. A
 * panel that sorts by a fixed list puts the one number that matters below the fold
 * on the day it matters.
 */
export function orderMetrics(rows: readonly MetricRow[]): MetricRow[] {
  return [...rows].sort((a, b) => {
    const alarmA = isAlarming(a) ? 0 : needsAttention(a) ? 1 : 2;
    const alarmB = isAlarming(b) ? 0 : needsAttention(b) ? 1 : 2;
    if (alarmA !== alarmB) return alarmA - alarmB;
    return a.key.localeCompare(b.key);
  });
}

/**
 * A number, with a unit that does not lie.
 *
 * A `percent` is shown with no decimals because a console percentage is a glance,
 * not a measurement; seconds are spelled out; bytes are left to the caller because
 * a byte count's right unit depends on its size.
 */
export function formatValue(value: number, unit: string): string {
  if (unit === 'percent') return `${String(Math.round(value))}%`;
  if (unit === 'seconds') return `${String(Math.round(value))} s`;
  return String(value);
}

/**
 * The whole page, judged once.
 *
 * Two fresh numbers and one stale one is a stale page: the stale one cannot be
 * compared with the others, so the panel as a whole is not current.
 */
export function pageFreshness(rows: readonly MetricRow[], now: Date): Freshness {
  if (rows.length === 0) return { seconds: 0, stale: true, label: 'nothing measured yet' };
  const oldest = rows.reduce(
    (worst, row) => {
      const age = ageInSeconds(row.measured_at, now);
      return age > worst.seconds ? { seconds: age, measured: row.measured_at } : worst;
    },
    { seconds: -1, measured: rows[0]?.measured_at ?? '' },
  );
  return freshness(oldest.measured, now);
}
