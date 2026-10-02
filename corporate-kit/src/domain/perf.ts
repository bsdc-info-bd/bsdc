/**
 * Field performance, judged the way Google judges it and reported the way a
 * person can act on it.
 *
 * The thresholds below are the published Core Web Vitals boundaries, and
 * they are duplicated in `0034_performance.sql` on purpose: a report
 * produced by a scheduled script and a screen read by a person must not
 * disagree about whether the site is fast.
 */

export const VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type Vital = (typeof VITALS)[number];

export type Rating = 'good' | 'fair' | 'poor' | 'unknown';

export interface VitalSpec {
  readonly metric: Vital;
  readonly label: string;
  readonly meaning: string;
  readonly good: number;
  readonly fair: number;
  readonly unit: 'ms' | 'score';
}

export const VITAL_SPECS: Readonly<Record<Vital, VitalSpec>> = {
  LCP: {
    metric: 'LCP',
    label: 'Largest paint',
    meaning: 'How long until the main thing on the page is on screen.',
    good: 2500,
    fair: 4000,
    unit: 'ms',
  },
  INP: {
    metric: 'INP',
    label: 'Interaction',
    meaning: 'How long the page takes to answer a tap.',
    good: 200,
    fair: 500,
    unit: 'ms',
  },
  CLS: {
    metric: 'CLS',
    label: 'Layout shift',
    meaning: 'How much the page moves under the reader after it has loaded.',
    good: 0.1,
    fair: 0.25,
    unit: 'score',
  },
  FCP: {
    metric: 'FCP',
    label: 'First paint',
    meaning: 'How long the page is blank.',
    good: 1800,
    fair: 3000,
    unit: 'ms',
  },
  TTFB: {
    metric: 'TTFB',
    label: 'Server response',
    meaning: 'How long the first byte takes to arrive.',
    good: 800,
    fair: 1800,
    unit: 'ms',
  },
};

export function isVital(value: string): value is Vital {
  return (VITALS as readonly string[]).includes(value);
}

export function rate(metric: string, value: number): Rating {
  if (!isVital(metric) || !Number.isFinite(value) || value < 0) return 'unknown';
  const spec = VITAL_SPECS[metric];
  if (value <= spec.good) return 'good';
  if (value <= spec.fair) return 'fair';
  return 'poor';
}

export function ratingTone(rating: Rating): 'ok' | 'warn' | 'bad' | 'neutral' {
  switch (rating) {
    case 'good':
      return 'ok';
    case 'fair':
      return 'warn';
    case 'poor':
      return 'bad';
    default:
      return 'neutral';
  }
}

/** Milliseconds read the way people say them; CLS as the score it is. */
export function formatVital(metric: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (metric === 'CLS') return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export interface VitalRow {
  readonly route: string;
  readonly metric: string;
  readonly samples: number;
  readonly p75: number | null;
  readonly p95: number | null;
  readonly rating: string;
}

/** Below this, a percentile is arithmetic rather than evidence. */
export const MIN_SAMPLES = 20;

export function isTrustworthy(row: VitalRow): boolean {
  return row.samples >= MIN_SAMPLES;
}

/**
 * The worst routes first, but only among those with enough samples to mean
 * anything — otherwise the top of the list is always whichever page three
 * people visited on a bad connection.
 */
export function worstRoutes(
  rows: readonly VitalRow[],
  metric: Vital,
  limit = 5,
): readonly VitalRow[] {
  return rows
    .filter((row) => row.metric === metric && isTrustworthy(row) && row.p75 !== null)
    .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0))
    .slice(0, limit);
}

export interface VitalVerdict {
  readonly metric: Vital;
  readonly p75: number | null;
  readonly samples: number;
  readonly rating: Rating;
  readonly sentence: string;
}

/**
 * One sentence per metric, in plain words. A console that only shows numbers
 * leaves everybody to invent their own threshold in their head.
 */
export function overallVerdicts(rows: readonly VitalRow[]): readonly VitalVerdict[] {
  return VITALS.map((metric) => {
    const relevant = rows.filter((row) => row.metric === metric && row.p75 !== null);
    const samples = relevant.reduce((sum, row) => sum + row.samples, 0);
    if (samples === 0) {
      return {
        metric,
        p75: null,
        samples: 0,
        rating: 'unknown' as Rating,
        sentence: `No ${VITAL_SPECS[metric].label.toLowerCase()} measurements arrived in this window.`,
      };
    }
    // Sample-weighted, so a busy route counts for what it is worth.
    const weighted = relevant.reduce((sum, row) => sum + (row.p75 ?? 0) * row.samples, 0) / samples;
    const rating = rate(metric, weighted);
    const spec = VITAL_SPECS[metric];
    const sentence =
      rating === 'good'
        ? `${spec.label} is ${formatVital(metric, weighted)} for three quarters of visits, inside the ${formatVital(metric, spec.good)} target.`
        : rating === 'fair'
          ? `${spec.label} is ${formatVital(metric, weighted)} for three quarters of visits; the target is ${formatVital(metric, spec.good)}.`
          : `${spec.label} is ${formatVital(metric, weighted)} for three quarters of visits, past the ${formatVital(metric, spec.fair)} point where people leave.`;
    return { metric, p75: Math.round(weighted * 1000) / 1000, samples, rating, sentence };
  });
}

