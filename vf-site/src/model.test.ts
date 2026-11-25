import { describe, expect, it } from 'vitest';
import {
  cardCheckDigit,
  docKindLabel,
  localRejection,
  parseDocCode,
  stateHeadline,
  stateTone,
  type VerificationResult,
} from '@kit';
import {
  advice,
  codeFromSearch,
  pushRecent,
  readableDate,
  reportIdFromSearch,
  resultLines,
  shareUrl,
  ANSWER_FIELDS,
  allowedOnly,
  parseBatch,
  countBatch,
  allowanceNote,
  refusalSentence,
  batchCsv,
  type Answer,
} from './model';

const code = (kind: string, body: string): string => `BSDC-${kind}-${body}-${cardCheckDigit(body)}`;

const result = (over: Partial<VerificationResult> = {}): VerificationResult => ({
  code: code('CT', '4A7C21B9'),
  kind: 'CT',
  valid: true,
  state: 'valid',
  reason: 'This document is in the registry and in force today.',
  subject: 'Ayesha Rahman',
  detail: 'Frontend track 2026',
  issuer: 'Bangladesh Software Development Community',
  issued_on: '2026-03-10',
  expires_on: null,
  verifications: 4,
  ...over,
});

describe('reading a code out of the address bar', () => {
  it('accepts the long and the short parameter a QR might carry', () => {
    const valid = code('CT', '4A7C21B9');
    expect(codeFromSearch(`?code=${valid}`)).toBe(valid);
    expect(codeFromSearch(`c=${valid}`)).toBe(valid);
  });

  it('tidies a code that arrived lower case or percent-encoded', () => {
    const valid = code('NT', '91B2C3D4');
    expect(codeFromSearch(`?code=${encodeURIComponent(valid.toLowerCase())}`)).toBe(valid);
  });

  it('returns nothing when there is nothing to read', () => {
    expect(codeFromSearch('')).toBe('');
    expect(codeFromSearch('?other=1')).toBe('');
  });

  it('builds a link somebody else can open and see the same answer', () => {
    const valid = code('CT', '4A7C21B9');
    expect(shareUrl('https://vf.main.bsdc.info.bd/', valid)).toBe(
      `https://vf.main.bsdc.info.bd/?code=${valid}`,
    );
  });
});

describe('answering without the database', () => {
  it('refuses a mistyped code immediately', () => {
    const good = code('CT', '4A7C21B9');
    const wrong = `${good.slice(0, 17)}${(Number(good.slice(17)) + 1) % 10}`;
    const rejection = localRejection(wrong);
    expect(rejection?.state).toBe('malformed');
    expect(rejection?.valid).toBe(false);
    expect(rejection?.reason).toContain('check digit');
  });

  it('passes a well-formed code through to the registry', () => {
    expect(localRejection(code('ID', '12345678'))).toBeNull();
    expect(parseDocCode(code('ID', '12345678')).ok).toBe(true);
  });
});

describe('the result card', () => {
  it('names the kind of document in words', () => {
    expect(docKindLabel('CT')).toBe('Certificate');
    expect(docKindLabel('NT')).toBe('Notice');
    expect(docKindLabel('ID')).toBe('Staff identity card');
    expect(docKindLabel('ZZ')).toBe('Unknown document');
  });

  it('gives each state its own headline, because "not valid" is four things', () => {
    expect(stateHeadline(result())).toBe('This certificate is genuine');
    expect(stateHeadline(result({ state: 'revoked' }))).toBe('This certificate was withdrawn');
    expect(stateHeadline(result({ state: 'expired' }))).toBe('This certificate has expired');
    expect(stateHeadline(result({ kind: 'NT', state: 'withdrawn' }))).toBe(
      'This notice is not currently published',
    );
    expect(stateHeadline(result({ state: 'unknown' }))).toBe('No document carries this code');
    expect(stateHeadline(result({ state: 'malformed' }))).toBe('That code cannot be read');
  });

  it('colours a lapsed document differently from a forged one', () => {
    expect(stateTone('valid')).toBe('ok');
    expect(stateTone('expired')).toBe('warn');
    expect(stateTone('withdrawn')).toBe('warn');
    expect(stateTone('revoked')).toBe('bad');
    expect(stateTone('unknown')).toBe('bad');
  });

  it('labels the same field differently for a notice and for a card', () => {
    expect(resultLines(result()).map((line) => line.label)).toEqual([
      'Document',
      'Named person',
      'For',
      'Issued',
      'Issued by',
    ]);
    expect(resultLines(result({ kind: 'NT' })).map((line) => line.label)).toContain('Title');
    expect(resultLines(result({ kind: 'NT' })).map((line) => line.label)).toContain('Published');
    expect(resultLines(result({ kind: 'ID' })).map((line) => line.label)).toContain('Role');
  });

  it('drops empty fields rather than printing blanks', () => {
    const lines = resultLines(result({ subject: '', detail: '', issuer: '', issued_on: null }));
    expect(lines).toEqual([{ label: 'Document', value: 'Certificate' }]);
  });

  it('shows an expiry when there is one', () => {
    const lines = resultLines(result({ expires_on: '2027-01-01' }));
    expect(lines.find((line) => line.label === 'In force until')?.value).toBe('01 January 2027');
  });

  it('reads a date in full, and says nothing when there is no date', () => {
    expect(readableDate('2026-03-26')).toBe('26 March 2026');
    expect(readableDate(null)).toBe('');
    expect(readableDate('rubbish')).toBe('');
  });

  it('tells the reader what to do next, differently for each answer', () => {
    expect(advice(result())).toContain('has been altered');
    expect(advice(result({ state: 'revoked' }))).toContain('no longer carrying any authority');
    expect(advice(result({ state: 'expired' }))).toContain('Ask for a current one');
    expect(advice(result({ state: 'unknown' }))).toContain('mistyped character');
    expect(advice(result({ state: 'malformed' }))).toContain('BSDC-CT-4A7C21B9-6');
  });
});

