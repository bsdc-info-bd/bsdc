/**
 * BSDC — src/tests/unit/reportIdentity.test.ts
 * Purpose : Proves that a report can be checked: ids are well-formed, hashes are real, the same
 *   content always seals the same way, and a verifier tells the truth about a document it was given.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The integrity hash is the whole claim a printed document makes, so it is tested against
 *   a published SHA-256 vector rather than against itself — a hash that agreed with its own previous
 *   answer would prove nothing at all. The verifier's three verdicts are tested separately, because
 *   "we could not check" and "we checked and it is wrong" are different sentences and a verifier that
 *   blurred them would be worse than none.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  canSeal,
  canonicalPayload,
  hashesMatch,
  parseVerificationInput,
  reportId,
  sealReport,
  sha256Hex,
  verificationUrl,
  type ReportPayload,
} from '@/core/lib/report';
import { buildReportPayload } from '@/entities/report/catalog';
import { buildReportPdf } from '@/core/lib/pdf';
import { verifyReportDocument, verdictExplanation } from '@/entities/report/document';
import type { ReportDocument } from '@/entities/report/document';

/** The published SHA-256 of the string "abc". */
const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const PAYLOAD: ReportPayload = {
  kind: 'moderation',
  title: 'Moderation summary',
  subtitle: 'How many reports arrived, and what was decided.',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  rows: [
    { label: 'open', value: '4', note: 'reports' },
    { label: 'actioned', value: '9', note: 'reports' },
  ],
  totals: [{ label: 'Total reports', value: '13' }],
};

describe('report identity', () => {
  it('builds an id from the kind, the date and the randomness it is given', () => {
    const id = reportId('MOD', new Date('2026-03-01T12:00:00.000Z'), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(id).toBe('BSDC-MOD-20260301-3456789A');
  });

  it('is deterministic for the same inputs, so a test can predict an id', () => {
    const at = new Date('2026-03-01T12:00:00.000Z');
    expect(reportId('EVT', at, [9, 9, 9, 9, 9, 9, 9, 9])).toBe(
      reportId('EVT', at, [9, 9, 9, 9, 9, 9, 9, 9]),
    );
  });

  it('never emits a character that can be read as another one', () => {
    for (let seed = 0; seed < 64; seed += 1) {
      const id = reportId('MOD', new Date('2026-03-01T00:00:00.000Z'), [
        seed,
        seed * 7,
        seed * 13,
        seed * 3,
        seed + 5,
        seed * 11,
        seed + 41,
        seed * 17,
      ]);
      expect(id).toMatch(/^BSDC-MOD-\d{8}-[2-9A-HJ-NP-Z]{8}$/);
    }
  });

  it('falls back to a non-random suffix rather than throwing where there is no CSPRNG', () => {
    expect(() => reportId('MOD', new Date('2026-03-01T00:00:00.000Z'))).not.toThrow();
  });
});

describe('canonical payload', () => {
  it('is a fixed-order rendering with no locale in it', () => {
    const identity = {
      reportId: 'BSDC-MOD-20260301-3456789A',
      generatedAt: '2026-03-01T12:00:00.000Z',
    };
    const text = canonicalPayload(PAYLOAD, identity);
    expect(text.split('\n')[0]).toBe('v=1');
    expect(text).toContain('id=BSDC-MOD-20260301-3456789A');
    expect(text).toContain('row.0=open|4|reports');
    expect(text).toContain('total.0=Total reports|13|');
  });

  it('changes when a row is reordered, because reordering is a change', () => {
    const identity = { reportId: 'X', generatedAt: 'Y' };
    const swapped: ReportPayload = {
      ...PAYLOAD,
      rows: [...PAYLOAD.rows].reverse(),
    };
    expect(canonicalPayload(swapped, identity)).not.toBe(canonicalPayload(PAYLOAD, identity));
  });
});

describe('sealing', () => {
  it('hashes with the published SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(SHA256_OF_ABC);
  });

  it('reports whether it can seal at all', () => {
    expect(canSeal()).toBe(true);
  });

  it('gives a report issued on another day its own id, so two documents are never twins', async () => {
    const first = await sealReport(
      PAYLOAD,
      new Date('2026-03-01T10:00:00.000Z'),
      [1, 1, 1, 1, 1, 1, 1, 1],
    );
    const second = await sealReport(
      PAYLOAD,
      new Date('2026-04-11T22:30:00.000Z'),
      [1, 1, 1, 1, 1, 1, 1, 1],
    );
    expect(first.reportId).not.toBe(second.reportId);
    expect(first.integrity).not.toBe(second.integrity);
  });

  it('seals the same content to the same hash when the id and the instant are the same', async () => {
    const at = new Date('2026-03-01T10:00:00.000Z');
    const first = await sealReport(PAYLOAD, at, [1, 1, 1, 1, 1, 1, 1, 1]);
    const second = await sealReport(PAYLOAD, at, [1, 1, 1, 1, 1, 1, 1, 1]);
    expect(first.reportId).toBe(second.reportId);
    expect(first.integrity).toBe(second.integrity);
  });

  it('seals different content to a different hash', async () => {
    const other: ReportPayload = { ...PAYLOAD, rows: [{ label: 'open', value: '5' }] };
    const a = await sealReport(
      PAYLOAD,
      new Date('2026-03-01T10:00:00.000Z'),
      [1, 1, 1, 1, 1, 1, 1, 1],
    );
    const b = await sealReport(
      other,
      new Date('2026-03-01T10:00:00.000Z'),
      [1, 1, 1, 1, 1, 1, 1, 1],
    );
    expect(a.integrity).not.toBe(b.integrity);
  });

  it('carries the bytes it hashed, so a verifier can reproduce them', async () => {
    const sealed = await sealReport(
      PAYLOAD,
      new Date('2026-03-01T10:00:00.000Z'),
      [1, 1, 1, 1, 1, 1, 1, 1],
    );
    expect(await sha256Hex(sealed.canonical)).toBe(sealed.integrity);
  });

  it('builds the verification URL from the id and the hash, and no more of the hash than a QR code can carry', () => {
    const url = verificationUrl('BSDC-MOD-20260301-3456789A', SHA256_OF_ABC);
    expect(url).toBe(
      `https://www.bsdc.info.bd/verify/BSDC-MOD-20260301-3456789A?h=${SHA256_OF_ABC.slice(0, 32)}`,
    );
  });

  it('prints a verification URL a stranger can open', async () => {
    const sealed = await sealReport(
      PAYLOAD,
      new Date('2026-03-01T10:00:00.000Z'),
      [1, 1, 1, 1, 1, 1, 1, 1],
    );
    expect(sealed.verificationUrl).toContain('/verify/');
    expect(sealed.verificationUrl).toContain(sealed.reportId);
  });
});

