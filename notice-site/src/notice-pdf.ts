import { PdfDocument, hexToRgb, qrMatrix, verificationUrl } from '@kit';
import { paragraphs, type NoticeRow } from './model';

/**
 * The printed notice.
 *
 * A notice on paper outlives the page it came from, so the printed copy
 * carries its own code, the date it was published and the address of the
 * desk that can confirm it. Somebody holding a photocopy a year later can
 * still establish whether it was ever real.
 */
export type NoticePrint = {
  readonly code: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly category: string;
  readonly audience: string;
  readonly priority: string;
  readonly publishedAt: string | null;
  readonly expiresAt: string | null;
  readonly siteUrl: string;
};

export function printFromRow(row: NoticeRow, siteUrl: string): NoticePrint {
  return {
    code: row.code,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    audience: row.audience,
    priority: row.priority,
    publishedAt: row.publish_at,
    expiresAt: row.expires_at,
    siteUrl,
  };
}

const ACCENT = '#1b4332';
const URGENT = '#9b2226';

function stamp(iso: string | null): string {
  if (iso === null) return 'Not yet published';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not yet published';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }).format(date);
}

export function buildNoticePdf(print: NoticePrint): Uint8Array {
  const doc = new PdfDocument(`BSDC notice ${print.code}`, 'portrait', 56);
  const accent = hexToRgb(print.priority === 'urgent' ? URGENT : ACCENT);

  // Masthead: a bar, the issuer, then the notice number, so the page is
  // recognisable as an official notice from across a room.
  doc.rect(0, doc.height - 92, doc.width, 92, accent);
  doc.moveTo(doc.height - 44);
  doc.colouredText('BANGLADESH SOFTWARE DEVELOPMENT COMMUNITY', [1, 1, 1], {
    size: 12,
    bold: true,
  });
  doc.colouredText(`Notice ${print.code}`, [1, 1, 1], { size: 10 });

  doc.moveTo(doc.height - 130);
  doc.text(
    `${print.category.toUpperCase()} — ${print.priority.toUpperCase()} — ${print.audience.toUpperCase()}`,
    { size: 9, grey: 0.4 },
  );
  doc.space(4);
  doc.text(print.title, { size: 18, bold: true });
  doc.space(2);
  if (print.summary !== '') doc.text(print.summary, { size: 11, grey: 0.3 });
  doc.rule();
  doc.space(6);

  for (const block of paragraphs(print.body)) {
    doc.text(block, { size: 11 });
    doc.space(6);
  }

  doc.space(10);
  doc.rule();
  doc.keyValue('Published', stamp(print.publishedAt));
  doc.keyValue(
    'In force until',
    print.expiresAt === null ? 'Withdrawn or superseded' : stamp(print.expiresAt),
  );
  doc.keyValue('Notice number', print.code);

  const url = verificationUrl(print.siteUrl, print.code);
  const qrSize = 72;
  doc.qr(qrMatrix(url), doc.width - doc.margin - qrSize, doc.margin, qrSize);
  doc.moveTo(doc.margin + qrSize - 10);
  doc.text('Confirm this notice at', { size: 9, grey: 0.4 });
  doc.text(url.replace(/^https?:\/\//, ''), { size: 9, grey: 0.4 });

  return doc.build();
}
