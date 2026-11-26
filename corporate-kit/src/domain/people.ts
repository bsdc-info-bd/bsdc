/**
 * A person's record, an appeal, and a shift — as logic rather than as colour.
 *
 * Three consoles ask about one domain, and this is the part of the answer they
 * share. The rules here are the ones a screen would otherwise get subtly wrong:
 *
 *   * a timeline is read newest first and is *merged*, so the kind filter must not
 *     reorder what it filters;
 *   * an appeal's reviewer may not be its original decider, which is a fact the
 *     console must show before the button is pressed rather than after;
 *   * a reliability rate over no decisions is unknown, not zero.
 *
 * Every function here is pure. The database decides; this renders the answer.
 */

// ---------------------------------------------------------------------------
// The person record
// ---------------------------------------------------------------------------

/** One line in a person's history, from whichever source produced it. */
export interface TimelineEvent {
  readonly occurred_at: string;
  readonly kind: string;
  readonly summary: string;
  readonly detail: string;
  readonly reference: string;
}

/**
 * What a kind means, in the words a moderator would use.
 *
 * The prefix before the first dot is the family, and the family is what the filter
 * offers: eleven kinds is a filter nobody uses, and four families is one they do.
 */
export interface KindFamily {
  readonly key: string;
  readonly label: string;
  readonly explanation: string;
}

const FAMILIES: readonly KindFamily[] = [
  {
    key: 'report',
    label: 'Reports',
    explanation:
      'Reports they filed, and reports filed about them. Both are this person’s history.',
  },
  { key: 'moderation', label: 'Actions taken', explanation: 'What was done to them, and by whom.' },
  {
    key: 'standing',
    label: 'Standing',
    explanation: 'Every movement of their score, with the rule behind it.',
  },
  { key: 'appeal', label: 'Appeals', explanation: 'Decisions they asked to have looked at again.' },
  { key: 'case', label: 'Cases', explanation: 'Cases opened about them.' },
  {
    key: 'certificate',
    label: 'Certificates',
    explanation: 'Documents they hold, and any that were revoked.',
  },
  { key: 'role', label: 'Role changes', explanation: 'Changes to what they are allowed to do.' },
];

/** The family a kind belongs to. An unknown kind keeps its own name as the family. */
export function familyOf(kind: string): string {
  const dot = kind.indexOf('.');
  return dot === -1 ? kind : kind.slice(0, dot);
}

export function families(events: readonly TimelineEvent[]): readonly KindFamily[] {
  const present = new Set(events.map((event) => familyOf(event.kind)));
  // Ordered by the canonical list rather than by what happens to be present, so the
  // filter does not reorder itself as the data changes underneath the reader.
  return FAMILIES.filter((family) => present.has(family.key));
}

export function familyLabel(key: string): string {
  return FAMILIES.find((family) => family.key === key)?.label ?? key;
}

/**
 * The sentence a kind reads as.
 *
 * `moderation.hide_content` must not be shown to a member as "moderation.hide
 * content". Members read these too — the timeline is on their own record — so the
 * words matter more than the brevity.
 */
export function describeKind(kind: string): string {
  const [family, ...rest] = kind.split('.');
  const detail = rest.join('.');
  if (family === 'report') {
    return detail === 'filed'
      ? 'Reported somebody'
      : detail === 'about'
        ? 'Was reported'
        : `Report ${detail}`;
  }
  if (family === 'moderation') {
    switch (detail) {
      case 'warn':
        return 'Was warned';
      case 'dismiss':
        return 'Report dismissed';
      case 'hide_content':
        return 'Content hidden';
      case 'restore_content':
        return 'Content restored';
      case 'suspend_account':
        return 'Account suspended';
      case 'restore_account':
        return 'Account restored';
      case 'ban_account':
        return 'Account banned';
      default:
        return `Moderation: ${detail.split('_').join(' ')}`;
    }
  }
  if (family === 'standing') {
    return detail.startsWith('ladder.')
      ? `Ladder step (${detail.slice(7)})`
      : `Standing: ${detail}`;
  }
  if (family === 'appeal') return detail === 'filed' ? 'Appealed a decision' : `Appeal ${detail}`;
  if (family === 'case') return detail === 'opened' ? 'A case was opened' : `Case ${detail}`;
  if (family === 'certificate')
    return detail === 'revoked' ? 'Certificate revoked' : 'Certificate issued';
  if (family === 'role') return 'Their role changed';
  return kind;
}

