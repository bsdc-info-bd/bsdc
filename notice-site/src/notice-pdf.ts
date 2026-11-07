import {
  BRAND_MARK,
  PdfDocument,
  guilloche,
  hexToRgb,
  markGeometry,
  officialSignature,
  textWidth,
  pdfText,
  watermarkGeometry,
  wordmarkLayout,
  wrapText,
  type Rgb,
} from '@kit/pdf';
import { qrMatrix, verificationUrl } from '@kit';
import { paragraphs, type NoticeRow } from './model';

/**
 * The printed notice.
 *
 * A notice on paper outlives the page it came from: it is pinned to a board,
 * photocopied, filed, and read a year after the site said something else. So
 * the printed copy carries its own code, the moment it was published, the
 * moment it stops being in force, and the address of the desk that can confirm
 * it — and it is designed to be recognised across a room before it is read.
 *
 * The design keeps three rules:
 *
 *   * A masthead in the document's own colour, because the colour is the
 *     severity: an urgent notice is red, everything else is the brand green.
 *   * Long body copy is set to a measured measure — between 60 and 75
 *     characters a line — and flows across pages with the masthead repeated
 *     small, so page two of a long notice is still recognisably the same
 *     document.
 *   * The proof block is reserved at the foot of the last page before the body
 *     is set, so no length of copy can push the verification off the sheet.
 */
export type NoticePrint = {
  readonly code: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly category: string;
  readonly audience: string;
  readonly priority: string;
  readonly status: NoticeRow['status'];
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
    status: row.status,
    publishedAt: row.publish_at,
    expiresAt: row.expires_at,
    siteUrl,
  };
}

const ACCENT = '#1b4332';
const URGENT = '#9b2226';
const IMPORTANT = '#b4690e';

function stamp(iso: string | null): string {
  if (iso === null) return 'Not yet published';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not yet published';
  return (
    new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }).format(date) + ' UTC'
  );
}

/** The one colour that says how urgent this is, and nothing else. */
function accentOf(priority: string): Rgb {
  if (priority === 'urgent') return hexToRgb(URGENT);
  if (priority === 'important') return hexToRgb(IMPORTANT);
  return hexToRgb(ACCENT);
}

function tint(colour: Rgb, amount: number): Rgb {
  return colour.map((part) => part + (1 - part) * amount) as unknown as Rgb;
}

