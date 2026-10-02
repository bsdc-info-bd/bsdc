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
