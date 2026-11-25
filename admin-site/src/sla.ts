/**
 * The SLA clock, as logic rather than as a colour.
 *
 * The database owns the policy and the arithmetic — `public.sla_status` is the
 * single answer to "how late is this row". This module exists only to render that
 * answer honestly, and to refuse the two things a countdown does when it is written
 * carelessly: counting down to a deadline that has already passed as though it were
 * still coming, and reporting "overdue" without saying by how much.
 */

export type SlaState = 'ok' | 'watching' | 'breached' | 'met';

export interface SlaRow {
  severity: string;
  age_minutes: number;
  respond_within: number;
  resolve_within: number;
  respond_state: string;
  resolve_state: string;
}

/** The worst of the two clocks. A row that has breached its respond target is late, whatever its resolve target says. */
export function worstState(row: SlaRow): SlaState {
  const rank = (state: string): number =>
    state === 'breached' ? 3 : state === 'watching' ? 2 : state === 'met' ? 1 : 0;
  return rank(row.respond_state) >= rank(row.resolve_state)
    ? normalise(row.respond_state)
    : normalise(row.resolve_state);
}

function normalise(state: string): SlaState {
  if (state === 'breached' || state === 'watching' || state === 'met') return state;
  return 'ok';
}

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
  if (hours < 24) return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
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
 * The tone a tile takes.
 *
 * `met` is deliberately `ok` rather than a separate green: a closed case is not an
 * achievement to celebrate on a queue screen, it is simply no longer waiting.
 */
export function slaTone(state: SlaState): 'neutral' | 'ok' | 'warn' | 'bad' {
  if (state === 'breached') return 'bad';
  if (state === 'watching') return 'warn';
  return 'neutral';
}

/**
 * The order a queue is read in: breached first, then watching, then by age.
 *
 * Arrival order is the wrong default for a queue with a clock, because the row that
 * has been waiting longest is not always the one closest to its deadline — a
 * critical item that arrived an hour ago can be later than a low one from yesterday.
 */
export function orderByLatency<T extends SlaRow>(rows: readonly T[]): T[] {
  const weight = (row: T): number => {
    const state = worstState(row);
    return state === 'breached' ? 0 : state === 'watching' ? 1 : 2;
  };
  return [...rows].sort((a, b) => {
    if (weight(a) !== weight(b)) return weight(a) - weight(b);
    if (a.age_minutes !== b.age_minutes) return b.age_minutes - a.age_minutes;
    return 0;
  });
}

/** How many rows are past their respond target — the number the tab badge shows. */
export function breachedCount(rows: readonly SlaRow[]): number {
  return rows.filter((row) => worstState(row) === 'breached').length;
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
