/**
 * What a console does when the network does not.
 *
 * Three failures look identical to a user and must be handled differently, and
 * conflating them is what produces a console that hangs forever or one that
 * shows a spinner over a connection that is known to be down.
 *
 * - **Slow.** The request may still succeed. Wait, but not forever: a promise
 *   that never settles is indistinguishable from a hung tab, so every call gets
 *   a deadline.
 * - **Down.** Repeated failures mean the next one will probably fail too.
 *   Continuing to try is what turns a brief outage into a screen that takes
 *   four seconds to say "offline". A breaker stops asking for a while.
 * - **Refused.** A permission error or a validation error is a *successful*
 *   conversation. It must never count toward the breaker, or an operator who
 *   tries something they cannot do three times would be locked out of a console
 *   that is working perfectly.
 *
 * All of it is synchronous state plus injected clocks, so it can be tested
 * without waiting for real time to pass.
 */

/** An error that means the server answered and said no. Never a transport fault. */
export class RefusedError extends Error {
  readonly code: string;

  constructor(message: string, code = 'refused') {
    super(message);
    this.name = 'RefusedError';
    this.code = code;
  }
}

/** A duration a person reads: "1 second", "15 seconds", "2 minutes". */
export function describeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'no time at all';
  if (ms < 60_000) {
    // Round up: a 300ms deadline is "1 second" to a reader, and "0 seconds"
    // would be nonsense in a sentence about waiting.
    const seconds = Math.max(1, Math.ceil(ms / 1_000));
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const minutes = Math.ceil(ms / 60_000);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** A call that ran past its deadline. */
export class TimeoutError extends Error {
  readonly limitMs: number;

  constructor(limitMs: number, what = 'The request') {
    super(`${what} took longer than ${describeDuration(limitMs)} and was abandoned.`);
    this.name = 'TimeoutError';
    this.limitMs = limitMs;
  }
}

/** Default deadlines: a read a person is waiting for, a write they are not. */
export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 30_000;

/**
 * Runs a promise against a deadline.
 *
 * The loser of the race is not cancelled — JavaScript cannot do that — so the
 * caller is responsible for ignoring a late result, which is why this returns a
 * value rather than mutating anything. `onAbandon` fires exactly once, so a
 * caller can log the abandonment without a cleanup timer of its own.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  limitMs: number,
  options: { readonly what?: string; readonly onAbandon?: () => void } = {},
): Promise<T> {
  if (!Number.isFinite(limitMs) || limitMs <= 0) return work;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      options.onAbandon?.();
      reject(new TimeoutError(limitMs, options.what ?? 'The request'));
    }, limitMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** How long to wait before attempt `n` (1-based), capped and jittered. */
export function backoffMs(
  attempt: number,
  options: { readonly baseMs?: number; readonly maxMs?: number; readonly jitter?: number } = {},
): number {
  const base = options.baseMs ?? 400;
  const max = options.maxMs ?? 8_000;
  const jitter = options.jitter ?? 0.2;
  if (attempt < 1) return 0;
  const raw = Math.min(max, base * 2 ** (attempt - 1));
  // Jitter downward only, so the cap is a real cap: several consoles retrying
  // in step is exactly the thundering herd this is meant to avoid.
  const floor = raw * (1 - jitter);
  return Math.round(floor + Math.random() * (raw - floor));
}

export type RetryOptions = {
  /** Total attempts including the first. One means no retry. */
  readonly attempts?: number;
  /** Returning false stops immediately — used for refusals, which never retry. */
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for an error that will not become true by asking again. */
export function isPermanent(error: unknown): boolean {
  if (error instanceof RefusedError) return true;
  if (error instanceof TimeoutError) return false;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      // PostgREST/SQL states where a retry cannot help: permission, constraint,
      // syntax, undefined routine, and the auth states that need a new sign-in.
      if (['42501', '23505', '23514', '42P01', '42883', 'PGRST301', 'PGRST202'].includes(code)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Retries only what is worth retrying.
 *
 * A refusal is surfaced on the first attempt: an operator who typed the wrong
 * value should learn that instantly, not after two silent backoffs.
 */
export async function withRetry<T>(work: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      const retryable =
        attempt < attempts &&
        (options.shouldRetry ? options.shouldRetry(error, attempt) : !isPermanent(error));
      if (!retryable) throw error;
      const delay = backoffMs(attempt);
      options.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The request failed.');
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export type BreakerSnapshot = {
  readonly state: BreakerState;
  /** Consecutive transport failures; refusals do not count. */
  readonly failures: number;
  /** When the breaker opened, so a caller can say how long it has been down. */
  readonly openedAt: number | null;
};

export type BreakerOptions = {
  /** Consecutive failures that open the breaker. */
  readonly threshold?: number;
  /** How long to stay open before allowing one probe. */
  readonly cooldownMs?: number;
  readonly now?: () => number;
};

/**
 * A circuit breaker for one endpoint or one console.
 *
 * `half-open` allows exactly one trial call: if it succeeds the breaker closes,
 * if it fails it reopens with a fresh cooldown. Without that single-probe state
 * a recovering backend gets the whole queue at once the moment the cooldown
 * expires, which is the failure mode breakers exist to prevent.
 */
export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt: number | null = null;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: BreakerOptions = {}) {
    this.threshold = Math.max(1, options.threshold ?? 5);
    this.cooldownMs = Math.max(1, options.cooldownMs ?? 20_000);
    this.now = options.now ?? (() => Date.now());
  }

  snapshot(): BreakerSnapshot {
    this.advance();
    return { state: this.state, failures: this.failures, openedAt: this.openedAt };
  }

  /** True when a call may be attempted right now. */
  canAttempt(): boolean {
    this.advance();
    return this.state !== 'open';
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = null;
  }

  /**
   * Records a failure. A refusal resets nothing and opens nothing: the server
   * answered, so the connection is demonstrably alive.
   */
  recordFailure(error?: unknown): void {
    if (error !== undefined && isPermanent(error)) {
      this.recordSuccess();
      return;
    }
    this.advance();
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }

  /** Milliseconds until the breaker will allow a probe, or 0 when it is closed. */
  retryAfterMs(): number {
    this.advance();
    if (this.state !== 'open' || this.openedAt === null) return 0;
    return Math.max(0, this.openedAt + this.cooldownMs - this.now());
  }

  /** Opens the breaker immediately — used when the browser reports itself offline. */
  trip(): void {
    this.state = 'open';
    this.openedAt = this.now();
    this.failures = Math.max(this.failures, this.threshold);
  }

  private advance(): void {
    if (this.state !== 'open' || this.openedAt === null) return;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'half-open';
      // The probe is the next caller; a failure from here reopens the breaker
      // rather than needing another full cooldown window.
    }
  }
}

/** The user-facing sentence for a breaker that is open. */
export function breakerMessage(snapshot: BreakerSnapshot, retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (snapshot.state === 'open') {
    return seconds > 0
      ? `The console is not reaching the database. Retrying in ${seconds}s.`
      : 'The console is not reaching the database. Retrying now.';
  }
  if (snapshot.state === 'half-open') {
    return 'The console is testing the connection again.';
  }
  return '';
}
