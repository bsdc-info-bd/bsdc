import {
  PdfDocument,
  hexToRgb,
  qrMatrix,
  textWidth,
  toLatin,
  verificationUrl,
  wrapText,
} from '@kit';
import { longDate, type TemplateRow } from './model';

/**
 * The printed certificate.
 *
 * Everything on the page is either the frozen text of the document or a way
 * of checking it: the code, the QR that resolves to the public desk, and
 * the address of that desk in plain words for somebody who cannot scan.
 */
export type CertificatePrint = {
  readonly code: string;
  readonly heading: string;
  readonly recipientName: string;
  readonly body: string;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly accent: string;
  readonly orientation: 'landscape' | 'portrait';
  readonly signatureName: string;
  readonly signatureTitle: string;
  readonly siteUrl: string;
};

export function printFromTemplate(
  template: TemplateRow,
  fields: {
    readonly code: string;
    readonly recipientName: string;
    readonly body: string;
    readonly issuedOn: string;
    readonly expiresOn: string | null;
    readonly siteUrl: string;
  },
): CertificatePrint {
  return {
    code: fields.code,
    heading: template.heading,
    recipientName: fields.recipientName,
    body: fields.body,
    issuedOn: fields.issuedOn,
    expiresOn: fields.expiresOn,
    accent: template.accent,
    orientation: template.orientation,
    signatureName: template.signature_name,
    signatureTitle: template.signature_title,
    siteUrl: fields.siteUrl,
  };
}

export function buildCertificatePdf(print: CertificatePrint): Uint8Array {
  const doc = new PdfDocument(`BSDC certificate ${print.code}`, print.orientation, 56);
  const accent = hexToRgb(print.accent);

  doc.frame(accent, 22, 2.5);
  doc.frame(accent, 30, 0.75);

  doc.space(18);
  doc.colouredText('BANGLADESH SOFTWARE DEVELOPMENT COMMUNITY', accent, {
    size: 11,
    bold: true,
    align: 'center',
  });
  doc.space(10);
  doc.colouredText(print.heading, accent, { size: 26, bold: true, align: 'center' });
  doc.space(14);
  doc.text('This is to certify that', { size: 11, grey: 0.35, align: 'center' });
  doc.space(6);
  doc.text(print.recipientName, { size: 22, bold: true, align: 'center' });
  doc.space(4);

  // A rule the width of the name, so the page reads as a certificate rather
  // than as a letter that happens to have a border.
  const nameWidth = Math.min(
    textWidth(toLatin(print.recipientName), 22, true) + 40,
    doc.contentWidth,
  );
  const inset = (doc.contentWidth - nameWidth) / 2;
  doc.rule({ inset: Math.max(0, inset), grey: 0.6 });

  doc.space(10);
  for (const line of wrapText(toLatin(print.body), 12, doc.contentWidth * 0.78)) {
    doc.text(line, { size: 12, align: 'center' });
  }

  doc.space(18);
  doc.text(`Issued on ${longDate(print.issuedOn)}`, { size: 10, grey: 0.35, align: 'center' });
  if (print.expiresOn !== null) {
    doc.text(`Valid until ${longDate(print.expiresOn)}`, { size: 10, grey: 0.35, align: 'center' });
  }

  // The verification block sits at the foot of the page in absolute
  // coordinates, so a long body cannot push it off the sheet.
  const url = verificationUrl(print.siteUrl, print.code);
  const qrSize = 78;
  const qrX = doc.width - doc.margin - qrSize;
  const qrY = doc.margin + 6;
  doc.qr(qrMatrix(url), qrX, qrY, qrSize);

  doc.moveTo(qrY + qrSize - 6);
  doc.text(print.code, { size: 11, bold: true });
  doc.text('Verify this certificate at', { size: 9, grey: 0.4 });
  doc.text(url.replace(/^https?:\/\//, ''), { size: 9, grey: 0.4 });

  doc.moveTo(qrY + 54);
  doc.text(print.signatureName, { size: 11, bold: true, align: 'center' });
  doc.text(print.signatureTitle, { size: 9, grey: 0.4, align: 'center' });

  return doc.build();
}
