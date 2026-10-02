import { cardCheckDigit } from './staff';

/**
 * Codes for the whole ecosystem.
 *
 * Every verifiable document is `BSDC-<KIND>-<8 characters>-<digit>`, with the
 * same check digit arithmetic the database uses. One shape means the public
 * desk has one validator, and a person reading a code aloud never has to
 * know what kind of document it belongs to.
 */
export const DOC_KINDS = ['CT', 'NT', 'ID'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_PATTERN = /^BSDC-[A-Z]{2}-[0-9A-Z]{8}-[0-9]$/;

export type ParsedCode =
  | { readonly ok: true; readonly code: string; readonly kind: DocKind; readonly body: string }
  | { readonly ok: false; readonly code: string; readonly reason: string };

/**
 * Tidies a code the way somebody types it off a printed page: spacing,
 * lower case, and the dashes a word processor replaced with longer ones.
 * The two characters that are never issued, O and I, can only be a
 * misreading of four and eight, so they are repaired rather than rejected.
 */
export function normaliseDocCode(raw: string): string {
  const compact = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-');
  if (!/^BSDC-[A-Z]{2}-.{8}-.$/.test(compact)) return compact;
  const body = compact.slice(8, 16).replace(/O/g, '4').replace(/I/g, '8');
  return `BSDC-${compact.slice(5, 7)}-${body}-${compact.slice(17)}`;
}

/** Parses and checks a code without asking the database anything. */
export function parseDocCode(raw: string): ParsedCode {
  const code = normaliseDocCode(raw);
  if (code === '') return { ok: false, code, reason: 'Enter the code printed on the document.' };
  if (!DOC_PATTERN.test(code)) {
    return { ok: false, code, reason: 'That is not the shape of a BSDC code.' };
  }
  const kind = code.slice(5, 7);
  if (!(DOC_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, code, reason: 'BSDC does not issue documents of that kind.' };
  }
  const body = code.slice(8, 16);
  if (cardCheckDigit(body) !== code.slice(17)) {
    return { ok: false, code, reason: 'The code failed its own check digit, so it was mistyped.' };
  }
  return { ok: true, code, kind: kind as DocKind, body };
}

export function isValidDocCode(raw: string): boolean {
  return parseDocCode(raw).ok;
}

/** Spaces a code out for printing without changing what it says. */
export function formatDocCode(raw: string): string {
  const code = normaliseDocCode(raw);
  if (!DOC_PATTERN.test(code)) return code;
  return `${code.slice(0, 7)} ${code.slice(8, 16)} ${code.slice(17)}`;
}

export function docKindLabel(kind: string): string {
  switch (kind) {
    case 'CT':
      return 'Certificate';
    case 'NT':
      return 'Notice';
    case 'ID':
      return 'Staff identity card';
    default:
      return 'Unknown document';
  }
}

/** The address printed under a QR code, and the one the QR code encodes. */
export function verificationUrl(siteUrl: string, code: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}/?code=${encodeURIComponent(normaliseDocCode(code))}`;
}

export type VerificationState =
  'valid' | 'revoked' | 'expired' | 'withdrawn' | 'unknown' | 'malformed';

export type VerificationResult = {
  readonly code: string;
  readonly kind: string;
  readonly valid: boolean;
  readonly state: VerificationState;
  readonly reason: string;
  readonly subject: string;
  readonly detail: string;
  readonly issuer: string;
  readonly issued_on: string | null;
  readonly expires_on: string | null;
  readonly verifications: number;
};

/**
 * The headline the desk shows. Each state gets its own sentence: "not
 * valid" covers four very different situations, and a person standing in
 * front of somebody holding a document needs to know which one it is.
 */
export function stateHeadline(result: Pick<VerificationResult, 'state' | 'kind'>): string {
  const what = docKindLabel(result.kind).toLowerCase();
  switch (result.state) {
    case 'valid':
      return `This ${what} is genuine`;
    case 'revoked':
      return `This ${what} was withdrawn`;
    case 'expired':
      return `This ${what} has expired`;
    case 'withdrawn':
      return `This ${what} is not currently published`;
    case 'unknown':
      return 'No document carries this code';
    default:
      return 'That code cannot be read';
  }
}

export function stateTone(state: VerificationState): 'ok' | 'warn' | 'bad' {
  if (state === 'valid') return 'ok';
  if (state === 'expired' || state === 'withdrawn') return 'warn';
  return 'bad';
}

/** A local, immediate answer for a code that cannot possibly be in the registry. */
export function localRejection(raw: string): VerificationResult | null {
  const parsed = parseDocCode(raw);
  if (parsed.ok) return null;
  return {
    code: parsed.code,
    kind: 'unknown',
    valid: false,
    state: 'malformed',
    reason: parsed.reason,
    subject: '',
    detail: '',
    issuer: '',
    issued_on: null,
    expires_on: null,
    verifications: 0,
  };
}
