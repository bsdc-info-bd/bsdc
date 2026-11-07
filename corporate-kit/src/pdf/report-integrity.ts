/**
 * An uncompressed PDF contains this marker exactly once. Its 64 hex digits
 * are normalized to zeroes before hashing, avoiding a self-referential hash.
 * The marker and every other byte are otherwise included in the digest.
 */
export const REPORT_HASH_MARKER = 'BSDC-PDF-SHA256:';
export const REPORT_HASH_PLACEHOLDER = `${REPORT_HASH_MARKER}${'0'.repeat(64)}`;
const MARKER = new TextEncoder().encode(REPORT_HASH_MARKER);
const DIGEST_LENGTH = 64;

function digestOffset(bytes: Uint8Array): number {
  let found = -1;
  for (let i = 0; i <= bytes.length - MARKER.length; i += 1) {
    if (MARKER.every((byte, offset) => bytes[i + offset] === byte)) {
      if (found !== -1) throw new Error('This PDF has more than one fingerprint marker.');
      found = i + MARKER.length;
    }
  }
  if (found === -1 || found + DIGEST_LENGTH > bytes.length) {
    throw new Error('This PDF does not contain a complete BSDC report fingerprint.');
  }
  return found;
}

function hexAt(bytes: Uint8Array, offset: number): string {
  const value = new TextDecoder().decode(bytes.subarray(offset, offset + DIGEST_LENGTH));
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('The report fingerprint is malformed.');
  return value;
}

async function normalizedHash(bytes: Uint8Array, offset: number): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('PDF verification requires a secure HTTPS connection and Web Crypto.');
  }
  const normalized = Uint8Array.from(bytes);
  normalized.fill(48, offset, offset + DIGEST_LENGTH); // ASCII zeroes
  const hash = await globalThis.crypto.subtle.digest('SHA-256', normalized.buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Fill the placeholder after the PDF is built; length and xref offsets do not change. */
export async function sealReportPdf(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const offset = digestOffset(bytes);
  if (hexAt(bytes, offset) !== '0'.repeat(DIGEST_LENGTH)) {
    throw new Error('The report fingerprint placeholder has already been filled.');
  }
  const sha256 = await normalizedHash(bytes, offset);
  const sealed = Uint8Array.from(bytes);
  sealed.set(new TextEncoder().encode(sha256), offset);
  return { bytes: sealed, sha256 };
}

/** Verify the embedded fingerprint and all normalized bytes against the registry. */
export async function verifyReportPdf(
  bytes: Uint8Array,
  registeredSha256: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(registeredSha256)) {
    throw new Error('The registry returned a malformed fingerprint.');
  }
  const offset = digestOffset(bytes);
  if (hexAt(bytes, offset) !== registeredSha256) return false;
  return (await normalizedHash(bytes, offset)) === registeredSha256;
}
