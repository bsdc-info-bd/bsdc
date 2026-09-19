/**
 * BSDC — functions/src/passkey.ts
 * Purpose : Passkey derivation and constant-time verification (PART 05.06, LAW-06).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A BSDC passkey is never stored and never leaves this process. It is derived with
 *           PBKDF2-SHA256 using a per-record salt plus a deployment pepper, and compared in
 *           constant time. Verification happens only here: the client sends the passkey over TLS
 *           and immediately discards it, and it never appears in a URL, a query string, a log
 *           line or a screenshot.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { PASSKEY_ITERATIONS, PASSKEY_KEY_BYTES } from './env';

/** A stored passkey record. Only the salt and the derived hash are persisted. */
export interface PasskeyRecord {
  readonly salt: string;
  readonly hash: string;
  readonly iterations: number;
  readonly updatedAt: string;
}

/**
 * Creates a fresh per-record salt.
 * @returns a 16-byte hex salt
 */
export function createSalt(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Derives a passkey with PBKDF2-SHA256.
 * @param passkey the plaintext passkey supplied by an operator
 * @param salt per-record salt
 * @param pepper deployment-wide pepper (secret parameter)
 * @param iterations PBKDF2 iteration count
 * @returns the derived key as hex
 */
export function derivePasskey(
  passkey: string,
  salt: string,
  pepper: string,
  iterations: number = PASSKEY_ITERATIONS,
): string {
  return pbkdf2Sync(
    passkey,
    `${salt}::${pepper}`,
    iterations,
    PASSKEY_KEY_BYTES,
    'sha256',
  ).toString('hex');
}

/**
 * Builds a storable record for a new or rotated passkey.
 * @param passkey the plaintext passkey
 * @param pepper deployment-wide pepper
 * @returns the record to persist
 */
export function createPasskeyRecord(passkey: string, pepper: string): PasskeyRecord {
  const salt = createSalt();
  return {
    salt,
    hash: derivePasskey(passkey, salt, pepper),
    iterations: PASSKEY_ITERATIONS,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Verifies a supplied passkey against a stored record in constant time.
 * @param passkey the plaintext passkey
 * @param record the stored salt and hash
 * @param pepper deployment-wide pepper
 * @returns true when the passkey matches
 */
export function verifyPasskey(passkey: string, record: PasskeyRecord, pepper: string): boolean {
  const expected = Buffer.from(record.hash, 'utf8');
  const actual = Buffer.from(
    derivePasskey(passkey, record.salt, pepper, record.iterations),
    'utf8',
  );
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
