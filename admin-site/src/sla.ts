/**
 * The SLA clock, as logic rather than as a colour.
 *
 * The database owns the policy and the arithmetic — `public.sla_status` is the
 * single answer to "how late is this row". This module exists only to render that
 * answer honestly, and to refuse the two things a countdown does when it is written
 * carelessly: counting down to a deadline that has already passed as though it were
 * still coming, and reporting "overdue" without saying by how much.
 */

import type { SlaRow } from '@kit';
import { worstState, slaTone, orderByLatency, breachedCount } from '@kit';

export type { SlaRow, SlaState } from '@kit';
export { worstState, slaTone, orderByLatency, breachedCount };

/**
 * How long is left, in words.
 *
 * Past the deadline this says how far past it is, because "overdue" without a
 * magnitude is a word that stops meaning anything by the second day.
 */
export function remainingLabel(row: SlaRow): string {
  const left = Number(row.respond_within) - Number(row.age_minutes);
  if (left < 0) return `${minutesLabel(Math.abs(left))} past target`;
  if (left === 0) return 'due now';
  return `${minutesLabel(left)} left`;
}

/** Minutes as a phrase a person would say. */
export function minutesLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'under a minute';
  if (m < 60) return `${String(m)} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (hours < 24)
    return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${String(days)} d` : `${String(days)} d ${String(restHours)} h`;
}

/** How much of the respond budget is spent, 0 to 1 and beyond. */
export function budgetUsed(row: SlaRow): number {
  const budget = Number(row.respond_within);
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.max(0, Number(row.age_minutes) / budget);
}

/**
 * One sentence for the top of the queue.
 *
 * An empty queue says so plainly. A queue with nothing late says so too, rather
 * than leaving a blank strip that a reader has to interpret.
 */
export function queueSummary(rows: readonly SlaRow[]): string {
  if (rows.length === 0) return 'Nothing is waiting.';
  const late = breachedCount(rows);
  if (late === 0) {
    return `${String(rows.length)} waiting, none past its target.`;
  }
  return `${String(rows.length)} waiting, ${String(late)} past ${late === 1 ? 'its' : 'their'} target.`;
}

/** Whether a row needs a decision before anything else. */
export function isOverdue(row: SlaRow): boolean {
  return worstState(row) === 'breached';
}
