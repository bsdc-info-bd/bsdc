/**
 * Moderation, as a queue a human being has to get through.
 *
 * The ordering rules here are the opinionated part: a report about a person
 * in danger is not the same kind of work as a report about a duplicated
 * post, and a queue that treats them the same is a queue that answers the
 * urgent one last.
 */

export type ReportStatus = 'open' | 'claimed' | 'resolved' | 'dismissed';

export interface ReportRow {
  readonly id: string;
  readonly subject_type: string;
  readonly subject_id: string;
  readonly reason: string;
  readonly details: string;
  readonly status: string;
  readonly reporter_uid: string | null;
  readonly assigned_to: string | null;
  readonly resolution: string;
  readonly report_count: number;
  readonly created_at: string;
}

/** Reasons in the order they must be dealt with, worst first. */
export const REASON_SEVERITY: Readonly<Record<string, number>> = {
  self_harm: 100,
  violence: 95,
  child_safety: 100,
  harassment: 80,
  hate: 80,
  doxxing: 75,
  impersonation: 60,
  scam: 60,
  malware: 70,
  nudity: 55,
  spam: 30,
  off_topic: 20,
  other: 25,
};

export function severityOf(reason: string): number {
  return REASON_SEVERITY[reason] ?? 25;
}

export function reasonLabel(reason: string): string {
  const words = reason.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function subjectLabel(type: string): string {
  switch (type) {
    case 'post':
      return 'Post';
    case 'comment':
      return 'Comment';
    case 'profile':
      return 'Member';
    case 'message':
      return 'Message';
    case 'product':
      return 'Product';
    case 'group':
      return 'Group';
    default:
      return 'Item';
  }
}

/** Where the subject can be read, so a decision is never made from a title. */
export function subjectPath(row: ReportRow): string {
  switch (row.subject_type) {
    case 'post':
      return `/p/${row.subject_id}`;
    case 'profile':
      return `/@${row.subject_id}`;
    case 'product':
      return `/shop/${row.subject_id}`;
    case 'group':
      return `/g/${row.subject_id}`;
    default:
      return '';
  }
}

export function hoursWaiting(row: ReportRow, now: Date = new Date()): number {
  const created = new Date(row.created_at).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, (now.getTime() - created) / 3_600_000);
}

/** The promise: severe reports in four hours, everything else in two days. */
export function targetHours(row: ReportRow): number {
  const severity = severityOf(row.reason);
  if (severity >= 90) return 1;
  if (severity >= 70) return 4;
  if (severity >= 50) return 24;
  return 48;
}

export function isOverdue(row: ReportRow, now: Date = new Date()): boolean {
  return hoursWaiting(row, now) > targetHours(row);
}

export function waitingLabel(row: ReportRow, now: Date = new Date()): string {
  const hours = hoursWaiting(row, now);
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * Severity first, then how many people reported the same thing, then age.
 * Age last, deliberately: a queue sorted by age alone starves the serious
 * reports behind a wall of old trivia.
 */
export function queueOrder(
  rows: readonly ReportRow[],
  now: Date = new Date(),
): readonly ReportRow[] {
  return [...rows].sort((a, b) => {
    const severity = severityOf(b.reason) - severityOf(a.reason);
    if (severity !== 0) return severity;
    const overdue = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
    if (overdue !== 0) return overdue;
    const count = b.report_count - a.report_count;
    if (count !== 0) return count;
    return hoursWaiting(b, now) - hoursWaiting(a, now);
  });
}

export interface QueueHealth {
  readonly open: number;
  readonly overdue: number;
  readonly oldestHours: number;
  readonly sentence: string;
}

export function queueHealth(rows: readonly ReportRow[], now: Date = new Date()): QueueHealth {
  const open = rows.filter((row) => row.status === 'open' || row.status === 'claimed');
  const overdue = open.filter((row) => isOverdue(row, now));
  const oldest = open.reduce((max, row) => Math.max(max, hoursWaiting(row, now)), 0);
  const sentence =
    open.length === 0
      ? 'The queue is empty.'
      : overdue.length === 0
        ? `${open.length} waiting, all inside their target.`
        : `${overdue.length} of ${open.length} are past the time they were promised.`;
  return { open: open.length, overdue: overdue.length, oldestHours: Math.round(oldest), sentence };
}

/**
 * The four decisions `resolve_report()` accepts, and nothing else. A console
 * offering an action the database will refuse is a console that wastes a
 * moderator's shift.
 */
export const ACTIONS = [
  { id: 'dismiss', label: 'No action needed', needsReason: false },
  { id: 'warn', label: 'Warn the member', needsReason: true },
  { id: 'hide_content', label: 'Hide the content', needsReason: true },
  { id: 'restore_content', label: 'Restore the content', needsReason: true },
] as const;

export type ActionId = (typeof ACTIONS)[number]['id'];

/**
 * A reason is published to the person it affects, so an empty one is not
 * allowed and a two-word one is not useful. Moderation without an
 * explanation is indistinguishable from malice.
 */
export function decisionProblems(action: string, reason: string): readonly string[] {
  const spec = ACTIONS.find((candidate) => candidate.id === action);
  if (!spec) return ['Choose what to do.'];
  if (!spec.needsReason) return [];
  const words = reason.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['The member is told this reason, so it cannot be empty.'];
  if (words.length < 4) return ['Write a reason the member can understand and act on.'];
  if (reason.trim().length > 300) return ['Keep the reason under 300 characters.'];
  return [];
}
