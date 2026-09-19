/**
 * BSDC — functions/src/env.ts
 * Purpose : Typed, fail-fast access to server-only configuration.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : LAW-04 — a secret is read here and nowhere else. Nothing in this file may be imported
 *           by the browser bundle, and no value it returns may be logged or returned to a client.
 *           Missing configuration fails the function at cold start rather than silently weakening
 *           a security check.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { defineSecret, defineString } from 'firebase-functions/params';

/** Pepper mixed into every passkey derivation. Rotating it invalidates stored hashes. */
export const PASSKEY_PEPPER = defineSecret('ADMIN_PASSKEY_PEPPER');

/** PBKDF2 hash of the root administrator passkey for the bootstrap account. */
export const ROOT_PASSKEY_HASH = defineSecret('ADMIN_ROOT_PASSKEY_HASH');

/** Email that owns the root role. Mirrors src/core/config/app.ts on the client. */
export const ROOT_ADMIN_EMAIL = defineString('ADMIN_ROOT_EMAIL', {
  default: 'rrc@bsdc.info.bd',
});

/** Salt used for the bootstrap root hash. */
export const ROOT_PASSKEY_SALT = defineString('ADMIN_ROOT_SALT', {
  default: 'bsdc-root-bootstrap-salt-v1',
});

/** Number of PBKDF2-SHA256 iterations. OWPASS recommendation for SHA-256 is 600 000. */
export const PASSKEY_ITERATIONS = 600_000;

/** Derived key length in bytes. */
export const PASSKEY_KEY_BYTES = 32;
