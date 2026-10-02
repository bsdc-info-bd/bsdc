import {
  VITAL_SPECS,
  formatVital,
  isVital,
  kilobytes,
  type ErrorRow,
  type TrendPoint,
  type Vital,
  type VitalRow,
} from '@kit';

/**
 * The console's own vocabulary. The judgements live in the kit and in
 * Postgres; what is here is the shaping a screen needs — which apps exist,
 * how a window is described, and how a measurement is read aloud.
 */

export const APPS = [
  { id: 'main-site', label: 'Main site' },
  { id: 'bsdc-admin', label: 'SEO and branding' },
  { id: 'bsdc-cert', label: 'Certificates' },
  { id: 'bsdc-notice', label: 'Notices' },
  { id: 'bsdc-vf', label: 'Verification portal' },
  { id: 'bsdc-status', label: 'Service status' },
] as const;

export const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '28', label: 'Last 28 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

export function windowLabel(days: number): string {
  const match = WINDOWS.find((option) => option.value === String(days));
  return match ? match.label.toLowerCase() : `last ${days} days`;
}

/** The target for a metric, said the way the console prints a measurement. */
export function targetLabel(metric: Vital): string {
  const spec = VITAL_SPECS[metric];
  return `${formatVital(metric, spec.good)} or better`;
}

export interface EdgeRow {
  readonly endpoint: string;
  readonly calls: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly error_rate: number | null;
}

/**
 * An endpoint is worth attention if it is slow, if it fails, or if it is
 * called so often that a small cost becomes a large one. The sentence says
 * which of the three it is, because the fix differs.
 */
export function edgeNote(row: EdgeRow): string {
  const rate = row.error_rate ?? 0;
  if (rate >= 1) return `${rate.toFixed(2)}% of calls are failing.`;
  if ((row.p95 ?? 0) >= 1000) {
    return `The slowest twentieth of calls take over a second (${formatVital('TTFB', row.p95)}).`;
  }
  if (row.calls >= 10000) {
    return `${row.calls.toLocaleString('en-GB')} calls; ${formatVital('TTFB', row.p50)} in the middle.`;
  }
  return `${formatVital('TTFB', row.p50)} in the middle, ${formatVital('TTFB', row.p95)} at the slow end.`;
}

/** Enough of an error message to recognise it, never enough to fill a cell. */
export function shortMessage(row: ErrorRow): string {
  const flat = row.message.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? flat : `${flat.slice(0, 79)}…`;
}

export function errorRate(row: ErrorRow, now: Date = new Date()): string {
  const first = new Date(row.first_seen).getTime();
  const last = new Date(row.last_seen).getTime();
  if (Number.isNaN(first) || Number.isNaN(last)) return `${row.occurrences} times`;
  const hours = Math.max(1, (last - first) / 3_600_000);
  const perHour = row.occurrences / hours;
  if (perHour >= 1) return `${perHour.toFixed(1)} an hour`;
  const perDay = perHour * 24;
  if (perDay >= 1) return `${perDay.toFixed(1)} a day`;
  void now;
  return `${row.occurrences} in total`;
}

/** The one line a dashboard needs: how big the measured audience is. */
export function coverageSentence(rows: readonly VitalRow[]): string {
  const samples = rows.reduce((sum, row) => sum + row.samples, 0);
  const routes = new Set(rows.map((row) => row.route)).size;
  if (samples === 0) return 'No measurements have arrived in this window.';
  return `${samples.toLocaleString('en-GB')} measurements across ${routes} route${routes === 1 ? '' : 's'}.`;
}

/** Routes present in the data, for the filter, with the busiest first. */
export function routesByTraffic(rows: readonly VitalRow[]): readonly string[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.route, (totals.get(row.route) ?? 0) + row.samples);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([route]) => route);
}

/** CSV of the summary, for the people who will want it in a spreadsheet. */
export function summaryCsv(rows: readonly VitalRow[]): string {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = ['route,metric,samples,p75,p95,rating'];
  for (const row of rows) {
    lines.push(
      [
        escape(row.route),
        row.metric,
        String(row.samples),
        row.p75 === null ? '' : String(row.p75),
        row.p95 === null ? '' : String(row.p95),
        row.rating,
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** The axis labels a sparkline needs: the first day, the last, and the peak. */
export function trendBounds(points: readonly TrendPoint[]): {
  readonly from: string;
  readonly to: string;
  readonly peak: string;
} {
  const present = points.filter((point) => point.p75 !== null);
  const peak = present.reduce<TrendPoint | null>(
    (worst, point) => (worst === null || (point.p75 ?? 0) > (worst.p75 ?? 0) ? point : worst),
    null,
  );
  return {
    from: points[0]?.day ?? '',
    to: points[points.length - 1]?.day ?? '',
    peak: peak === null ? '—' : `${peak.day}: ${formatVital('LCP', peak.p75)}`,
  };
}

export function metricOptions(): readonly { value: string; label: string }[] {
  return Object.values(VITAL_SPECS).map((spec) => ({
    value: spec.metric,
    label: `${spec.label} (${spec.metric})`,
  }));
}

export function metricFromValue(value: string): Vital {
  return isVital(value) ? value : 'LCP';
}

export function budgetShare(bytes: number, budget: number): string {
  return `${kilobytes(bytes)} of ${kilobytes(budget)}`;
}