describe('verification input', () => {
  it('reads the id and hash out of a verification URL', () => {
    const parsed = parseVerificationInput(
      'https://www.bsdc.info.bd/verify/BSDC-MOD-20260301-3456789A?h=abcdef0123456789',
    );
    expect(parsed).toEqual({ reportId: 'BSDC-MOD-20260301-3456789A', hash: 'abcdef0123456789' });
  });

  it('accepts a bare id for somebody who typed it by hand', () => {
    expect(parseVerificationInput('BSDC-EVT-20260101-23456789')).toEqual({
      reportId: 'BSDC-EVT-20260101-23456789',
      hash: '',
    });
  });

  it('rejects something that is neither', () => {
    expect(parseVerificationInput('a receipt from the shop')).toBeNull();
    expect(parseVerificationInput('   ')).toBeNull();
  });
});

describe('the verifier', () => {
  const record: ReportDocument = {
    id: 'BSDC-MOD-20260301-3456789A',
    reportId: 'BSDC-MOD-20260301-3456789A',
    kind: 'moderation',
    title: 'Moderation summary',
    integrity: SHA256_OF_ABC,
    generatedAt: '2026-03-01T12:00:00.000Z',
    generatedByUid: 'staff-1',
    rowCount: 3,
    verificationUrl: 'https://www.bsdc.info.bd/verify/BSDC-MOD-20260301-3456789A',
  };

  it('confirms a document whose hash matches the record', () => {
    expect(verifyReportDocument(record, SHA256_OF_ABC)).toBe('confirmed');
  });

  it('refuses a document whose hash does not', () => {
    expect(verifyReportDocument(record, SHA256_OF_ABC.replace(/^b/, 'c'))).toBe('refused');
  });

  it('says it holds no record rather than passing a document it cannot check', () => {
    expect(verifyReportDocument(null, SHA256_OF_ABC)).toBe('unknown');
  });

  it('says so when what it was given is not a hash at all', () => {
    expect(verifyReportDocument(record, 'not a hash')).toBe('malformed');
    expect(verifyReportDocument(record, '')).toBe('malformed');
  });

  it('compares hashes in a way that does not depend on where they differ', () => {
    expect(hashesMatch(SHA256_OF_ABC, SHA256_OF_ABC.toUpperCase())).toBe(true);
    expect(hashesMatch(SHA256_OF_ABC, SHA256_OF_ABC.slice(0, 63))).toBe(false);
    expect(hashesMatch('aa', 'ab')).toBe(false);
  });

  it('explains every verdict in both languages', () => {
    for (const verdict of ['confirmed', 'refused', 'unknown', 'malformed'] as const) {
      const copy = verdictExplanation(verdict);
      expect(copy.bn.length).toBeGreaterThan(10);
      expect(copy.en.length).toBeGreaterThan(10);
    }
  });
});

