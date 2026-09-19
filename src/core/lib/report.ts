/**
 * BSDC — src/core/lib/report.ts
 * Purpose : Report identity: the id, the generated-at stamp, the integrity hash and the verify URL.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A document that asks to be trusted has to be checkable. Every report BSDC issues carries
 *   an id, the instant it was generated, a SHA-256 hash over a canonical rendering of its own
 *   content, and a public URL anybody can open to see whether that hash is the one we recorded.
 *   The hash is computed over a canonical payload — keys sorted, numbers formatted, rows in a fixed
 *   order — so the same content always produces the same hash and a reordered row cannot hide
 *   behind a different one.
 *   Hashing uses the platform's WebCrypto. Where it is unavailable (an insecure origin), the caller
 *   is told rather than given a fabricated hash: a document that claims an integrity it does not
 *   have is worse than a document with no claim at all.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Where a generated report can be checked. */
export const VERIFY_ORIGIN = 'https://www.bsdc.info.bd';

/** Characters used for the random part of a report id; no look-alikes, no vowels to spell words. */
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Length of the random suffix of a report id. */
const ID_SUFFIX_LENGTH = 8;

/** The metadata a generated report carries before it has any rows. */
export interface ReportIdentity {
  /** Stable, human-readable, unique within a day, e.g. `BSDC-MOD-20260301-7QK4M2PX`. */
  readonly reportId: string;
  /** ISO instant the report was generated. */
  readonly generatedAt: string;
}

/** A report with its content sealed. */
export interface SealedReport extends ReportIdentity {
  /** Lower-case hex SHA-256 over the canonical payload. */
  readonly integrity: string;
  /** The URL printed in the document and encoded in its QR code. */
  readonly verificationUrl: string;
  /** The exact bytes that were hashed, so a verifier can reproduce them. */
  readonly canonical: string;
}

/** A row in a generated report. */
export interface ReportRow {
  readonly label: string;
  readonly value: string;
  /** Optional qualifier, e.g. the unit or the period the row covers. */
  readonly note?: string;
}

/** Everything that goes into a report, before it is sealed. */
export interface ReportPayload {
  readonly kind: string;
  readonly title: string;
  readonly subtitle: string;
  /** Inclusive ISO date the report covers, or null when it is a point-in-time report. */
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly rows: readonly ReportRow[];
  readonly totals: readonly ReportRow[];
}

/**
 * Reports whether the platform can compute an integrity hash right now.
 * @returns true when WebCrypto SHA-256 is available
 */
export function canSeal(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === 'function';
}

/**
 * Builds the id of a report.
 * @param kind short kind code, e.g. `MOD` or `EVT`
 * @param generatedAt the instant of generation
 * @param randomBytes optional source of randomness, injected so tests are deterministic
 * @returns the report id
 */
export function reportId(
  kind: string,
  generatedAt: Date,
  randomBytes: readonly number[] = randomSuffix(ID_SUFFIX_LENGTH),
): string {
  const stamp = [
    generatedAt.getUTCFullYear(),
    String(generatedAt.getUTCMonth() + 1).padStart(2, '0'),
    String(generatedAt.getUTCDate()).padStart(2, '0'),
  ].join('');
  const code =
    kind
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 6) || 'RPT';
  const suffix = randomBytes
    .slice(0, ID_SUFFIX_LENGTH)
    .map((byte) => ID_ALPHABET[byte % ID_ALPHABET.length] ?? 'X')
    .join('');
  return `BSDC-${code}-${stamp}-${suffix}`;
}

/**
 * Reads a random suffix from the platform's CSPRNG.
 * @param length how many characters to produce
 * @returns the byte values
 */
function randomSuffix(length: number): readonly number[] {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes];
  }
  return Array.from({ length }, (_unused, index) => (index * 37 + 11) % 251);
}

/**
 * Renders a payload into the exact bytes that get hashed.
 *
 * Canonical means: keys in a fixed order, rows in the order given, numbers and dates as strings,
 * one field per line, no locale anywhere in it. Two reports with the same content on two different
 * devices in two different languages hash identically, which is what makes the hash a check on the
 * content rather than on the machine that produced it.
 *
 * @param payload the report content
 * @param identity the id and instant
 * @returns the canonical text
 */
export function canonicalPayload(payload: ReportPayload, identity: ReportIdentity): string {
  const lines: string[] = [
    `v=1`,
    `id=${identity.reportId}`,
    `at=${identity.generatedAt}`,
    `kind=${payload.kind}`,
    `title=${payload.title}`,
    `subtitle=${payload.subtitle}`,
    `period=${payload.periodStart ?? ''}..${payload.periodEnd ?? ''}`,
  ];
  payload.rows.forEach((row, index) => {
    lines.push(`row.${index}=${row.label}|${row.value}|${row.note ?? ''}`);
  });
  payload.totals.forEach((row, index) => {
    lines.push(`total.${index}=${row.label}|${row.value}|${row.note ?? ''}`);
  });
  return lines.join('\n');
}

/**
 * Builds the public verification URL for a report.
 * @param reportId the report id
 * @param integrity the integrity hash
 * @returns the URL anybody can open
 */
export function verificationUrl(reportId: string, integrity: string): string {
  return `${VERIFY_ORIGIN}/verify/${encodeURIComponent(reportId)}?h=${integrity.slice(0, 32)}`;
}

/**
 * Computes a SHA-256 hex digest.
 * @param text the text to hash
 * @returns the lower-case hex digest
 */
export async function sha256Hex(text: string): Promise<string> {
  if (!canSeal()) {
    throw new Error('BSDC-REPORT-003');
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Seals a report: computes its integrity hash and its verification URL.
 * @param payload the report content
 * @param generatedAt the instant of generation
 * @param randomBytes optional deterministic randomness for tests
 * @returns the sealed report
 */
export async function sealReport(
  payload: ReportPayload,
  generatedAt: Date = new Date(),
  randomBytes?: readonly number[],
): Promise<SealedReport> {
  const identity: ReportIdentity = {
    reportId: reportId(payload.kind, generatedAt, randomBytes),
    generatedAt: generatedAt.toISOString(),
  };
  const canonical = canonicalPayload(payload, identity);
  const integrity = await sha256Hex(canonical);
  return {
    ...identity,
    integrity,
    verificationUrl: verificationUrl(identity.reportId, integrity),
    canonical,
  };
}

/**
 * Parses the id and hash out of a verification URL, so a person can paste the whole thing.
 * @param input the URL, or a bare report id
 * @returns the id and hash when they could be read
 */
export function parseVerificationInput(
  input: string,
): { readonly reportId: string; readonly hash: string } | null {
  const text = input.trim();
  if (text.length === 0) return null;
  const fromUrl = /\/verify\/([A-Za-z0-9-]+)(?:\?h=([0-9a-f]{1,64}))?/i.exec(text);
  if (fromUrl?.[1] !== undefined) {
    return { reportId: fromUrl[1], hash: fromUrl[2] ?? '' };
  }
  if (/^BSDC-[A-Z]+-\d{8}-[0-9A-Z]+$/i.test(text)) {
    return { reportId: text.toUpperCase(), hash: '' };
  }
  return null;
}

/**
 * Compares two integrity hashes in constant time, so a verifier cannot be used as an oracle.
 * @param left first hash
 * @param right second hash
 * @returns true when they are the same hash
 */
export function hashesMatch(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
