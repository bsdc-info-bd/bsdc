/**
 * BSDC — src/shared/lib/retry.ts
 * Purpose : Retry with exponential backoff, jitter and cancellation (PART 24.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Used by the media pipeline, the ranking pipeline and every network call that may fail
 *           transiently. Retries are always bounded so a broken endpoint cannot hammer the client.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Options controlling retry behaviour. */
export interface RetryOptions {
  readonly attempts?: number | undefined;
  readonly baseDelayMs?: number | undefined;
  readonly maxDelayMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Return true to stop retrying for this error. */
  readonly shouldRetry?: (error: unknown) => boolean | undefined;
}

/**
 * Runs an async operation with bounded exponential backoff and jitter.
 * @param operation function to attempt
 * @param options retry configuration
 * @returns the successful result
 * @throws the last error when every attempt fails
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const shouldRetry = options.shouldRetry ?? ((): boolean => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted === true) throw new DOMException('Aborted', 'AbortError');
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) break;
      const exponential = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * baseDelayMs;
      const delay = Math.min(maxDelayMs, exponential + jitter);
      await sleep(delay, options.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Operation failed');
}

/**
 * Cancellable sleep.
 * @param ms milliseconds
 * @param signal abort signal
 * @returns a promise that resolves after the delay, or rejects on abort
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wraps a promise with a timeout so a hung request never leaves a spinner forever (PART 24.4).
 * @param promise promise to race
 * @param ms timeout in milliseconds
 * @returns the promise result
 * @throws a timeout error when the deadline passes
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Operation failed'));
      },
    );
  });
}
