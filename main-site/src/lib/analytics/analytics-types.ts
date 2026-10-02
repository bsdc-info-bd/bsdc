import type { DbReportKind } from '@/lib/supabase/types';

export type ReportKind = DbReportKind;

export interface GrowthPoint {
  day: string;
  newMembers: number;
  newPosts: number;
  activeMembers: number;
}

export interface RevenuePoint {
  day: string;
  ordersCount: number;
  grossSales: number;
  commission: number;
  adSpend: number;
  platformTotal: number;
}

export interface ModerationPoint {
  day: string;
  reportsOpened: number;
  reportsResolved: number;
  actionsTaken: number;
  medianHours: number;
}

export interface RetentionCell {
  cohortWeek: string;
  cohortSize: number;
  weekOffset: number;
  retained: number;
}

export interface TopContent {
  postId: string;
  slug: string;
  title: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

export interface SnapshotSummary {
  id: string;
  kind: ReportKind;
  title: string;
  periodFrom: string;
  periodTo: string;
  createdBy: string | null;
  createdAt: string;
}

export const REPORT_KINDS: readonly ReportKind[] = [
  'overview',
  'growth',
  'revenue',
  'moderation',
  'ads',
] as const;

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((sum(values) / values.length) * 100) / 100;
}

/**
 * Change between the first and second half of a series, as a percentage.
 * Growth from nothing is reported as null rather than as infinity, because
 * "up 100%" from zero is a sentence that means nothing.
 */
export function trendPercent(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const middle = Math.floor(values.length / 2);
  const before = sum(values.slice(0, middle));
  const after = sum(values.slice(middle));
  if (before === 0) return after === 0 ? 0 : null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

/** A moving average, so a weekly rhythm does not read as a trend. */
export function movingAverage(values: readonly number[], window = 7): number[] {
  if (window <= 1) return [...values];
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return Math.round((sum(slice) / slice.length) * 100) / 100;
  });
}

/** Largest value in a series, never below one, for scaling a chart. */
export function peak(values: readonly number[]): number {
  return Math.max(1, ...values);
}

/**
 * An SVG polyline for a sparkline: values mapped into a box, left to right,
 * with the y axis flipped because SVG counts downwards.
 */
export function sparklinePath(values: readonly number[], width = 100, height = 24): string {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const middle = (height / 2).toFixed(2);
    return `0,${middle} ${width.toFixed(2)},${middle}`;
  }
  const max = peak(values);
  const step = width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - (Math.max(0, value) / max) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Retention as a percentage of the cohort, rounded to one decimal. */
export function retentionPercent(cell: RetentionCell): number {
  if (cell.cohortSize <= 0) return 0;
  return Math.round((cell.retained / cell.cohortSize) * 1000) / 10;
}

/** The cohort table as a grid: one row per cohort, one column per week. */
export function retentionGrid(
  cells: readonly RetentionCell[],
): { cohortWeek: string; cohortSize: number; weeks: (number | null)[] }[] {
  const byCohort = new Map<string, { cohortSize: number; weeks: Map<number, number> }>();
  let widest = 0;

  for (const cell of cells) {
    const entry = byCohort.get(cell.cohortWeek) ?? {
      cohortSize: cell.cohortSize,
      weeks: new Map<number, number>(),
    };
    entry.weeks.set(cell.weekOffset, retentionPercent(cell));
    byCohort.set(cell.cohortWeek, entry);
    widest = Math.max(widest, cell.weekOffset);
  }

  return [...byCohort.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cohortWeek, entry]) => ({
      cohortWeek,
      cohortSize: entry.cohortSize,
      weeks: Array.from({ length: widest + 1 }, (_, index) => entry.weeks.get(index) ?? null),
    }));
}

/** Poisha to a plain decimal string for a report; no locale, no symbol. */
export function poishaToString(poisha: number): string {
  const sign = poisha < 0 ? '-' : '';
  const absolute = Math.abs(poisha);
  return `${sign}${String(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, '0')}`;
}

/** RFC 4180 CSV: quotes doubled, fields with separators quoted. */
export function toCsv(columns: readonly string[], rows: readonly (string | number)[][]): string {
  const cell = (value: string | number): string => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n');
}

/** A filename that is safe on every filesystem and still readable. */
export function reportFilename(kind: ReportKind, from: string, to: string): string {
  const clean = (value: string): string => value.replace(/[^0-9a-zA-Z-]/g, '-');
  return `bsdc-${clean(kind)}-${clean(from)}-to-${clean(to)}.pdf`;
}

export interface SnapshotTotals {
  membersTotal: number;
  membersPeriod: number;
  postsTotal: number;
  postsPeriod: number;
  reportsOpen: number;
  grossSales: number;
  commission: number;
  adSpend: number;
}

export interface SnapshotPayload {
  generatedAt: string;
  days: number;
  totals: SnapshotTotals;
  growth: GrowthPoint[];
  revenue: RevenuePoint[];
}

function numberAt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringAt(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a stored snapshot defensively. A report written months ago must
 * still open even if the schema has moved on since, so every field is
 * checked rather than asserted.
 */
export function parseSnapshot(payload: unknown): SnapshotPayload | null {
  if (!isRecord(payload)) return null;
  const totalsRaw = isRecord(payload['totals']) ? payload['totals'] : {};
  const growthRaw = Array.isArray(payload['growth']) ? payload['growth'] : [];
  const revenueRaw = Array.isArray(payload['revenue']) ? payload['revenue'] : [];

  return {
    generatedAt: stringAt(payload, 'generated_at'),
    days: numberAt(payload, 'days'),
    totals: {
      membersTotal: numberAt(totalsRaw, 'members_total'),
      membersPeriod: numberAt(totalsRaw, 'members_period'),
      postsTotal: numberAt(totalsRaw, 'posts_total'),
      postsPeriod: numberAt(totalsRaw, 'posts_period'),
      reportsOpen: numberAt(totalsRaw, 'reports_open'),
      grossSales: numberAt(totalsRaw, 'gross_sales'),
      commission: numberAt(totalsRaw, 'commission'),
      adSpend: numberAt(totalsRaw, 'ad_spend'),
    },
    growth: growthRaw.filter(isRecord).map((row) => ({
      day: stringAt(row, 'day'),
      newMembers: numberAt(row, 'new_members'),
      newPosts: numberAt(row, 'new_posts'),
      activeMembers: numberAt(row, 'active_members'),
    })),
    revenue: revenueRaw.filter(isRecord).map((row) => ({
      day: stringAt(row, 'day'),
      ordersCount: numberAt(row, 'orders_count'),
      grossSales: numberAt(row, 'gross_sales'),
      commission: numberAt(row, 'commission'),
      adSpend: numberAt(row, 'ad_spend'),
      platformTotal: numberAt(row, 'platform_total'),
    })),
  };
}