export interface TrendPoint {
  readonly day: string;
  readonly samples: number;
  readonly p75: number | null;
  readonly mobile_p75: number | null;
  readonly desktop_p75: number | null;
}

/**
 * An SVG path for a sparkline. Days without measurements break the line
 * rather than being drawn through, because a straight line across a gap is
 * a claim nobody measured.
 */
export function sparkline(
  points: readonly TrendPoint[],
  width = 320,
  height = 48,
  key: 'p75' | 'mobile_p75' | 'desktop_p75' = 'p75',
): string {
  const values = points.map((point) => point[key]);
  const present = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (present.length < 2) return '';
  const max = Math.max(...present);
  const min = Math.min(...present);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  let path = '';
  let penDown = false;
  values.forEach((value, index) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      penDown = false;
      return;
    }
    const x = Math.round(index * step * 100) / 100;
    const y = Math.round((height - ((value - min) / span) * height) * 100) / 100;
    path += `${penDown ? 'L' : 'M'}${x} ${y}`;
    penDown = true;
  });
  return path;
}

/** Whether the second half of the window is better or worse than the first. */
export function trendDirection(points: readonly TrendPoint[]): {
  readonly change: number | null;
  readonly sentence: string;
} {
  const values = points
    .map((point) => point.p75)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length < 6) return { change: null, sentence: 'Not enough days to compare yet.' };
  const half = Math.floor(values.length / 2);
  const mean = (list: readonly number[]): number =>
    list.reduce((sum, value) => sum + value, 0) / list.length;
  const before = mean(values.slice(0, half));
  const after = mean(values.slice(half));
  if (before === 0) return { change: null, sentence: 'Not enough traffic to compare yet.' };
  const change = Math.round(((after - before) / before) * 1000) / 10;
  if (Math.abs(change) < 5)
    return { change, sentence: 'Steady against the first half of the window.' };
  return {
    change,
    sentence:
      change > 0
        ? `${change.toFixed(1)}% slower than the first half of the window.`
        : `${Math.abs(change).toFixed(1)}% faster than the first half of the window.`,
  };
}

export interface BundlePoint {
  readonly recorded_at: string;
  readonly commit_sha: string;
  readonly bytes_gzip: number;
  readonly budget_gzip: number;
  readonly delta_bytes: number | null;
}

export function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** What a build did to the budget, said as a sentence rather than a colour. */
export function bundleVerdict(point: BundlePoint): string {
  const share = Math.round((point.bytes_gzip / point.budget_gzip) * 100);
  const delta = point.delta_bytes;
  const movement =
    delta === null || delta === 0
      ? 'unchanged'
      : delta > 0
        ? `up ${kilobytes(delta)}`
        : `down ${kilobytes(Math.abs(delta))}`;
  if (point.bytes_gzip > point.budget_gzip) {
    return `${kilobytes(point.bytes_gzip)}, ${movement} — over the budget by ${kilobytes(point.bytes_gzip - point.budget_gzip)}.`;
  }
  return `${kilobytes(point.bytes_gzip)}, ${movement} — ${share}% of the budget.`;
}

export interface ErrorRow {
  readonly fingerprint: string;
  readonly name: string;
  readonly message: string;
  readonly route: string;
  readonly build: string;
  readonly occurrences: number;
  readonly first_seen: string;
  readonly last_seen: string;
  readonly is_resolved: boolean;
}

/**
 * A fault that started today and is happening constantly outranks one that
 * has been grumbling for a month. Rate matters more than total.
 */
export function errorUrgency(row: ErrorRow, now: Date = new Date()): number {
  const first = new Date(row.first_seen).getTime();
  const last = new Date(row.last_seen).getTime();
  if (Number.isNaN(first) || Number.isNaN(last)) return row.occurrences;
  const hoursAlive = Math.max(1, (last - first) / 3_600_000);
  const hoursSince = Math.max(0.5, (now.getTime() - last) / 3_600_000);
  return row.occurrences / hoursAlive / hoursSince;
}

export function sortErrors(rows: readonly ErrorRow[], now: Date = new Date()): readonly ErrorRow[] {
  return [...rows].sort((a, b) => errorUrgency(b, now) - errorUrgency(a, now));
}

export interface Forecast {
  readonly days_observed: number;
  readonly daily_now: number;
  readonly daily_in_30: number;
  readonly growth_per_day: number;
  readonly correlation: number;
  readonly confidence: string;
}

/** The forecast in words, including the honest version of "we don't know". */
export function forecastSentence(forecast: Forecast | null): string {
  if (forecast === null || forecast.days_observed < 14) {
    return 'There are not enough days of measurements to project anything yet.';
  }
  if (Math.abs(forecast.correlation) < 0.4) {
    return `Traffic is averaging ${Math.round(forecast.daily_now)} measurements a day with no trend in it — the variation is noise, not growth.`;
  }
  const direction = forecast.growth_per_day >= 0 ? 'rising' : 'falling';
  return `Traffic is ${direction} by about ${Math.abs(forecast.growth_per_day).toFixed(1)} measurements a day; at this rate it reaches ${Math.round(forecast.daily_in_30)} a day in a month (${forecast.confidence}).`;
}