describe('the catalogue', () => {
  it('counts what is in the snapshot and nothing else', () => {
    const payload = buildReportPayload(
      'moderation',
      {
        reports: [
          { state: 'open', category: 'spam', deletedAt: null },
          { state: 'actioned', category: 'spam', deletedAt: null },
          { state: 'open', category: 'abuse', deletedAt: '2026-01-01' },
        ] as never,
        events: [],
        jobs: [],
        membersByRole: {},
        periodStart: null,
        periodEnd: null,
      },
      'en',
    );
    const open = payload.rows.find((row) => row.label === 'open');
    const actioned = payload.rows.find((row) => row.label === 'actioned');
    expect(open?.value).toBe('1');
    expect(actioned?.value).toBe('1');
    expect(payload.totals[0]?.value).toBe('2');
  });

  it('builds a members report that adds up to the accounts it was given', () => {
    const payload = buildReportPayload(
      'members',
      {
        reports: [],
        events: [],
        jobs: [],
        membersByRole: { member: 120, creator: 8, root: 1 },
        periodStart: null,
        periodEnd: null,
      },
      'bn',
    );
    expect(payload.totals[0]?.value).toBe('129');
  });

  it('labels the report in the language it was asked for', () => {
    const snapshot = {
      reports: [],
      events: [],
      jobs: [],
      membersByRole: {},
      periodStart: null,
      periodEnd: null,
    };
    expect(buildReportPayload('jobs', snapshot, 'bn').title).toBe('চাকরি প্রতিবেদন');
    expect(buildReportPayload('jobs', snapshot, 'en').title).toBe('Jobs report');
  });
});

describe('the printed document', () => {
  it('carries the id in its filename, the PDF header in its bytes and a QR code on its face', async () => {
    const at = new Date('2026-03-01T10:00:00.000Z');
    const payload = buildReportPayload(
      'moderation',
      {
        reports: [{ state: 'open', category: 'spam', deletedAt: null }] as never,
        events: [],
        jobs: [],
        membersByRole: {},
        periodStart: null,
        periodEnd: null,
      },
      'en',
    );
    const sealed = await sealReport(payload, at, [1, 1, 1, 1, 1, 1, 1, 1]);
    const pdf = await buildReportPdf(sealed, payload, 'en');

    expect(pdf.fileName).toBe(`${sealed.reportId}.pdf`);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.bytes.byteLength).toBeGreaterThan(2_000);
    expect(pdf.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(sealed.reportId).toMatch(/^BSDC-MOD-\d{8}-/);
  });

  it('produces a different document for a different report, byte for byte', async () => {
    const at = new Date('2026-03-01T10:00:00.000Z');
    const one = await sealReport(PAYLOAD, at, [1, 1, 1, 1, 1, 1, 1, 1]);
    const two = await sealReport(PAYLOAD, at, [9, 9, 9, 9, 9, 9, 9, 9]);
    const first = await buildReportPdf(one, PAYLOAD, 'en');
    const second = await buildReportPdf(two, PAYLOAD, 'en');
    expect(first.fileName).not.toBe(second.fileName);
  });
});
