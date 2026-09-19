/**
 * BSDC — src/core/errors/ignore.ts
 * Purpose : The one place a read failure is allowed to end.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every screen in BSDC reads through a local mirror first, so a read that fails is not a
 *   dead screen — it is a screen showing the copy this device already holds, and the repository
 *   that issued the read has already said so. What must never happen is the rejection wandering off
 *   as an unhandled promise, which is how a harmless offline read turns into a console error and,
 *   eventually, into somebody ignoring the console altogether.
 *   This handler is deliberately silent in production and honest in development: a developer needs
 *   to see the reason, a person using the platform does not.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from './AppError';

/**
 * Ends a failed read without letting the rejection escape.
 * @param reason whatever the read rejected with
 */
export function ignoreReadFailure(reason: unknown): void {
  if (import.meta.env.DEV) {
    const code = reason instanceof AppError ? reason.code : 'unknown';
    console.warn(`[bsdc] read fell back to this device (${code})`);
  }
}
