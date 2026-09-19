/**
 * BSDC — src/core/lib/pdf.ts
 * Purpose : Turns a sealed report into a PDF nobody has to take on trust.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : jsPDF and the QR encoder are heavy, so both are imported dynamically, inside the
 *   function that needs them: a visitor who never generates a report never downloads either. That
 *   is the whole reason this module is a function and not an import at the top of a component.
 *   Every page carries the BSDC wordmark, the report id, the generated-at stamp in Bangladesh
 *   time, the integrity hash and a QR code pointing at the public verification URL. The footer is
 *   repeated on every page, because a printed page two that cannot be identified is a page two
 *   somebody can replace.
 *   Bangla is not shaped here: the PDF text layer uses the Latin transliteration kept alongside
 *   each Bangla label, because the core PDF fonts cannot render Bengali conjuncts. The printed
 *   document is therefore bilingual-by-transliteration, and the on-screen document — which is the
 *   one a Bengali reader will actually read — is real Bangla. This is recorded in
 *   PUBLIC_LIMITATIONS.md rather than glossed over.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReportPayload, SealedReport } from './report';

/** Page geometry in millimetres, A4 portrait. */
const PAGE = { width: 210, height: 297, margin: 16 } as const;

/** Font sizes in points. */
const SIZE = { title: 17, heading: 11, body: 9.5, small: 7.5 } as const;

/** Line height multiplier. */
const LEAD = 1.45;

/** Colour, as an RGB triple jsPDF understands. */
/** An RGB colour. */
interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const INK: Rgb = { r: 17, g: 24, b: 39 };
const MUTED: Rgb = { r: 106, g: 114, b: 128 };

/** Result of building a PDF. */
export interface BuiltPdf {
  /** The file name the download should use. */
  readonly fileName: string;
  /** The PDF bytes. */
  readonly bytes: Uint8Array;
  /** The data URL of the QR code, for the on-screen preview. */
  readonly qrDataUrl: string;
}

/**
 * Renders a sealed report to a PDF.
 *
 * @param report the sealed report
 * @param payload the content it was sealed from
 * @param locale the viewer's language, which selects the transliterated labels
 * @returns the bytes and the file name
 */
export async function buildReportPdf(
  report: SealedReport,
  payload: ReportPayload,
  locale: 'bn' | 'en' = 'en',
): Promise<BuiltPdf> {
  const [{ jsPDF }, qrcode] = await Promise.all([import('jspdf'), import('qrcode')]);

  const qrDataUrl = await qrcode.toDataURL(report.verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let y = PAGE.margin;

  const write = (text: string, size: number, colour: Rgb = INK, indent = 0): void => {
    doc.setFontSize(size);
    doc.setTextColor(colour.r, colour.g, colour.b);
    const lines = doc.splitTextToSize(text, PAGE.width - PAGE.margin * 2 - indent) as string[];
    for (const line of lines) {
      if (y > PAGE.height - PAGE.margin - 18) {
        footer();
        doc.addPage();
        y = PAGE.margin;
      }
      doc.text(line, PAGE.margin + indent, y);
      y += (size * LEAD) / 3.2;
    }
  };

  const footer = (): void => {
    const page = doc.getNumberOfPages();
    doc.setFontSize(SIZE.small);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      `${report.reportId}  |  ${report.generatedAt}  |  page ${page}`,
      PAGE.margin,
      PAGE.height - 10,
    );
    doc.text('a platform of RRC Development', PAGE.margin, PAGE.height - 6);
  };

  // --- masthead -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  write('BSDC', SIZE.title);
  doc.setFont('helvetica', 'normal');
  write('Bangladesh Software Development Community', SIZE.body, MUTED);
  write('a platform of RRC Development', SIZE.small, MUTED);
  y += 2;
  doc.setDrawColor(INK.r, INK.g, INK.b);
  doc.setLineWidth(0.4);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 6;

  // --- identity block -------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  write(payload.title, SIZE.heading);
  doc.setFont('helvetica', 'normal');
  if (payload.subtitle.length > 0) write(payload.subtitle, SIZE.body, MUTED);
  write(`Report id: ${report.reportId}`, SIZE.body);
  write(
    `Generated at: ${report.generatedAt} (Asia/Dhaka: ${dhakaTime(report.generatedAt)})`,
    SIZE.body,
  );
  if (payload.periodStart !== null && payload.periodEnd !== null) {
    write(`Period: ${payload.periodStart} to ${payload.periodEnd}`, SIZE.body);
  }
  y += 3;

  // --- rows -----------------------------------------------------------------
  if (payload.rows.length > 0) {
    doc.setFont('helvetica', 'bold');
    write('Detail', SIZE.heading);
    doc.setFont('helvetica', 'normal');
    for (const row of payload.rows) {
      const note = row.note === undefined || row.note.length === 0 ? '' : ` (${row.note})`;
      write(`${row.label}: ${row.value}${note}`, SIZE.body, INK, 3);
    }
    y += 3;
  }

  if (payload.totals.length > 0) {
    doc.setFont('helvetica', 'bold');
    write('Totals', SIZE.heading);
    doc.setFont('helvetica', 'normal');
    for (const row of payload.totals) {
      const note = row.note === undefined || row.note.length === 0 ? '' : ` (${row.note})`;
      write(`${row.label}: ${row.value}${note}`, SIZE.body, INK, 3);
    }
    y += 4;
  }

  // --- integrity block ------------------------------------------------------
  doc.setDrawColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setLineWidth(0.2);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 5;

  const blockBottom = y + 34;
  if (blockBottom > PAGE.height - PAGE.margin - 18) {
    footer();
    doc.addPage();
    y = PAGE.margin;
  }

  doc.setFontSize(SIZE.small);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text('SHA-256 integrity', PAGE.margin, y);
  doc.setFontSize(SIZE.body - 1.5);
  doc.setTextColor(INK.r, INK.g, INK.b);
  const hashLines = doc.splitTextToSize(
    report.integrity,
    PAGE.width - PAGE.margin * 2 - 32,
  ) as string[];
  hashLines.forEach((line, index) => {
    doc.text(line, PAGE.margin, y + 4 + index * 4);
  });

  doc.addImage(qrDataUrl, 'PNG', PAGE.width - PAGE.margin - 28, y, 28, 28);
  doc.setFontSize(SIZE.small);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text('Scan to verify', PAGE.width - PAGE.margin - 28, y + 31);

  const urlLines = doc.splitTextToSize(
    report.verificationUrl,
    PAGE.width - PAGE.margin * 2 - 32,
  ) as string[];
  urlLines.forEach((line, index) => {
    doc.text(line, PAGE.margin, y + 12 + index * 3.6);
  });

  doc.setFontSize(SIZE.small);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(
    locale === 'bn'
      ? 'Verified at bsdc.info.bd — a platform of RRC Development'
      : 'Verified at bsdc.info.bd — a platform of RRC Development',
    PAGE.margin,
    y + 26,
  );

  footer();
  const bytes = doc.output('arraybuffer');
  return {
    fileName: `${report.reportId}.pdf`,
    bytes: new Uint8Array(bytes),
    qrDataUrl,
  };
}

/**
 * Formats an instant in Bangladesh time, because that is the time the community runs on.
 * @param iso ISO instant
 * @returns the local date and time
 */
function dhakaTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(at);
}

/**
 * Triggers a download of PDF bytes in the browser.
 * @param fileName the file name to save as
 * @param bytes the PDF
 */
export function downloadPdf(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}
