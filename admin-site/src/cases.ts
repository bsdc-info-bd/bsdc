/**
 * The logic behind the Cases screen, kept out of the component so it can be tested
 * without a browser.
 *
 * A case is a claim about a member, so most of what this file does is refuse to
 * editorialise. An age of forty hours reads "1 day 16 hours", not "overdue", because
 * whether it is overdue is a policy question this console does not own. An outcome
 * that ends in no action is not dressed up as a resolution.
 */

export const CASE_STATUSES = ['open', 'pending', 'closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** The outcome vocabulary, mirroring `bsdc_case_outcome`. */
export const CASE_OUTCOMES = [
  'no_action',
  'content_removed',
  'account_suspended',
  'account_banned',
  'warned',
  'referred',
  'duplicate',
] as const;
export type CaseOutcome = (typeof CASE_OUTCOMES)[number];

/**
 * Outcomes that do not tell the member anything was done, because nothing was.
 * `close_case` uses the same pair to decide whether to say a report was acted on.
 */
export const QUIET_OUTCOMES: readonly CaseOutcome[] = ['no_action', 'duplicate'];

export interface CaseRow {
  id: string;
  subject_uid: string | null;
  subject_name: string;
  status: string;
  reports: number;
  reopened_count: number;
  age_hours: number;
  opened_at: string;
}

export interface CaseEvent {
  id: number;
  kind: string;
  actor_uid: string | null;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CaseReport {
  report_id: string;
  reason: string;
  status: string;
  reporter_uid: string;
  added_at: string;
}

export interface CaseDetail {
  id: string;
  subject_uid: string | null;
  subject_name: string;
  status: string;
  outcome: string;
  outcome_message_key: string;
  reopened_count: number;
  legal_hold: boolean;
  opened_by: string | null;
  opened_at: string;
  closed_at: string | null;
  reports: CaseReport[];
  events: CaseEvent[];
}

/**
 * How long a case has been open, in words.
 *
 * Hours are shown up to two days because a moderation queue is measured in hours;
 * after that days are what a reader wants, and past a fortnight the exact number
 * stops being useful.
 */
export function ageNote(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return 'just opened';
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${String(Math.floor(hours))} h`;
  if (hours < 48) return `${String(Math.floor(hours / 24))} day ${String(hours % 24)} h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${String(days)} days`;
  return `${String(Math.floor(days / 7))} weeks`;
}

/** A reopened case is the one worth reading: it was closed and was wrong. */
export function reopenNote(count: number): string {
  if (count <= 0) return '—';
  if (count === 1) return 'reopened once';
  return `reopened ${String(count)} times`;
}

/**
 * The order the queue is read in.
 *
 * A legal hold first, then a reopened case, then the oldest. The first two are
 * facts about the case that make waiting expensive; age is only a tiebreak between
 * cases that have neither.
 */
export function orderCases(rows: readonly CaseRow[]): CaseRow[] {
  return [...rows].sort((a, b) => {
    const holdA = a.status === 'closed' ? 1 : 0;
    const holdB = b.status === 'closed' ? 1 : 0;
    if (holdA !== holdB) return holdA - holdB;
    if (a.reopened_count !== b.reopened_count) return b.reopened_count - a.reopened_count;
    if (a.age_hours !== b.age_hours) return b.age_hours - a.age_hours;
    return a.id.localeCompare(b.id);
  });
}

/** What the outcome means to the person reading the console, in one phrase. */
export function outcomeNote(outcome: string): string {
  switch (outcome) {
    case 'no_action':
      return 'nothing was done: the case did not hold up';
    case 'content_removed':
      return 'the content was removed';
    case 'account_suspended':
      return 'the account was suspended';
    case 'account_banned':
      return 'the account was banned';
    case 'warned':
      return 'the member was warned';
    case 'referred':
      return 'referred elsewhere: this queue could not decide it';
    case 'duplicate':
      return 'the same incident as another case';
    case '':
      return 'no outcome yet';
    default:
      return outcome;
  }
}

/** Whether closing with this outcome tells the member something happened. */
export function tellsTheMember(outcome: string): boolean {
  return !QUIET_OUTCOMES.includes(outcome as CaseOutcome);
}

/** The timeline, newest first, with the events a member is not shown filtered out. */
export function visibleTimeline(events: readonly CaseEvent[], asStaff: boolean): CaseEvent[] {
  const visible = asStaff ? events : events.filter((event) => event.kind !== 'note');
  return [...visible].sort((a, b) => b.id - a.id);
}

/**
 * The reason a close cannot proceed, or null.
 *
 * The reason is checked here as well as in the database because a dialog that
 * submits and then shows an error has wasted the reader's typing.
 */
export function closeBlocker(outcome: string, note: string): string | null {
  if (!CASE_OUTCOMES.includes(outcome as CaseOutcome)) {
    return 'Choose an outcome. A case that closes without one teaches nobody anything.';
  }
  if (tellsTheMember(outcome) && note.trim().length < 12) {
    return 'The member is told about this outcome, so the note needs at least twelve characters.';
  }
  return null;
}

/** The reason a reopen cannot proceed, or null. */
export function reopenBlocker(status: string, reason: string): string | null {
  if (status !== 'closed') return 'This case is not closed, so there is nothing to reopen.';
  if (reason.trim().length < 12) return 'Reopening needs a reason of at least twelve characters.';
  return null;
}