describe('the recent list on this device', () => {
  const a = code('CT', '4A7C21B9');
  const b = code('NT', '91B2C3D4');

  it('puts the newest first and never repeats a code', () => {
    expect(pushRecent([a], b)).toEqual([b, a]);
    expect(pushRecent([a, b], a)).toEqual([a, b]);
  });

  it('keeps the list short', () => {
    const many = ['1', '2', '3', '4', '5', '6'];
    expect(pushRecent(many, a, 3)).toHaveLength(3);
  });

  it('ignores an empty code', () => {
    expect(pushRecent([a], '   ')).toEqual([a]);
  });
});

describe('report receipt links', () => {
  it('accepts a UUID and rejects malformed input before an RPC', () => {
    const id = '12345678-1234-4234-8234-123456789abc';
    expect(reportIdFromSearch(`?report=${id}`)).toBe(id);
    expect(reportIdFromSearch('?report=not-a-uuid')).toBe('');
  });
});

describe('a desk that answers in one query (§13.3)', () => {
  const answer = (over: Partial<Answer> = {}): Answer => ({
    kind: 'certificate',
    found: true,
    code: 'BSDC-CT-4A7C21B9-6',
    recipient_name: 'Rumana Haque',
    subject: 'Signals',
    issued_on: '2026-10-24',
    expires_on: '2027-10-24',
    state: 'valid',
    reason: '',
    superseded_by: null,
    hash_matches: true,
    checked_at: '2026-11-23T12:00:00Z',
    ...over,
  });

  it('drops any field the published list does not carry', () => {
    const row = allowedOnly({ ...answer(), recipient_email: 'rumana@example.com', recipient_uid: 'u1' });
    expect(Object.keys(row).sort()).toEqual([...ANSWER_FIELDS].sort());
    expect(JSON.stringify(row)).not.toContain('rumana@example.com');
    expect(JSON.stringify(row)).not.toContain('"u1"');
  });

  it('keeps every field on the list, including the ones that are null', () => {
    const row = allowedOnly({ ...answer(), subject: null });
    expect(row.subject).toBeNull();
    expect(row.code).toBe('BSDC-CT-4A7C21B9-6');
  });

  it('reads a pasted column in whatever shape a spreadsheet produced it', () => {
    const parsed = parseBatch('BSDC-CT-4A7C21B9-6\nBSDC-CT-9Z9Z9Z9Z-4, BSDC-CT-11112222-3;bogus\n');
    expect(parsed).toEqual(['BSDC-CT-4A7C21B9-6', 'BSDC-CT-9Z9Z9Z9Z-4', 'BSDC-CT-11112222-3']);
  });

  it('does not count the same code twice, because checking it twice is one check', () => {
    expect(parseBatch('BSDC-CT-4A7C21B9-6\nBSDC-CT-4A7C21B9-6')).toHaveLength(1);
  });

  it('stops at the batch ceiling instead of building an unbounded request', () => {
    const many = Array.from({ length: 300 }, (_, i) => `BSDC-CT-${String(i).padStart(8, '0')}-1`).join('\n');
    expect(parseBatch(many)).toHaveLength(200);
    expect(parseBatch(many, 10)).toHaveLength(10);
  });

  it('counts what a batch found, in the terms the person pasting it cares about', () => {
    const count = countBatch([
      answer(),
      answer({ code: 'a', state: 'revoked', found: true }),
      answer({ code: 'b', state: 'not_found', found: false }),
    ]);
    expect(count.valid).toBe(1);
    expect(count.revoked).toBe(1);
    expect(count.notFound).toBe(1);
    expect(count.summary).toContain('1 of 3 are in force');
  });

  it('says all of them are in force when that is the answer', () => {
    expect(countBatch([answer(), answer({ code: 'c' })]).summary).toBe('All 2 are in force.');
  });

  it('says nothing was checked rather than "0 of 0 are in force"', () => {
    expect(countBatch([]).summary).toBe('No codes were checked.');
  });

  it('warns before the allowance runs out, not after', () => {
    expect(allowanceNote(30)).toBe('');
    expect(allowanceNote(3)).toContain('3 checks left');
    expect(allowanceNote(1)).toContain('1 check left');
    expect(allowanceNote(0)).toContain('used its checks');
  });

  it('does not let a rate limit read as a verdict about a document', () => {
    const sentence = refusalSentence('53400');
    expect(sentence).toContain('says nothing about the document');
    expect(refusalSentence(null)).toBe('');
  });

  it('writes a batch file that says which ones are no longer in force', () => {
    const csv = batchCsv([answer(), answer({ code: 'b', state: 'revoked', found: true, reason: 'Did not complete' })]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('in_force');
    expect(lines[1]).toContain('yes');
    expect(lines[2]).toContain('no');
    expect(lines[2]).toContain('Did not complete');
  });
});
