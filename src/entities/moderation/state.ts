/**
 * BSDC — src/entities/moderation/state.ts
 * Purpose : The legal transitions of a report, enforced identically in the client and in Functions.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A report is a state machine, and this file is the machine. It is imported by the
 *   moderation screen (so a reviewer never sees an action that would be refused) and by the Cloud
 *   Function that decides (which refuses it anyway). Duplicating the rule in two places is not a
 *   risk here because one file is the source and both are generated from it.
 *   The rules that matter: a decided report cannot be re-decided, an appeal goes to somebody who
 *   did not make the original call, and every transition records who made it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  MAX_APPEALS_PER_REPORT,
  REPORT_TERMINAL_STATES,
  actionDefinition,
  type ModerationAction,
  type ReportState,
} from '@/core/config/moderation';
import { isDecided, type Appeal, type Report } from './model';

/** Which actions are legal from which state. */
const ALLOWED: Readonly<Record<ReportState, readonly ModerationAction[]>> = {
  open: ['dismiss', 'remove', 'hide', 'warn', 'restrict', 'suspend', 'escalate'],
  triaged: ['dismiss', 'remove', 'hide', 'warn', 'restrict', 'suspend', 'escalate'],
  escalated: ['dismiss', 'remove', 'hide', 'warn', 'restrict', 'suspend'],
  actioned: [],
  dismissed: [],
};

/**
 * Reports whether an action is legal from a state.
 * @param state the current state
 * @param action the action
 * @returns true when the transition is allowed
 */
export function canTakeAction(state: ReportState, action: ModerationAction): boolean {
  return ALLOWED[state].includes(action);
}

/**
 * Lists the actions a reviewer may take from a state.
 * @param state the current state
 * @returns the legal actions
 */
export function availableActions(state: ReportState): readonly ModerationAction[] {
  return ALLOWED[state];
}

/** The state an action moves a report to. */
export function stateAfter(action: ModerationAction): ReportState {
  return action === 'escalate' ? 'escalated' : action === 'dismiss' ? 'dismissed' : 'actioned';
}

/**
 * Applies an action to a report and returns the next state, refusing illegal transitions.
 * @param report the report
 * @param action the action
 * @param actorUid the reviewer
 * @returns the next state, or null when the transition is refused
 */
export function transition(
  report: Report,
  action: ModerationAction,
  actorUid: string,
): { readonly state: ReportState; readonly decidedBy: string } | null {
  if (report.deletedAt !== null) return null;
  if (actorUid.length === 0) return null;
  if (!canTakeAction(report.state, action)) return null;
  return { state: stateAfter(action), decidedBy: actorUid };
}

/**
 * Reports whether an action needs a written note before it can be submitted.
 * @param action the action
 * @returns true when the note is mandatory
 */
export function requiresNote(action: ModerationAction): boolean {
  return actionDefinition(action).notifiesAuthor;
}

/**
 * Points revoked from the author when an action lands.
 * @param action the action
 * @returns the penalty
 */
export function pointPenalty(action: ModerationAction): number {
  return actionDefinition(action).pointPenalty;
}

/**
 * Reports whether an appeal may be filed against a report.
 * @param report the report
 * @param existingAppeals appeals already filed for this report
 * @returns true when one more appeal is allowed
 */
export function canAppeal(report: Report, existingAppeals: readonly Appeal[] = []): boolean {
  if (!isDecided(report)) return false;
  const used = existingAppeals.filter((appeal) => appeal.deletedAt === null).length;
  return used < MAX_APPEALS_PER_REPORT;
}

/**
 * Reports why an appeal was refused, in a form the UI can translate.
 * @param report the report
 * @param existingAppeals appeals already filed
 * @returns a refusal reason, or null when an appeal is allowed
 */
export function appealRefusal(
  report: Report,
  existingAppeals: readonly Appeal[],
): 'not-decided' | 'already-used' | null {
  if (!isDecided(report)) return 'not-decided';
  const used = existingAppeals.filter((appeal) => appeal.deletedAt === null).length;
  if (used >= MAX_APPEALS_PER_REPORT) return 'already-used';
  return null;
}

/**
 * Reports whether a reviewer is allowed to review an appeal.
 * The answer is no when they made the original decision, which is the whole point of an appeal.
 * @param report the report
 * @param reviewerUid the reviewer
 * @returns true when this reviewer may read the appeal
 */
export function canReviewAppeal(report: Report, reviewerUid: string): boolean {
  return report.decidedBy.length > 0 && report.decidedBy !== reviewerUid;
}

/**
 * The state an appeal outcome moves the original report to.
 * @param outcome the appeal outcome
 * @returns the resulting report state
 */
export function stateAfterAppeal(outcome: 'upheld' | 'rejected'): ReportState {
  return outcome === 'upheld' ? 'dismissed' : 'actioned';
}

/**
 * Reports whether a report has reached a state from which it cannot move without an appeal.
 * @param report the report
 * @returns true for terminal states
 */
export function isTerminal(report: Report): boolean {
  return REPORT_TERMINAL_STATES.includes(report.state);
}