/** Keep only the chosen families, without changing the order of what is left. */
export function filterTimeline(
  events: readonly TimelineEvent[],
  chosen: readonly string[],
): readonly TimelineEvent[] {
  if (chosen.length === 0) return [...events];
  const wanted = new Set(chosen);
  return events.filter((event) => wanted.has(familyOf(event.kind)));
}

/** Newest first, with a stable tiebreak so two events in one second do not swap. */
export function orderTimeline(events: readonly TimelineEvent[]): readonly TimelineEvent[] {
  return [...events].sort((a, b) => {
    const delta = Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
    if (delta !== 0) return delta;
    return b.reference.localeCompare(a.reference);
  });
}

/** The strip at the top: what needs somebody today. */
export interface OpenItems {
  readonly open_reports: number;
  readonly open_cases: number;
  readonly open_appeals: number;
  readonly active_standing: number;
  readonly is_suspended: boolean;
  readonly last_action_at: string | null;
}

/**
 * The strip as a sentence, because six numbers in a row is a dashboard and one
 * sentence is an answer.
 *
 * The rule is that a zero is not mentioned. "0 open cases" is noise on a card about
 * a person who is fine, and a card that always shows six things teaches a reader to
 * skim all six.
 */
export function openItemsSummary(items: OpenItems): string {
  const parts: string[] = [];
  if (items.is_suspended) parts.push('suspended');
  if (items.open_reports > 0)
    parts.push(`${items.open_reports} open report${items.open_reports === 1 ? '' : 's'}`);
  if (items.open_cases > 0)
    parts.push(`${items.open_cases} open case${items.open_cases === 1 ? '' : 's'}`);
  if (items.open_appeals > 0)
    parts.push(`${items.open_appeals} open appeal${items.open_appeals === 1 ? '' : 's'}`);
  if (items.active_standing !== 0)
    parts.push(`${items.active_standing > 0 ? '+' : ''}${items.active_standing} standing`);

  if (parts.length === 0) {
    return items.last_action_at === null
      ? 'Nothing has happened to this account, and nothing is open.'
      : 'Nothing is open against this account.';
  }
  return parts.join(' · ');
}

/** Whether anything in the strip needs somebody today. */
export function needsAttention(items: OpenItems): boolean {
  return (
    items.is_suspended || items.open_reports > 0 || items.open_cases > 0 || items.open_appeals > 0
  );
}

// ---------------------------------------------------------------------------
// The warning ladder
// ---------------------------------------------------------------------------

export interface LadderRung {
  readonly severity: string;
  readonly rung: string;
  readonly points: number;
  readonly rule_key: string | null;
  readonly duration_days: number | null;
  readonly message_en: string;
  readonly message_bn: string;
  readonly next_rung: string | null;
}

/** The rung a severity reaches, or null when the policy has no row for it. */
export function rungFor(rungs: readonly LadderRung[], severity: string): LadderRung | null {
  return rungs.find((rung) => rung.severity === severity) ?? null;
}

/**
 * What the member will be told, including the next step.
 *
 * This mirrors the database's own sentence construction, and the duplication is
 * deliberate: the screen must show the message *before* the moderator commits, and
 * a screen that shows a different sentence from the one sent is worse than a screen
 * that shows none. A test asserts the two agree.
 */
export function previewMessage(rung: LadderRung): string {
  if (rung.next_rung === null) return rung.message_en;
  return `${rung.message_en} The next step would be: ${rung.next_rung}.`;
}

