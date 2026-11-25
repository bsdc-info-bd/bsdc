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
  { id: 'bsdc-perf', label: 'Performance' },
  { id: 'bsdc-config', label: 'Configuration' },
  { id: 'bsdc-connect', label: 'Staff connect' },
  { id: 'bsdc-custom', label: 'Site composer' },
  { id: 'bsdc-ip', label: 'IP intelligence' },
  { id: 'bsdc-mod', label: 'Moderation' },
  { id: 'bsdc-uadmin', label: 'Staff records' },
  { id: 'bsdc-umod', label: 'People operations' },
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
export function trendBounds(
  points: readonly TrendPoint[],
  metric: Vital = 'LCP',
): {
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
    peak: peak === null ? '—' : `${peak.day}: ${formatVital(metric, peak.p75)}`,
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

// ---------------------------------------------------------------------------
// §13.1 Vitals that lead to an action
// ---------------------------------------------------------------------------

/** `vitals_board` as 0149 returns it. */
export interface BoardRow {
  readonly route: string;
  readonly metric: Vital;
  readonly samples: number;
  readonly p75: number | null;
  readonly p95: number | null;
  readonly rating: string;
  readonly target: number | null;
  readonly over_budget: boolean;
  readonly insufficient: boolean;
  readonly streak: number;
  readonly build: string;
  readonly open_regression: string | null;
}

export interface RegressionRow {
  readonly id: string;
  readonly app: string;
  readonly route: string;
  readonly metric: Vital;
  readonly target: number;
  readonly observed: number;
  readonly delta_share: number;
  readonly samples: number;
  readonly streak: number;
  readonly build: string;
  readonly error_fingerprint: string | null;
  readonly first_seen: string;
  readonly last_seen: string;
  readonly acknowledged_at: string | null;
  readonly ack_note: string;
}

export interface BudgetRow {
  readonly id: string;
  readonly app: string;
  readonly route: string;
  readonly metric: Vital;
  readonly target: number;
  readonly consecutive: number;
  readonly window_days: number;
  readonly min_samples: number;
  readonly note: string;
  readonly updated_at: string;
}

/**
 * A board row said as a sentence.
 *
 * The upgrade §13.1 asks for is not more numbers on the screen, it is a
 * sentence that says what to do. Four cases matter, and they lead to four
 * different actions: over budget and open (someone is on it), over budget and
 * new (this is the one to look at), insufficient (get more data, do not panic),
 * and within budget (nothing).
 */
export function boardSentence(row: BoardRow): string {
  if (row.insufficient) {
    return `Only ${row.samples.toLocaleString('en-GB')} measurements. Too few to call a trend, so this window is not compared.`;
  }
  if (row.rating === 'no budget') {
    return 'No budget is set for this metric, so nothing is being watched.';
  }
  if (!row.over_budget) {
    const target = row.target === null ? '' : ` against ${formatVital(row.metric, row.target)}`;
    return `Inside its budget${target}.`;
  }
  const over = row.target === null ? '' : ` over ${formatVital(row.metric, row.target)}`;
  if (row.open_regression !== null) {
    return `${formatVital(row.metric, row.p75)}${over}, and there is an open regression on it.`;
  }
  return `${formatVital(row.metric, row.p75)}${over}. ${String(row.streak)} of the required windows are over, so this is not yet an alert.`;
}

/** How close a metric is to firing, which is the thing a person wants before it does. */
export function streakLabel(row: BoardRow, required: number): string {
  if (!row.over_budget) return '';
  if (row.open_regression !== null) return 'alerting';
  const left = Math.max(0, required - row.streak);
  if (left === 0) return 'alerting';
  return left === 1 ? 'one more window' : `${String(left)} more windows`;
}

/** The share over target, as a signed percentage. */
export function deltaLabel(row: BoardRow): string {
  if (row.target === null || row.target === 0 || row.p75 === null) return '';
  const share = (row.p75 - row.target) / row.target;
  const percent = Math.round(share * 100);
  if (percent === 0) return 'on budget';
  return `${percent > 0 ? '+' : ''}${String(percent)}%`;
}

/**
 * The board grouped the way a person reads it: what is broken first, what is
 * new second, what is fine not at all until they ask.
 */
export type BoardSection = {
  readonly title: string;
  readonly detail: string;
  readonly rows: readonly BoardRow[];
};

export function boardSections(rows: readonly BoardRow[], required = 3): readonly BoardSection[] {
  const alerting = rows.filter((r) => r.over_budget && r.open_regression !== null);
  const approaching = rows.filter((r) => r.over_budget && r.open_regression === null);
  const blind = rows.filter((r) => !r.over_budget && r.insufficient && r.samples > 0);
  const fine = rows.filter((r) => !r.over_budget && !r.insufficient);

  const sections: BoardSection[] = [];
  if (alerting.length > 0) {
    sections.push({
      title: `Alerting (${String(alerting.length)})`,
      detail: 'Over budget for the required number of consecutive windows. Somebody should say what they are doing about it.',
      rows: alerting,
    });
  }
  if (approaching.length > 0) {
    sections.push({
      title: `Approaching (${String(approaching.length)})`,
      detail: `Over budget, but the streak has not reached ${String(required)} windows. This is the list to watch, not to page on.`,
      rows: approaching,
    });
  }
  if (blind.length > 0) {
    sections.push({
      title: `Not enough measurements (${String(blind.length)})`,
      detail: 'Under the sample floor. Reported as unknown rather than as good, because a quiet route is not a fast one.',
      rows: blind,
    });
  }
  if (fine.length > 0) {
    sections.push({
      title: `Inside budget (${String(fine.length)})`,
      detail: 'Nothing to do.',
      rows: fine,
    });
  }
  return sections;
}

/**
 * A regression, said in one line, with the release and the error that came with
 * it. The error is named as a correlation and never as a cause: the same window
 * is not the same reason.
 */
export function regressionSentence(row: RegressionRow): string {
  const delta = `${row.delta_share > 0 ? '+' : ''}${String(Math.round(row.delta_share * 100))}%`;
  const release = row.build === '' ? 'an unrecorded release' : `release ${row.build}`;
  const base = `${formatVital(row.metric, row.observed)} on ${row.route}, ${delta} over its ${formatVital(row.metric, row.target)} budget, on ${release}.`;
  if (row.error_fingerprint === null) return base;
  return `${base} An error appeared in the same window; the two are correlated, which is not the same as caused.`;
}

/** When the state of a regression stops being news. */
export function regressionAge(row: RegressionRow, now = new Date()): string {
  const first = new Date(row.first_seen).getTime();
  if (Number.isNaN(first)) return '';
  const hours = Math.floor((now.getTime() - first) / 3_600_000);
  if (hours < 1) return 'started within the hour';
  if (hours < 24) return `open for ${String(hours)} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `open for ${String(days)} day${days === 1 ? '' : 's'}`;
}

/** Why an acknowledgement needs a sentence, said before the field is filled in. */
export function ackProblem(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length === 0) return 'Say what was done, so the next person does not repeat the investigation.';
  if (trimmed.length < 10) return 'A few more words, please. What was done about it?';
  return '';
}

/** Small-sample honesty for a trend line, in the same voice as the board. */
export function trendHonesty(samples: number, floor: number): string {
  if (samples === 0) return 'No measurements in this window.';
  if (samples < floor) {
    return `${String(samples)} measurements is under the ${String(floor)} this metric needs before a trend means anything.`;
  }
  return '';
}
