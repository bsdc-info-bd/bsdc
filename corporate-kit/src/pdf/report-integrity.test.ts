import { describe, expect, it } from 'vitest';
import {
  REPORT_HASH_MARKER,
  REPORT_HASH_PLACEHOLDER,
  sealReportPdf,
  verifyReportPdf,
} from './report-integrity';

const makePdf = (): Uint8Array =>
  new TextEncoder().encode(`%PDF-1.4\n(${REPORT_HASH_PLACEHOLDER})\nbody\n%%EOF`);

describe('report fingerprint', () => {
  it('seals a PDF without changing its length and verifies the exact bytes', async () => {
    const original = makePdf();
    const sealed = await sealReportPdf(original);
    expect(sealed.bytes.length).toBe(original.length);
    expect(sealed.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyReportPdf(sealed.bytes, sealed.sha256)).toBe(true);
    expect(new TextDecoder().decode(original)).toContain(`${REPORT_HASH_MARKER}${'0'.repeat(64)}`);
  });

  it('detects changes outside the fingerprint and a different registered hash', async () => {
    const sealed = await sealReportPdf(makePdf());
    const altered = Uint8Array.from(sealed.bytes);
    altered[1] = 0x58;
    expect(await verifyReportPdf(altered, sealed.sha256)).toBe(false);
    expect(await verifyReportPdf(sealed.bytes, 'f'.repeat(64))).toBe(false);
  });

  it('rejects missing, duplicate or malformed markers', async () => {
    await expect(sealReportPdf(new TextEncoder().encode('%PDF'))).rejects.toThrow(
      'does not contain',
    );
    await expect(
      sealReportPdf(new TextEncoder().encode(REPORT_HASH_PLACEHOLDER.repeat(2))),
    ).rejects.toThrow('more than one');
    const malformed = new TextEncoder().encode(`${REPORT_HASH_MARKER}${'z'.repeat(64)}`);
    await expect(sealReportPdf(malformed)).rejects.toThrow('malformed');
  });
});
