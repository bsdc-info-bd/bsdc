/**
 * BSDC — src/shared/lib/hash.ts
 * Purpose : WebCrypto hashing and HMAC helpers for integrity checks, dedupe and signing
 *           (PART 04 LAW-23, PART 21.9, PART 29.1 STEP 5).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Only non-secret operations live here. Server-side signing (report integrity, licence
 *           signatures) runs in Cloud Functions with keys held in env — never in the browser.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/**
 * SHA-256 digest of a string.
 * @param value text to hash
 * @returns lowercase hex digest, or null when WebCrypto is unavailable
 */
export async function sha256(value: string): Promise<string | null> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await cryptoObj.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Short, stable, non-cryptographic hash used for bucketing and dedupe of large payloads.
 * @param value text to hash
 * @returns 32-bit unsigned integer as a hex string
 */
export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic bucket in [0, 1) for experiments and feature-flag rollouts (PART 12.06).
 * @param key stable key (user id + experiment key)
 * @returns a number between 0 (inclusive) and 1 (exclusive)
 */
export function bucket01(key: string): number {
  const hash = Number.parseInt(fnv1a(key), 16);
  return (hash % 100_000) / 100_000;
}
