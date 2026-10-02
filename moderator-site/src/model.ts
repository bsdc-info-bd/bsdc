import { queueHealth, reasonLabel, severityOf, subjectLabel, type ReportRow } from '@kit';

/**
 * The moderation console's own vocabulary. The ordering, the targets and
 * the refusal to accept a one-word reason live in the kit, next to the
 * tests that hold them; this file shapes what a screen shows.
 */

export const STATUSES = [
  { value: 'open', label: 'Waiting' },
  { value: 'claimed', label: 'Being handled' },
  { value: 'resolved', label: 'Decided' },
  { value: 'dismissed', label: 'No action' },
] as const;

export function statusLabel(status: string): string {
  return STATUSES.find((option) => option.value === status)?.label ?? status;
}

export function statusTone(status: string): 'neutral' | 'ok' | 'warn' | 'bad' {
  switch (status) {
    case 'open':
      return 'warn';
    case 'claimed':
      return 'neutral';
    case 'resolved':
      return 'ok';
    case 'dismissed':
      return 'ok';
    default:
      return 'neutral';
  }
}

/** The headline of a report: what was reported, and what it was reported for. */
export function reportTitle(row: ReportRow): string {
  return `${subjectLabel(row.subject_type)} — ${reasonLabel(row.reason)}`;
}

/**
 * Many people reporting one thing is a signal about the thing; one person
 * reporting many things is a signal about the person. The console says
 * which of the two it is looking at rather than only printing a number.
 */
export function corroboration(row: ReportRow): string {
  if (row.report_count <= 1) return 'Reported once.';
  if (row.report_count >= 10) return `Reported ${row.report_count} times — widely seen.`;
  return `Reported ${row.report_count} times.`;
}

export interface Decision {
  action: string;
  reason: string;
}

export const EMPTY_DECISION: Decision = { action: 'dismiss', reason: '' };

/** The arguments `resolve_report` expects for each kind of decision. */
export function decisionArgs(id: string, decision: Decision): Record<string, unknown> {
  return {
    p_report_id: id,
    p_action: decision.action,
    p_reason: decision.reason.trim(),
  };
}

export interface ModerationStats {
  readonly waiting: number;
  readonly overdue: number;
  readonly severe: number;
  readonly sentence: string;
}

/** The one line the tab heading needs, and the one a handover needs. */
export function shiftSummary(rows: readonly ReportRow[], now: Date = new Date()): ModerationStats {
  const health = queueHealth(rows, now);
  const severe = rows.filter(
    (row) => (row.status === 'open' || row.status === 'claimed') && severityOf(row.reason) >= 90,
  ).length;
  const sentence =
    severe > 0
      ? `${severe} report${severe === 1 ? '' : 's'} about someone's safety ${severe === 1 ? 'is' : 'are'} waiting. ${health.sentence}`
      : health.sentence;
  return { waiting: health.open, overdue: health.overdue, severe, sentence };
}

/** Groups the queue by what is being reported, for the second pass of a shift. */
export function byReason(
  rows: readonly ReportRow[],
): readonly { readonly reason: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason: reasonLabel(reason), count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** A reporter who files constantly is worth noticing, in either direction. */
export function repeatReporters(
  rows: readonly ReportRow[],
  threshold = 5,
): readonly { readonly uid: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.reporter_uid === null || row.reporter_uid === '') continue;
    counts.set(row.reporter_uid, (counts.get(row.reporter_uid) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([uid, count]) => ({ uid, count }))
    .sort((a, b) => b.count - a.count);
}
