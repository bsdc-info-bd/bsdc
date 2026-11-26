import { getDb } from './client';
import type { CorporateEnv } from './env';
import { DataError, toDataError } from './rpc';
import {
  CircuitBreaker,
  READ_TIMEOUT_MS,
  RefusedError,
  WRITE_TIMEOUT_MS,
  breakerMessage,
  isPermanent,
  withRetry,
  withTimeout,
} from './resilience';
import { isChunkLoadFailure } from './chunk-recovery';

/**
 * The one place a console reads or writes.
 *
 * `rpc.ts` already turns a PostgREST failure into a sentence a person can read.
 * This layer adds the three things every screen otherwise re-implements, usually
 * badly: a deadline, a breaker, and — for reads — the moment the answer was
 * true.
 *
 * Everything here funnels through `run()`, so there is exactly one place where
 * "did this succeed" is decided. A console that calls `getDb().rpc()` directly
 * bypasses the breaker and the deadline, which is why the lint rule forbids it
 * in a screen (§19.3).
 */

export type ReadResult<T> = {
  readonly data: T;
  /** When the request returned, so the panel can state its own age. */
  readonly fetchedAt: number;
  /** How long it took, for the performance console. */
  readonly durationMs: number;
};

export type CallOptions = {
  /** Overrides the default deadline for this call. */
  readonly timeoutMs?: number;
  /** How many attempts for a transport fault. Refusals never retry. */
  readonly attempts?: number;
  /** A sentence naming the thing being loaded, used in a timeout message. */
  readonly what?: string;
  readonly signal?: AbortSignal | undefined;
};

/** One breaker per console+purpose, so a read failure does not stop writes. */
const breakers = new Map<string, CircuitBreaker>();

/** The breaker key used by a console's reads. */
export function breakerFor(scope: string): CircuitBreaker {
  const existing = breakers.get(scope);
  if (existing) return existing;
  const created = new CircuitBreaker({ threshold: 5, cooldownMs: 20_000 });
  breakers.set(scope, created);
  return created;
}

/** Test helper: forget every breaker, as a fresh page load would. */
export function resetBreakers(): void {
  breakers.clear();
}

/** What a caller sees when the breaker is open: a sentence, not a spinner. */
export class OfflineError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'OfflineError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * True when a PostgREST error is the server saying no.
 *
 * This is the distinction the breaker depends on: a permission refusal proves
 * the connection works, and counting it would lock an operator out of a console
 * that is functioning perfectly.
 */
export function isRefusal(error: unknown): boolean {
  if (error instanceof RefusedError) return true;
  if (error instanceof DataError) {
    return ['42501', '23505', '23514', 'PGRST301', 'PGRST202', '42883'].includes(error.code);
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && isPermanent(error);
  }
  return false;
}

/**
 * Runs one database call with a deadline, a retry policy and a breaker.
 *
 * The order matters. The breaker is checked *first* — asking a dead connection
 * five times to prove it is dead is exactly the four seconds of spinner this
 * exists to remove. The deadline wraps the retries rather than each attempt, so
 * three attempts cannot take three times as long as the operator was promised.
 */
async function run<T>(
  scope: string,
  call: () => Promise<T>,
  options: CallOptions & { readonly deadlineMs: number },
): Promise<{ value: T; durationMs: number; fetchedAt: number }> {
  const breaker = breakerFor(scope);
  if (!breaker.canAttempt()) {
    const retryAfterMs = breaker.retryAfterMs();
    throw new OfflineError(breakerMessage(breaker.snapshot(), retryAfterMs), retryAfterMs);
  }

  const startedAt = Date.now();
  try {
    const value = await withTimeout(
      withRetry(call, {
        attempts: options.attempts ?? 3,
        shouldRetry: (error) => !isRefusal(error) && !isChunkLoadFailure(error),
        onRetry: () => {
          // Every retry is a signal the network is unhappy; the breaker should
          // hear about it even though this attempt might still succeed.
        },
      }),
      options.timeoutMs ?? options.deadlineMs,
      {
        ...(options.what === undefined ? {} : { what: options.what }),
        onAbandon: () => breaker.recordFailure(),
      },
    );
    breaker.recordSuccess();
    return { value, durationMs: Date.now() - startedAt, fetchedAt: Date.now() };
  } catch (error) {
    breaker.recordFailure(error);
    throw error;
  }
}

/** A read: bounded, retried, broken-circuit-aware, and self-dating. */
export async function readRpc<T>(
  env: CorporateEnv,
  scope: string,
  name: string,
  args: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<ReadResult<T>> {
  const outcome = await run(
    scope,
    async () => {
      const { data, error } = await getDb(env).rpc(name, args);
      if (error) throw toDataError(error);
      return data as T;
    },
    { ...options, deadlineMs: READ_TIMEOUT_MS },
  );
  return { data: outcome.value, fetchedAt: outcome.fetchedAt, durationMs: outcome.durationMs };
}

/** A read that returns a list, normalising "no rows" to an empty array. */
export async function readListRpc<T>(
  env: CorporateEnv,
  scope: string,
  name: string,
  args: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<ReadResult<readonly T[]>> {
  const result = await readRpc<T[] | null>(env, scope, name, args, options);
  return { ...result, data: result.data ?? [] };
}

/**
 * A write.
 *
 * Deliberately *not* retried as aggressively as a read and deliberately given a
 * longer deadline: a write that succeeded on the server but timed out in the
 * browser is ambiguous, and the caller has to treat it as such rather than
 * blindly resend. That is what the outbox exists for on actions that matter.
 */
export async function writeRpc<T>(
  env: CorporateEnv,
  scope: string,
  name: string,
  args: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<T> {
  const outcome = await run(
    scope,
    async () => {
      const { data, error } = await getDb(env).rpc(name, args);
      if (error) throw toDataError(error);
      return data as T;
    },
    { attempts: 1, ...options, deadlineMs: WRITE_TIMEOUT_MS },
  );
  return outcome.value;
}

/**
 * A write whose success stops being certain if the network drops.
 *
 * Returns a discriminated result rather than throwing, because "we do not know
 * whether this happened" is a real answer that the console must be able to
 * render — an operator who is told "failed" for a write that actually succeeded
 * will do it twice.
 */
export type WriteOutcome<T> =
  | { readonly kind: 'confirmed'; readonly data: T }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'unknown'; readonly message: string };

export async function writeRpcOutcome<T>(
  env: CorporateEnv,
  scope: string,
  name: string,
  args: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<WriteOutcome<T>> {
  try {
    return { kind: 'confirmed', data: await writeRpc<T>(env, scope, name, args, options) };
  } catch (error) {
    if (isRefusal(error)) {
      return { kind: 'refused', message: error instanceof Error ? error.message : 'Refused.' };
    }
    // A timeout after the request left the browser is the ambiguous case. A
    // transport failure *before* it left is knowably a failure, but the browser
    // does not tell us which happened, so the honest answer is "unknown".
    return {
      kind: 'unknown',
      message:
        'The connection dropped before the console heard back, so this may or may not have been applied. Refresh to find out before trying again.',
    };
  }
}

/** The sentence for a write whose outcome is unknown, for a toast. */
export function unknownOutcomeMessage(action: string): string {
  return `${action} may not have been saved. Refresh the panel to see the current state before repeating it.`;
}
