/**
 * BSDC — src/core/config/flags.ts
 * Purpose : Runtime feature-flag state: schedules, precedence and window validation.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The build-time register lives in features.ts. This module answers the only question
 *   the product ever asks at runtime: is this flag on, right now, for this person?
 *   Precedence, highest first:
 *     1. `forceOff` — a kill switch. An operator who has seen a feature break does not want it
 *        coming back on a schedule.
 *     2. A schedule with an end in the past, or a start in the future — the window is closed.
 *     3. The runtime `enabled` value.
 *     4. The build-time default, which is ON for every shipped feature (LAW-11).
 *   The evaluation is pure and takes `now` as an argument, so it can be tested without clocks and
 *   replayed by the Cloud Function that decides the same question on the server. An unknown remote
 *   key is ignored rather than trusted: a bad document can never disable the shell.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** One flag's runtime state, as stored in Firestore under `featureFlags/{key}`. */
export interface FlagState {
  /** Matches a key in FLAG_KEYS. */
  readonly key: string;
  /** Operator's switch. Undefined means "not set here", which defers to the default. */
  readonly enabled: boolean;
  /** Kill switch. When true the flag is off regardless of everything else. */
  readonly forceOff: boolean;
  /** ISO instant the flag turns on; null means no start bound. */
  readonly startsAt: string | null;
  /** ISO instant the flag turns off; null means no end bound. */
  readonly endsAt: string | null;
  readonly updatedByUid: string;
  readonly updatedAt: string;
  /** Why the change was made, recorded for the audit trail. */
  readonly note: string;
}

/** Outcome of evaluating a flag, with the reason, so an operator can see why. */
export interface FlagVerdict {
  readonly enabled: boolean;
  readonly reason: 'forced-off' | 'not-started' | 'ended' | 'scheduled' | 'runtime' | 'default';
  /** True when a schedule is driving the answer right now. */
  readonly scheduled: boolean;
}

/** Validation result for a window the operator is trying to set. */
export type WindowVerdict = { readonly ok: true } | { readonly ok: false; readonly code: string };

/** The newest a scheduled window may be scheduled to close, in days. */
export const MAX_SCHEDULE_DAYS = 365;

/**
 * Builds the neutral runtime state of a flag, which defers entirely to the build-time default.
 * @param key flag key
 * @returns the neutral state
 */
export function neutralFlagState(key: string): FlagState {
  return {
    key,
    enabled: true,
    forceOff: false,
    startsAt: null,
    endsAt: null,
    updatedByUid: '',
    updatedAt: new Date(0).toISOString(),
    note: '',
  };
}

/**
 * Validates a scheduled window before it is written.
 * @param startsAt ISO instant, or null for no start bound
 * @param endsAt ISO instant, or null for no end bound
 * @param now the instant to validate against
 * @returns the verdict
 */
export function validateFlagWindow(
  startsAt: string | null,
  endsAt: string | null,
  now: Date = new Date(),
): WindowVerdict {
  if (startsAt === null && endsAt === null) return { ok: true };
  const start = startsAt === null ? null : Date.parse(startsAt);
  const end = endsAt === null ? null : Date.parse(endsAt);
  if (start !== null && Number.isNaN(start)) return { ok: false, code: 'BSDC-FLAG-001' };
  if (end !== null && Number.isNaN(end)) return { ok: false, code: 'BSDC-FLAG-002' };
  if (start !== null && end !== null && end <= start) {
    return { ok: false, code: 'BSDC-FLAG-003' };
  }
  if (end !== null && end <= now.getTime()) return { ok: false, code: 'BSDC-FLAG-004' };
  const horizon = now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
  if (start !== null && start > horizon) return { ok: false, code: 'BSDC-FLAG-005' };
  if (end !== null && end > horizon) return { ok: false, code: 'BSDC-FLAG-005' };
  return { ok: true };
}

/**
 * Evaluates one flag at one instant.
 * @param state the runtime state
 * @param defaultOn the build-time default
 * @param now the instant
 * @returns the verdict and the reason for it
 */
export function evaluateFlag(
  state: FlagState | undefined,
  defaultOn: boolean,
  now: Date = new Date(),
): FlagVerdict {
  if (state === undefined) {
    return { enabled: defaultOn, reason: 'default', scheduled: false };
  }
  if (state.forceOff) {
    return { enabled: false, reason: 'forced-off', scheduled: false };
  }
  const at = now.getTime();
  const start = state.startsAt === null ? null : Date.parse(state.startsAt);
  const end = state.endsAt === null ? null : Date.parse(state.endsAt);
  if (start !== null && !Number.isNaN(start) && at < start) {
    return { enabled: false, reason: 'not-started', scheduled: true };
  }
  if (end !== null && !Number.isNaN(end) && at >= end) {
    return { enabled: false, reason: 'ended', scheduled: true };
  }
  if (start !== null || end !== null) {
    return { enabled: state.enabled, reason: 'scheduled', scheduled: true };
  }
  return { enabled: state.enabled, reason: 'runtime', scheduled: false };
}

/**
 * Evaluates a whole register.
 * @param defaults the build-time defaults, keyed by flag key
 * @param states the runtime states
 * @param now the instant
 * @returns flag key to enabled
 */
export function evaluateFlags(
  defaults: ReadonlyMap<string, boolean>,
  states: readonly FlagState[],
  now: Date = new Date(),
): ReadonlyMap<string, FlagVerdict> {
  const byKey = new Map<string, FlagState>();
  for (const state of states) {
    if (!defaults.has(state.key)) continue;
    byKey.set(state.key, state);
  }
  const verdicts = new Map<string, FlagVerdict>();
  for (const [key, defaultOn] of defaults) {
    verdicts.set(key, evaluateFlag(byKey.get(key), defaultOn, now));
  }
  return verdicts;
}

/**
 * Reports whether a flag is on right now.
 * @param state the runtime state
 * @param defaultOn the build-time default
 * @param now the instant
 * @returns true when the feature is live
 */
export function isFlagOn(
  state: FlagState | undefined,
  defaultOn: boolean,
  now: Date = new Date(),
): boolean {
  return evaluateFlag(state, defaultOn, now).enabled;
}

/**
 * Describes the window a flag is running under, for the operator's list.
 * @param state the runtime state
 * @returns a short, human description of the schedule
 */
export function describeWindow(state: FlagState): 'none' | 'scheduled' | 'expired' | 'pending' {
  if (state.startsAt === null && state.endsAt === null) return 'none';
  const now = Date.now();
  const start = state.startsAt === null ? null : Date.parse(state.startsAt);
  const end = state.endsAt === null ? null : Date.parse(state.endsAt);
  if (end !== null && !Number.isNaN(end) && now >= end) return 'expired';
  if (start !== null && !Number.isNaN(start) && now < start) return 'pending';
  return 'scheduled';
}

/**
 * Counts how many flags a register turns off, which is the number an operator actually wants to
 * see: everything is on by default, so the interesting count is the exceptions.
 * @param defaults the build-time defaults
 * @param states the runtime states
 * @param now the instant
 * @returns how many flags are off
 */
export function countDisabled(
  defaults: ReadonlyMap<string, boolean>,
  states: readonly FlagState[],
  now: Date = new Date(),
): number {
  let off = 0;
  for (const verdict of evaluateFlags(defaults, states, now).values()) {
    if (!verdict.enabled) off += 1;
  }
  return off;
}