/** The effect of taking a rung, in one line a moderator can check before clicking. */
export function rungEffect(rung: LadderRung): string {
  const points = rung.points === 0 ? 'no standing change' : `−${rung.points} standing`;
  const duration =
    rung.duration_days === null ? 'no expiry' : `expires in ${rung.duration_days} days`;
  return `${points}, ${duration}`;
}

/** The ladder in order, lightest first, which is how a moderator reads it. */
const RUNG_ORDER = ['nudge', 'warning', 'restriction', 'suspension_review'] as const;

export function orderLadder(rungs: readonly LadderRung[]): readonly LadderRung[] {
  return [...rungs].sort((a, b) => {
    const ai = RUNG_ORDER.indexOf(a.rung as (typeof RUNG_ORDER)[number]);
    const bi = RUNG_ORDER.indexOf(b.rung as (typeof RUNG_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/** Whether a ladder step may be taken at all, and why not. */
export function ladderBlocker(
  rung: LadderRung | null,
  reason: string,
  actorUid: string,
  subjectUid: string,
): string | null {
  if (rung === null) return 'Pick a severity; each one reaches a different rung.';
  if (actorUid === subjectUid) return 'You cannot apply a warning to yourself.';
  if (reason.trim().length < 12) {
    return 'Write at least twelve characters. The member reads this as the reason they were warned.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Appeals
// ---------------------------------------------------------------------------

export interface AppealRow {
  readonly id: string;
  readonly appellant_uid: string;
  readonly appellant: string;
  readonly summary: string;
  readonly subject: string;
  readonly status: string;
  readonly severity: string;
  readonly age_minutes: number;
  readonly respond_within: number;
  readonly respond_state: string;
  readonly original_actor: string;
  readonly reviewer_uid: string | null;
  readonly created_at: string;
}

/**
 * Why this person may not review this appeal, or null when they may.
 *
 * This is the console half of the rule the database enforces. It exists so the
 * button is absent rather than failing: a reviewer who is told "you made this
 * decision" *after* typing an outcome has lost the work they did reading it.
 */
export function reviewBlocker(appeal: AppealRow, reviewerUid: string): string | null {
  if (appeal.original_actor === reviewerUid) {
    return 'You made the decision being appealed. Somebody else has to review it.';
  }
  if (appeal.appellant_uid === reviewerUid) {
    return 'This is your own appeal.';
  }
  if (appeal.status === 'upheld' || appeal.status === 'rejected' || appeal.status === 'withdrawn') {
    return `This appeal has already been ${appeal.status}.`;
  }
  if (appeal.reviewer_uid !== null && appeal.reviewer_uid !== reviewerUid) {
    return 'Somebody else is already reviewing this appeal.';
  }
  return null;
}

/** Whether this appeal is one the current person can pick up. */
export function canClaim(appeal: AppealRow, reviewerUid: string): boolean {
  return appeal.status === 'open' && reviewBlocker(appeal, reviewerUid) === null;
}

/**
 * Appeals in the order a reviewer works them: breached first, then watching, then
 * the rest, and oldest first inside each band.
 *
 * That is the same order `appeals_queue` returns, repeated here because a console
 * that re-sorted the rows would be showing a different urgency from the one the
 * database computed.
 */
export function orderAppeals(rows: readonly AppealRow[]): readonly AppealRow[] {
  const band = (state: string): number => (state === 'breached' ? 0 : state === 'watching' ? 1 : 2);
  return [...rows].sort((a, b) => {
    const delta = band(a.respond_state) - band(b.respond_state);
    if (delta !== 0) return delta;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

/** How many appeals are past their respond target. */
export function breachedAppeals(rows: readonly AppealRow[]): number {
  return rows.filter((row) => row.respond_state === 'breached').length;
}

/** What the queue holds, in one line. */
export function appealQueueSummary(rows: readonly AppealRow[]): string {
  if (rows.length === 0) return 'No appeal is waiting.';
  const breached = breachedAppeals(rows);
  const oldest = Math.max(...rows.map((row) => row.age_minutes));
  const waiting = `${rows.length} appeal${rows.length === 1 ? '' : 's'} waiting`;
  const late = breached === 0 ? 'none past target' : `${breached} past target`;
  return `${waiting} · ${late} · the oldest has waited ${hoursLabel(oldest)}`;
}

function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** What the member is told when their appeal is decided. Mirrors the database. */
export function appealOutcomeMessage(upheld: boolean, outcome: string): string {
  return upheld
    ? `Your appeal was upheld. ${outcome.trim()}`
    : `Your appeal was not upheld. ${outcome.trim()}`;
}

/** Why a decision cannot be submitted yet. */
export function decisionBlocker(
  outcome: string,
  reviewerUid: string,
  appeal: AppealRow,
): string | null {
  const blocked = reviewBlocker(appeal, reviewerUid);
  if (blocked !== null) return blocked;
  if (outcome.trim().length < 12) {
    return 'Explain the decision in at least twelve characters. The member reads it.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reporter reliability and signals
// ---------------------------------------------------------------------------

export interface Reliability {
  readonly filed: number;
  readonly upheld: number;
  readonly dismissed: number;
  readonly open: number;
  readonly upheld_rate: number | null;
}

/**
 * What a reliability score means, and the honesty it requires.
 *
 * A null rate is not 0%. A brand-new reporter has no decided reports, and showing
 * "0%" beside their name is a claim the data does not support — the exact mistake
 * the plan warns about, in the exact place it would do most damage.
 */
export function reliabilityLabel(reliability: Reliability): string {
  if (reliability.upheld_rate === null) {
    if (reliability.filed === 0) return 'Has never reported anything.';
    return `No decision yet on ${reliability.filed} report${reliability.filed === 1 ? '' : 's'}.`;
  }
  const percent = Math.round(reliability.upheld_rate * 100);
  const decided = reliability.upheld + reliability.dismissed;
  return `${percent}% of ${decided} decided report${decided === 1 ? '' : 's'} were upheld.`;
}

/** How many decided reports it takes before a percentage means anything. */
export const RELIABILITY_FLOOR = 5;

/** Whether the score is worth showing as a figure at all, or only as a sentence. */
export function reliabilityIsMeaningful(reliability: Reliability): boolean {
  // Five decisions is the floor below which a percentage is noise. It is a
  // judgement, and it is written down so it can be argued with.
  return (
    reliability.upheld + reliability.dismissed >= RELIABILITY_FLOOR &&
    reliability.upheld_rate !== null
  );
}

export interface PersonSignal {
  readonly signal: string;
  readonly value_hash: string;
  readonly shared_with: number;
  readonly first_seen: string;
  readonly last_seen: string;
}

/**
 * How a signal reads, in a sentence that cannot be mistaken for a verdict.
 *
 * The number of shared accounts is a fact; that two accounts are one operator is a
 * conclusion the reader draws. The wording keeps that gap open, because the plan is
 * explicit that detection links by signal and never by name, and a detection that
 * reads like a conviction gets used like one.
 */
export function signalSentence(signal: PersonSignal): string {
  if (signal.signal === 'device') {
    if (signal.shared_with === 0) return 'No other account has signed in from this device.';
    return `${signal.shared_with} other account${signal.shared_with === 1 ? ' has' : 's have'} signed in from this device. A shared browser produces this too.`;
  }
  if (signal.signal === 'instrument') {
    return `${signal.shared_with} other account${signal.shared_with === 1 ? ' uses' : 's use'} the same payment instrument.`;
  }
  return `${signal.shared_with} other account${signal.shared_with === 1 ? '' : 's'} share this signal.`;
}

/** Whether a signal is worth a reader's attention at all. */
export function signalWorthShowing(signal: PersonSignal): boolean {
  return signal.shared_with > 0;
}

// ---------------------------------------------------------------------------
// The shift console
// ---------------------------------------------------------------------------

export interface ShiftBoardRow {
  readonly shift_id: string;
  readonly shift_name: string;
  readonly on_date: string;
  readonly headcount: number;
  readonly open_reports: number;
  readonly breached: number;
  readonly handover: string;
  readonly handover_at: string | null;
  readonly previous_handover: string | null;
}

export const SHIFT_ORDER = ['general', 'morning', 'evening', 'night'] as const;

/** Who is on, what is open, and whether anybody is covering it. */
export function shiftSentence(row: ShiftBoardRow): string {
  if (row.headcount === 0) {
    return 'Nobody is assigned. This shift is uncovered.';
  }
  const people = `${row.headcount} ${row.headcount === 1 ? 'person' : 'people'}`;
  const open = row.open_reports === 0 ? 'nothing open' : `${row.open_reports} open`;
  const late = row.breached === 0 ? '' : `, ${row.breached} past the target`;
  return `${people} · ${open}${late}`;
}

/** A shift with nobody on it, which is the thing a roster exists to prevent. */
export function uncoveredShifts(rows: readonly ShiftBoardRow[]): readonly ShiftBoardRow[] {
  return rows.filter((row) => row.headcount === 0);
}

/** Whether a handover is due: the shift is ending and nobody has written one. */
export function handoverDue(row: ShiftBoardRow, now: Date): boolean {
  if (row.handover !== '') return false;
  const date = new Date(`${row.on_date}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date <= now;
}

/** The note the person opening a shift needs to read first, or why there is none. */
export function handoverFor(row: ShiftBoardRow): {
  readonly note: string | null;
  readonly reason: string;
} {
  if (row.previous_handover !== null && row.previous_handover.trim() !== '') {
    return { note: row.previous_handover, reason: 'Written by the shift before this one.' };
  }
  if (row.handover.trim() !== '') {
    return { note: row.handover, reason: 'Written for this shift.' };
  }
  return {
    note: null,
    reason: 'No handover has been written for this shift or the one before it.',
  };
}

/** Shifts in reading order, which is the order somebody works through them. */
export function orderShifts(rows: readonly ShiftBoardRow[]): readonly ShiftBoardRow[] {
  return [...rows].sort((a, b) => {
    if (a.on_date !== b.on_date) return a.on_date.localeCompare(b.on_date);
    return (
      SHIFT_ORDER.indexOf(a.shift_name as (typeof SHIFT_ORDER)[number]) -
      SHIFT_ORDER.indexOf(b.shift_name as (typeof SHIFT_ORDER)[number])
    );
  });
}

// ---------------------------------------------------------------------------
// The clock, in the one place both consoles read it
// ---------------------------------------------------------------------------
//
// This lived in `admin-site` until the moderation console needed the same answer.
// Two copies of a triage function is how an appeals queue and an approvals queue
// come to disagree about which row is urgent, so it moved here the first time a
// second caller existed rather than the second time somebody noticed.

export type SlaState = 'ok' | 'watching' | 'breached' | 'met';

export interface SlaRow {
  readonly severity: string;
  readonly age_minutes: number;
  readonly respond_within: number;
  readonly resolve_within: number;
  readonly respond_state: string;
  readonly resolve_state: string;
}

function normaliseState(state: string): SlaState {
  if (state === 'breached' || state === 'watching' || state === 'met') return state;
  return 'ok';
}

/** The worst of the two clocks: a row that breached its respond target is late whatever else says. */
export function worstState(row: SlaRow): SlaState {
  const rank = (state: string): number =>
    state === 'breached' ? 3 : state === 'watching' ? 2 : state === 'met' ? 1 : 0;
  return rank(row.respond_state) >= rank(row.resolve_state)
    ? normaliseState(row.respond_state)
    : normaliseState(row.resolve_state);
}

/**
 * The tone a tile takes.
 *
 * `met` is `neutral` rather than a separate green: a closed case is not an
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
 * critical item from an hour ago can be later than a low one from yesterday.
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

/** How many rows are past their respond target. */
export function breachedCount(rows: readonly SlaRow[]): number {
  return rows.filter((row) => worstState(row) === 'breached').length;
}
