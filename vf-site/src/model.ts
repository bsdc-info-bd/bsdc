import { docKindLabel, normaliseDocCode, type VerificationResult } from '@kit';

/**
 * The portal is a public page with one job, so its state lives in the
 * address bar: a result can be sent to somebody else and they will see
 * exactly what the sender saw.
 */
export function codeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('code') ?? params.get('c') ?? '';
  return raw === '' ? '' : normaliseDocCode(raw);
}

export function shareUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/?code=${encodeURIComponent(normaliseDocCode(code))}`;
}

/** A date as a reader would say it, or nothing at all. */
export function readableDate(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export type ResultLine = { readonly label: string; readonly value: string };

/**
 * The lines the result card shows. Empty fields are dropped rather than
 * printed as dashes: a card with four facts on it is more convincing than
 * one with four facts and three blanks.
 */
export function resultLines(result: VerificationResult): readonly ResultLine[] {
  const lines: ResultLine[] = [{ label: 'Document', value: docKindLabel(result.kind) }];
  if (result.subject !== '') {
    lines.push({ label: result.kind === 'NT' ? 'Title' : 'Named person', value: result.subject });
  }
  if (result.detail !== '') {
    lines.push({ label: result.kind === 'ID' ? 'Role' : 'For', value: result.detail });
  }
  const issued = readableDate(result.issued_on);
  if (issued !== '') {
    lines.push({ label: result.kind === 'NT' ? 'Published' : 'Issued', value: issued });
  }
  const expires = readableDate(result.expires_on);
  if (expires !== '') lines.push({ label: 'In force until', value: expires });
  if (result.issuer !== '') lines.push({ label: 'Issued by', value: result.issuer });
  return lines;
}

/**
 * What a reader should do next, which depends on the answer. A portal that
 * only says "not valid" leaves somebody standing there with a document and
 * no idea what to do with it.
 */
export function advice(result: VerificationResult): string {
  switch (result.state) {
    case 'valid':
      return 'The details above come from the registry. If they do not match the document in front of you, the document has been altered.';
    case 'revoked':
      return 'The issuer withdrew this document. Treat it as no longer carrying any authority, whatever the paper says.';
    case 'expired':
      return 'This document was genuine and is recorded, but its period has ended. Ask for a current one.';
    case 'withdrawn':
      return 'This notice is not published at the moment. It may be scheduled, archived or superseded.';
    case 'unknown':
      return 'Nothing in the registry carries this code. Check for a mistyped character, then treat the document as unverified.';
    default:
      return 'Check the code against the document. Every BSDC code looks like BSDC-CT-4A7C21B9-6.';
  }
}

/** A short history of what this browser has checked, newest first, without duplicates. */
export function pushRecent(recent: readonly string[], code: string, limit = 6): readonly string[] {
  const normalised = normaliseDocCode(code);
  if (normalised === '') return recent;
  return [normalised, ...recent.filter((item) => item !== normalised)].slice(0, limit);
}

/** Only UUIDs generated for report receipts are sent to the public RPC. */
export function reportIdFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const id = (params.get('report') ?? '').toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : '';
}

export interface VerifiedReport {
  readonly receipt_id: string;
  readonly app: string;
  readonly days: number;
  readonly title: string;
  readonly sections: readonly string[];
  readonly generated_at: string;
  readonly sha256: string;
}

// ---------------------------------------------------------------------------
// §13.3 Verification that answers in one query
// ---------------------------------------------------------------------------

/**
 * The allow-list of fields a verification answer may carry.
 *
 * The database owns the authoritative list (`verification_fields`), and the
 * harness compares the live response against it. This copy exists so the desk
 * can refuse to render a field it does not recognise: if the database ever
 * grows a column, the screen should show nothing rather than print a member's
 * email under a heading nobody reviewed.
 */
export const ANSWER_FIELDS = [
  'kind',
  'found',
  'code',
  'recipient_name',
  'subject',
  'issued_on',
  'expires_on',
  'state',
  'reason',
  'superseded_by',
  'hash_matches',
  'checked_at',
] as const;

export type AnswerField = (typeof ANSWER_FIELDS)[number];

/** One answer, as `verify_public` returns it. */
export type Answer = {
  readonly kind: string;
  readonly found: boolean;
  readonly code: string;
  readonly recipient_name: string | null;
  readonly subject: string | null;
  readonly issued_on: string | null;
  readonly expires_on: string | null;
  readonly state: string;
  readonly reason: string;
  readonly superseded_by: string | null;
  readonly hash_matches: boolean | null;
  readonly checked_at: string;
};

/**
 * Anything the database sends that is not on the allow-list is dropped before
 * it reaches a component. This is the client half of a rule the database also
 * enforces, and it is deliberately the *only* direction of disagreement: the
 * screen may show less than the database returns, never more.
 */
export function allowedOnly(row: Record<string, unknown>): Answer {
  const out: Record<string, unknown> = {};
  for (const field of ANSWER_FIELDS) out[field] = row[field];
  return out as Answer;
}

/**
 * Codes pasted from a spreadsheet, read the way a person pasted them.
 *
 * A batch is a CSV column, so the separators are the ones a spreadsheet
 * produces: newlines, commas, semicolons, tabs. Duplicates are dropped because
 * checking the same code twice is not two checks, and blanks are dropped
 * because a trailing comma is not a code.
 */
export function parseBatch(raw: string, limit = 200): readonly string[] {
  const seen = new Set<string>();
  for (const piece of raw.split(/[\s,;]+/)) {
    const normalised = normaliseDocCode(piece);
    if (normalised === '') continue;
    // Only a code of the right shape is sent. A pasted paragraph would
    // otherwise spend the allowance on words that cannot be in the registry,
    // and a rate limit spent on noise is a limit that protects nothing.
    if (!/^BSDC-[A-Z]{2}-[0-9A-Z]{8}-[0-9]$/.test(normalised)) continue;
    seen.add(normalised);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export type BatchCount = {
  readonly valid: number;
  readonly revoked: number;
  readonly notFound: number;
  readonly other: number;
  readonly summary: string;
};

/**
 * A batch result counted the way the person who pasted it thinks about it.
 *
 * The number that matters is not "how many rows came back" — it is how many of
 * these certificates are no longer in force, because that is the finding a
 * batch check exists to produce.
 */
export function countBatch(answers: readonly Answer[]): BatchCount {
  let valid = 0;
  let revoked = 0;
  let notFound = 0;
  let other = 0;
  for (const answer of answers) {
    if (!answer.found) notFound += 1;
    else if (answer.state === 'valid') valid += 1;
    else if (answer.state === 'revoked' || answer.state === 'withdrawn') revoked += 1;
    else other += 1;
  }
  const total = answers.length;
  const trouble = revoked + notFound + other;
  if (total === 0) return { valid, revoked, notFound, other, summary: 'No codes were checked.' };
  if (trouble === 0) {
    return {
      valid,
      revoked,
      notFound,
      other,
      summary: `All ${String(valid)} are in force.`,
    };
  }
  return {
    valid,
    revoked,
    notFound,
    other,
    summary: `${String(valid)} of ${String(total)} are in force. ${String(revoked)} withdrawn, ${String(notFound)} not in the registry.`,
  };
}

/** What is left of the allowance, said before it runs out rather than after. */
export function allowanceNote(remaining: number): string {
  if (remaining <= 0) {
    return 'This connection has used its checks for the hour. Try again later, or ask the trust desk.';
  }
  if (remaining <= 5) {
    return `${String(remaining)} check${remaining === 1 ? '' : 's'} left this hour.`;
  }
  return '';
}

/** A refused attempt is not a "no" about the document, and must not read like one. */
export function refusalSentence(code: string | null): string {
  if (code === '53400') {
    return 'Too many checks have come from this connection. This says nothing about the document — try again later.';
  }
  return '';
}

/** A batch download: what was checked and what it said, for the file. */
export function batchCsv(answers: readonly Answer[]): string {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = ['code,kind,state,in_force,recipient,subject,issued,expires,reason'];
  for (const answer of answers) {
    lines.push(
      [
        answer.code,
        answer.kind,
        answer.state,
        answer.state === 'valid' ? 'yes' : 'no',
        escape(answer.recipient_name ?? ''),
        escape(answer.subject ?? ''),
        answer.issued_on ?? '',
        answer.expires_on ?? '',
        escape(answer.reason),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
