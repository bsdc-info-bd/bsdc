/**
 * BSDC — functions/src/rateLimit.ts
 * Purpose : Server-side attempt throttling for privileged entry points (PART 05.06).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Rate limiting is a server responsibility: a client-side counter can be reset by
 *           clearing storage. The window is 15 minutes and allows five attempts per actor per
 *           purpose; the sixth attempt is rejected and the actor is locked out until the window
 *           rolls over. Attempt records are written without any passkey material.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { createHash } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/** Attempts allowed inside one window. */
export const MAX_ATTEMPTS = 5;

/** Window length in milliseconds. */
export const WINDOW_MS = 15 * 60 * 1000;

/** Result of an attempt evaluation. */
export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly attemptsUsed: number;
  readonly retryAt: string | null;
}

/**
 * Records an attempt and reports whether the caller may proceed.
 * @param actor stable actor identifier (uid, or email when unauthenticated)
 * @param purpose logical bucket, e.g. `passkey:plugin`
 * @returns the verdict for this attempt
 */
export async function recordAttempt(actor: string, purpose: string): Promise<RateLimitVerdict> {
  const db = getFirestore();
  const ref = db.doc(`rateLimits/${hashActor(actor)}-${purpose}`);
  const now = Date.now();

  const verdict = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as
      { windowStart?: number; count?: number; purpose?: string } | undefined;
    const windowStart = typeof data?.windowStart === 'number' ? data.windowStart : 0;
    const fresh = now - windowStart >= WINDOW_MS;
    const start = fresh ? now : windowStart;
    const count = fresh ? 1 : (typeof data?.count === 'number' ? data.count : 0) + 1;

    transaction.set(ref, {
      actorRef: hashActor(actor),
      purpose,
      windowStart: start,
      count,
      lastAttemptAt: now,
      attempts: FieldValue.arrayUnion(now),
    });

    return {
      allowed: count <= MAX_ATTEMPTS,
      attemptsUsed: count,
      retryAt: new Date(start + WINDOW_MS).toISOString(),
    } satisfies RateLimitVerdict;
  });

  return verdict;
}

/**
 * Clears the throttle for an actor after a successful verification.
 * @param actor stable actor identifier
 * @param purpose logical bucket
 */
export async function clearAttempts(actor: string, purpose: string): Promise<void> {
  const db = getFirestore();
  await db.doc(`rateLimits/${hashActor(actor)}-${purpose}`).delete();
}

/**
 * Hashes an actor identifier so the throttle collection stores no raw email addresses.
 * @param actor raw identifier
 * @returns a short hexadecimal digest
 */
export function hashActor(actor: string): string {
  return createHash('sha256').update(actor.toLowerCase()).digest('hex').slice(0, 32);
}
