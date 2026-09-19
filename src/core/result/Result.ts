/**
 * BSDC — src/core/result/Result.ts
 * Purpose : Explicit success/failure values for fallible operations (PART 24.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Exceptions are for exceptional situations; expected failures (validation, permission,
 *           quota) are modelled as values so callers cannot forget to handle them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A successful result. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed result. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union of success and failure. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Creates a successful result.
 * @param value payload
 * @returns an Ok result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Creates a failed result.
 * @param error failure payload
 * @returns an Err result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Wraps a throwing operation in a Result.
 * @param operation operation to run
 * @returns Ok with the value, or Err with the caught error
 */
export function attempt<T>(operation: () => T): Result<T> {
  try {
    return ok(operation());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Maps the success payload of a result.
 * @param result source result
 * @param mapper transformation
 * @returns a new result
 */
export function mapResult<T, U, E>(result: Result<T, E>, mapper: (value: T) => U): Result<U, E> {
  return result.ok ? ok(mapper(result.value)) : result;
}
