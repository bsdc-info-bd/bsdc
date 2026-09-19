/**
 * BSDC — src/core/errors/AppError.ts
 * Purpose : The single error type carried across the platform (PART 24.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every thrown error inside BSDC is either an AppError or is wrapped into one at the
 *           boundary, so the UI always has a code, a bilingual message and a redacted context.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { findError, type ErrorDomain, type ErrorSeverity } from './taxonomy';

/** Serializable context attached to an error, always redacted before logging. */
export type ErrorContext = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * The platform error type.
 */
export class AppError extends Error {
  /** Stable BSDC error code. */
  public readonly code: string;
  /** Error domain. */
  public readonly domain: ErrorDomain;
  /** Severity. */
  public readonly severity: ErrorSeverity;
  /** Whether the operation can be retried automatically. */
  public readonly retryable: boolean;
  /** Redacted context for logs and the admin error dashboard. */
  public readonly context: ErrorContext;
  /** The underlying cause, when one exists. */
  public override readonly cause?: unknown;

  public constructor(code: string, context: ErrorContext = {}, cause?: unknown, message?: string) {
    const definition = findError(code);
    super(message ?? definition?.en ?? code);
    this.name = 'AppError';
    this.code = code;
    this.domain = definition?.domain ?? 'APP';
    this.severity = definition?.severity ?? 'error';
    this.retryable = definition?.retryable ?? false;
    this.context = context;
    if (cause !== undefined) this.cause = cause;
  }

  /**
   * Bangla message for the current code.
   * @returns the Bangla explanation
   */
  public messageBn(): string {
    return findError(this.code)?.bn ?? this.message;
  }
}

/**
 * Wraps any thrown value into an AppError.
 * @param error thrown value
 * @param fallbackCode code used when the value is not already an AppError
 * @param context additional context
 * @returns an AppError instance
 */
export function toAppError(
  error: unknown,
  fallbackCode = 'BSDC-APP-001',
  context: ErrorContext = {},
): AppError {
  if (error instanceof AppError) return error;
  return new AppError(fallbackCode, context, error);
}
