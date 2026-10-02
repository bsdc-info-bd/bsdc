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
import { advice, codeFromSearch, pushRecent, readableDate, resultLines, shareUrl } from './model';

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
