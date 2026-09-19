/**
 * BSDC — src/entities/moderation/model.ts
 * Purpose : The report and appeal entities, and the vocabulary they are built from.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A report is a request for a human to look at something, not a verdict. It carries what
 *   was reported, who reported it, why, and — once somebody has looked — exactly what was decided
 *   and by whom. Every terminal decision is appealable once, and the appeal is read by a different
 *   moderator than the one who decided, because asking the same person to review their own call
 *   is not an appeal.
 *   The client can create a report and read its own; it can never decide one. Deciding is a Cloud
 *   Function, and it writes both the decision and the audit entry in the same transaction.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  MIN_REASON_CHARS,
  categoryDefinition,
  type ReportCategory,
  type ReportState,
} from '@/core/config/moderation';
import { TEXT_LIMITS } from '@/core/config/limits';
import { uid } from '@/shared/lib/uid';

/** Everything a person may report. */
export const REPORT_TARGETS = [
  'post',
  'comment',
  'profile',
  'group',
  'event',
  'job',
  'project',
  'gig',
  'message',
] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/** A report. */
export interface Report {
  readonly id: string;
  readonly targetType: ReportTarget;
  readonly targetId: string;
  /** Short bilingual label of the thing reported, captured at report time. */
  readonly targetLabelBn: string;
  readonly targetLabelEn: string;
  /** Author of the reported content, so the decision can reach them. */
  readonly targetAuthorUid: string;
  readonly reporterUid: string;
  readonly category: ReportCategory;
  readonly reasonText: string;
  readonly state: ReportState;
  /** 1 to 4, copied from the category so the queue can order without a join. */
  readonly severity: number;
  readonly assigneeUid: string;
  readonly decisionNote: string;
  readonly decidedBy: string;
  readonly decidedAt: string | null;
  readonly appealCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** An appeal against a decided report. */
export interface Appeal {
  readonly id: string;
  readonly reportId: string;
  readonly appellantUid: string;
  readonly reasonText: string;
  readonly status: 'open' | 'upheld' | 'rejected';
  readonly reviewedBy: string;
  readonly decisionNote: string;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to file a report. */
export interface NewReportInput {
  readonly targetType: ReportTarget;
  readonly targetId: string;
  readonly targetLabelBn: string;
  readonly targetLabelEn: string;
  readonly targetAuthorUid: string;
  readonly reporterUid: string;
  readonly category: ReportCategory;
  readonly reasonText: string;
  readonly now?: Date | undefined;
}

/**
 * Builds a report entity.
 * @param input report values
 * @returns a complete report entity
 */
export function newReport(input: NewReportInput): Report {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: uid(20),
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabelBn: input.targetLabelBn,
    targetLabelEn: input.targetLabelEn,
    targetAuthorUid: input.targetAuthorUid,
    reporterUid: input.reporterUid,
    category: input.category,
    reasonText: input.reasonText.trim().slice(0, TEXT_LIMITS.reportReason),
    state: 'open',
    severity: categoryDefinition(input.category).severity,
    assigneeUid: '',
    decisionNote: '',
    decidedBy: '',
    decidedAt: null,
    appealCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Validates a report draft. A reason shorter than the minimum is refused: "bad" is not a report,
 * and a reviewer cannot act on it.
 * @param input report values
 * @returns true when the report may be filed
 */
export function isReportWellFormed(input: NewReportInput): boolean {
  return input.reasonText.trim().length >= MIN_REASON_CHARS && input.targetId.length > 0;
}

/**
 * Reports whether a report is still waiting on a decision.
 * @param report the report
 * @returns true while the report is open, triaged or escalated
 */
export function isPending(report: Report): boolean {
  return report.state === 'open' || report.state === 'triaged' || report.state === 'escalated';
}

/**
 * Reports whether a report has been decided and can therefore be appealed.
 * @param report the report
 * @returns true for actioned and dismissed reports
 */
export function isDecided(report: Report): boolean {
  return report.state === 'actioned' || report.state === 'dismissed';
}

/**
 * Reports whether an urgent report has missed its response target.
 * @param report the report
 * @param now optional instant
 * @returns true when the report is pending and past its SLA
 */
export function isOverdue(report: Report, now: Date = new Date()): boolean {
  if (!isPending(report)) return false;
  const hours = slaHoursFor(report);
  return now.getTime() - Date.parse(report.createdAt) > hours * 3_600_000;
}

/**
 * Response target for a report, in hours, derived from its severity.
 * @param report the report
 * @returns the number of hours the community is entitled to a first response in
 */
export function slaHoursFor(report: Report): number {
  const table: Readonly<Record<number, number>> = { 4: 1, 3: 12, 2: 48, 1: 120 };
  return table[report.severity] ?? 120;
}

/**
 * Orders the queue: past-due urgent work first, then severity, then oldest.
 * @param reports the reports
 * @param now optional instant
 * @returns a sorted copy
 */
export function sortQueue(reports: readonly Report[], now: Date = new Date()): readonly Report[] {
  return [...reports].sort((left, right) => {
    const leftPending = isPending(left) ? 0 : 1;
    const rightPending = isPending(right) ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    const leftOverdue = isOverdue(left, now) ? 0 : 1;
    const rightOverdue = isOverdue(right, now) ? 0 : 1;
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
    if (left.severity !== right.severity) return right.severity - left.severity;
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
  });
}

/** Values needed to file an appeal. */
export interface NewAppealInput {
  readonly reportId: string;
  readonly appellantUid: string;
  readonly reasonText: string;
  readonly now?: Date | undefined;
}

/**
 * Builds an appeal entity.
 * @param input appeal values
 * @returns a complete appeal entity
 */
export function newAppeal(input: NewAppealInput): Appeal {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: uid(20),
    reportId: input.reportId,
    appellantUid: input.appellantUid,
    reasonText: input.reasonText.trim().slice(0, TEXT_LIMITS.reportReason),
    status: 'open',
    reviewedBy: '',
    decisionNote: '',
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Counts the queue by state, for the counters at the top of the moderation screen.
 * @param reports the reports
 * @returns a count per state
 */
export function countByState(reports: readonly Report[]): Readonly<Record<ReportState, number>> {
  const counts: Record<ReportState, number> = {
    open: 0,
    triaged: 0,
    actioned: 0,
    dismissed: 0,
    escalated: 0,
  };
  for (const report of reports) {
    if (report.deletedAt !== null) continue;
    counts[report.state] += 1;
  }
  return counts;
}