export function buildNoticePdf(print: NoticePrint): Uint8Array {
  const doc = new PdfDocument(`BSDC notice ${print.code}`, 'portrait', 56);
  const accent = accentOf(print.priority);
  const mark = BRAND_MARK;
  const masthead = 104;
  const unpublished = print.status === 'draft' || print.publishedAt === null;
  const caption = unpublished
    ? 'DRAFT - NOT PUBLISHED'
    : print.status === 'archived'
      ? 'ARCHIVED - CHECK REGISTRY'
      : 'OFFICIAL NOTICE';

  /**
   * The foot of the page, measured once.
   *
   * `panelTop` is where the white panel under the QR ends; the ornament is
   * drawn inside that panel, and the dates begin above it. Everything that
   * draws at the foot reads these numbers, which is why they are a constant
   * and not three expressions that are *nearly* the same.
   */
  const FOOT = {
    qrSize: 76,
    qrX: doc.margin,
    qrY: doc.margin,
    panelTop: doc.margin + 76 + 44,
    datesTop: doc.margin + 76 + 44 + 64,
  };

  const ribbonY = doc.height - masthead - 26;
  let page = 1;
  const decorate = (): void => {
    // ------------------------------------------------------------ masthead ---
    doc.rect(0, doc.height - masthead, doc.width, masthead, accent);
    // A darker foot to the band, so it reads as printed stock rather than as a
    // filled shape. Mixed towards black deliberately: `tint` only mixes towards
    // white, and a negative amount is a colour that does not exist.
    doc.rect(
      0,
      doc.height - masthead,
      doc.width,
      14,
      accent.map((part) => part * 0.72) as unknown as Rgb,
    );

    const layout = wordmarkLayout({ x: 46, y: doc.height - 68, width: 0, height: 34 });
    doc.ops(...markGeometry(layout.mark, { ...mark, check: [1, 1, 1] }));
    doc.place(layout.title.text, layout.title.x, layout.title.y, {
      size: layout.title.size,
      bold: true,
      colour: [1, 1, 1],
    });
    doc.place(layout.subtitle.text, layout.subtitle.x, layout.subtitle.y, {
      size: layout.subtitle.size,
      bold: true,
      colour: [1, 1, 1],
      tracking: 0.35,
    });

    // The document number, right-aligned in the band, in white.
    const numberWidth = textWidth(print.code, 10.5, true);
    doc.place(print.code, doc.width - 46 - numberWidth, doc.height - 46, {
      size: 10.5,
      bold: true,
      colour: [1, 1, 1],
    });
    doc.place(caption, doc.width - 46 - textWidth(caption, 6.8, true) - 8, doc.height - 62, {
      size: 6.8,
      bold: true,
      colour: tint(accent, 0.82),
      tracking: 1.3,
    });

    // ------------------------------------------------------- the severity ---
    // A ribbon in the accent, immediately under the band: the one line that says
    // whether this notice must be acted on.
    doc.rect(0, ribbonY, doc.width, 26, tint(accent, 0.9));
    const ribbon =
      `${print.category.toUpperCase()}   |   ${print.priority.toUpperCase()}   |   ` +
      `${print.audience.toUpperCase()}`;
    doc.place(ribbon, 46, ribbonY + 9, {
      size: 7.2,
      bold: true,
      colour: accent,
      tracking: 1.1,
    });

    // A faint watermark behind the body, drawn before any of the type so it sits
    // under it: the notice's own mark, so a photocopy of this sheet is
    // recognisably a copy of this document.
    doc.ops(
      ...watermarkGeometry(
        { x: doc.width - 268, y: doc.height * 0.28, width: 220, height: 220 },
        tint(accent, 0.945),
        1,
      ),
    );

    if (page > 1) {
      doc.place(`CONTINUED - PAGE ${String(page)}`, 46, ribbonY - 18, {
        size: 7,
        bold: true,
        colour: accent,
      });
    }
  };
  decorate();

  // Reserve the date and proof areas before laying out any content. Repeat the
  // masthead on overflow pages; never paint the proof panel over body copy.
  const ensureBodySpace = (height: number): void => {
    if (doc.y - height >= FOOT.datesTop + 14) return;
    doc.place(`Continued on page ${String(page + 1)}`, doc.margin, 40, { size: 7, grey: 0.45 });
    doc.addPage();
    page += 1;
    decorate();
    doc.moveTo(ribbonY - 32);
  };
  const writeBody = (
    value: string,
    size: number,
    options: { bold?: boolean; colour?: Rgb; grey?: number } = {},
  ): void => {
    for (const line of wrapText(pdfText(value), size, doc.contentWidth, options.bold === true)) {
      ensureBodySpace(size + 4);
      doc.text(line, { size, ...options });
    }
  };

  // -------------------------------------------------------------- the type ---
  doc.moveTo(ribbonY - 30);
  writeBody(print.title, 21, { bold: true, colour: mark.ink });
  doc.space(6);
  doc.rule({ grey: 0.8 });
  doc.space(10);

  if (print.summary !== '') {
    writeBody(print.summary, 11.5, { grey: 0.28 });
    doc.space(10);
  }

  // A measured measure: the body column is narrower than the page, so a line
  // never runs wider than a reader can track back from.
  for (const block of paragraphs(print.body)) {
    writeBody(block, 10.5, { grey: 0.12 });
    doc.space(7);
  }

  // ---------------------------------------------- the dates, on the sheet ---
  // Pinned to the foot rather than left after the body: a short notice
  // otherwise ends with a hand's width of white and its dates floating in the
  // middle of the page. Every measurement below comes from `FOOT`, so the
  // dates, the ornament and the proof panel cannot be laid out from two
  // different ideas of where the foot begins.
  doc.moveTo(FOOT.datesTop);
  doc.rule({ grey: 0.82 });
  doc.space(4);
  doc.keyValue('Published', stamp(print.publishedAt));
  doc.keyValue(
    'In force until',
    print.expiresAt === null ? 'Until withdrawn or superseded' : stamp(print.expiresAt),
  );
  doc.keyValue('Notice number', print.code);

  // ------------------------------------------------------------- the proof ---
  // Reserved in absolute coordinates at the foot of the last page.
  const url = verificationUrl(print.siteUrl, print.code);
  const { qrSize, qrX, qrY } = FOOT;

  // A sheet of white behind the code and its caption, so a long body that runs
  // to the foot cannot print under the QR.
  doc.rect(0, 0, doc.width, FOOT.panelTop, [1, 1, 1]);
  doc.ops(
    ...guilloche(
      { x: 34, y: FOOT.panelTop - 16, width: doc.width - 68, height: 12 },
      { strokes: 2, amplitude: 5 },
    ),
  );
  const quiet = qrSize * 0.16;
  doc.rect(qrX - quiet, qrY - quiet, qrSize + quiet * 2, qrSize + quiet * 2, [1, 1, 1]);
  doc.qr(qrMatrix(url), qrX, qrY, qrSize);

  const textX = qrX + qrSize + 16;
  doc.place('SCAN TO CONFIRM', textX, qrY + qrSize - 4, {
    size: 6.8,
    bold: true,
    colour: accent,
    tracking: 1.2,
  });
  doc.place(print.code, textX, qrY + qrSize - 22, { size: 13, bold: true, colour: mark.ink });
  doc.place(url.replace(/^https?:\/\//, ''), textX, qrY + qrSize - 36, {
    size: 7.6,
    colour: [0.3, 0.34, 0.32] as Rgb,
  });
  doc.place('Check status and details in the BSDC registry.', textX, qrY + qrSize - 48, {
    size: 7,
    grey: 0.5,
  });
  doc.place('Bangladesh Software Development Community  |  bsdc.info.bd', textX, qrY + 2, {
    size: 6.6,
    grey: 0.55,
  });

  // Do not sign a draft: publication is a separate, authorized action.
  if (!unpublished) {
    // The supplied transparent signature is placed separately from the QR and
    // kept on white so the source's anti-aliased edge remains legible in print.
    const signature = { x: doc.width - 180, y: 91, width: 125, height: 43 };
    doc.ops(...officialSignature(signature));
    doc.line(
      { x: signature.x, y: signature.y - 2 },
      { x: signature.x + signature.width, y: signature.y - 2 },
      { colour: tint(accent, 0.55), width: 0.5 },
    );
    doc.place('Authorized BSDC signature', signature.x, signature.y - 13, {
      size: 6.6,
      colour: mark.ink,
    });
  }

  return doc.build();
}
