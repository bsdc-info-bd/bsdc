import {
  BRAND_MARK,
  PdfDocument,
  curvedCaption,
  guilloche,
  hexToRgb,
  markGeometry,
  SEAL_BANDS,
  sealGeometry,
  officialSignature,
  watermarkGeometry,
  textWidth,
  pdfText,
  wordmarkLayout,
  wrapText,
  type Rgb,
} from '@kit/pdf';
import { qrMatrix, verificationUrl } from '@kit';
import { longDate, type TemplateRow } from './model';

/**
 * The printed certificate.
 *
 * A certificate has one job beyond looking like itself: it has to be checkable
 * by somebody holding the paper. Its final page carries the code in type, the
 * public desk in words and a QR that resolves to it. The layout reserves that
 * panel first, so a long body may not push the proof off the sheet.
 *
 * The rules the design keeps, because each one is the difference between a
 * document and a screenshot:
 *
 *   * Layered frame: a solid accent band, a hairline inset, and a guilloche
 *     whose amplitude tapers at both ends. Printed certificates are made of
 *     line work; a single rectangle is what a form letter has.
 *   * A watermark at 4 per cent ink behind the type. It is vector, so it does
 *     not band on a laser printer and it does not survive a photocopier as a
 *     grey box.
 *   * The wordmark drawn from the brand's geometry, not a picture of it, so it
 *     is sharp at any size and cannot go stale in a cached asset.
 *   * A seal and a signature that is a stroke rather than a font. A typed name
 *     under a rule reads as a form.
 *   * Type set to a measured measure, not a rectangle: the body is between 52
 *     and 78 characters a line, which is what makes a page readable.
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
  readonly status?: 'issued' | 'revoked';
  /** The template's own key, printed small, so a reissue can find it. */
  readonly templateKey?: string;
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
    readonly status?: 'issued' | 'revoked';
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
    templateKey: template.key,
    status: fields.status ?? 'issued',
  };
}

/** Mixes a colour towards white: the tint a watermark is drawn in. */
function tint(colour: Rgb, amount: number): Rgb {
  return colour.map((part) => part + (1 - part) * amount) as unknown as Rgb;
}

export function buildCertificatePdf(print: CertificatePrint): Uint8Array {
  const doc = new PdfDocument(`BSDC certificate ${print.code}`, print.orientation, 56);
  const accent = hexToRgb(print.accent);
  const mark = BRAND_MARK;
  const landscape = print.orientation === 'landscape';

  /** Draws the whole sheet furniture onto the current page. */
  const decorate = (): void => {
    const { width, height } = doc;

    // 1. The sheet.
    doc.rect(0, 0, width, height, [1, 1, 1]);

    // 2. The watermark first, so every later mark sits over it: the sheet's
    //    own shield, drawn as outline work at four per cent ink. It is drawn
    //    in the accent's palest tint rather than grey, so a themed template
    //    watermarks itself in its own colour.
    //    It sits in the upper two-thirds and the seal sits at the foot, so the
    //    two marks never draw over one another — which is what a watermark and
    //    a seal look like when they collide: one smudge.
    const watermarkSize = Math.min(width, height) * 0.6;
    doc.ops(
      ...watermarkGeometry(
        {
          x: (width - watermarkSize) / 2,
          y: height * 0.36,
          width: watermarkSize,
          height: watermarkSize,
        },
        tint(accent, 0.925),
        Math.max(0.7, watermarkSize * 0.002),
      ),
    );

    // 3. The frame: a saturated band, a gap, and a hairline inside it.
    doc.frame(accent, 20, 2.5);
    doc.frame(tint(accent, 0.55), 26, 0.5);

    // 4. Guilloche at the head and the foot, tapering at both ends so the
    //    ornament fades rather than stopping at a cut edge.
    doc.ops(
      ...guilloche(
        { x: 34, y: height - 104, width: width - 68, height: 58 },
        {
          strokes: 3,
          amplitude: 22,
        },
      ),
    );
    doc.ops(
      ...guilloche({ x: 34, y: 40, width: width - 68, height: 34 }, { strokes: 2, amplitude: 12 }),
    );

    // 5. The wordmark, drawn from the brand's geometry rather than embedded,
    //    so it is sharp at any print size and cannot go stale in a cache.
    const layout = wordmarkLayout({
      x: 44,
      y: height - 74,
      width: 0,
      height: landscape ? 30 : 26,
    });
    doc.ops(...markGeometry(layout.mark, mark));
    doc.place(layout.title.text, layout.title.x, layout.title.y, {
      size: layout.title.size,
      bold: true,
      colour: mark.ink,
    });
    doc.place(layout.subtitle.text, layout.subtitle.x, layout.subtitle.y, {
      size: layout.subtitle.size,
      bold: true,
      colour: mark.gradientStart,
      tracking: 0.35,
    });

    // 6. The document's own kind, top right, as a letterspaced caption with a
    //    rule beneath it: the one piece of furniture that names the page.
    const caption = print.status === 'revoked' ? 'REVOKED - CHECK REGISTRY' : 'BSDC CERTIFICATE';
    const captionWidth = textWidth(caption, 6.6, true) + caption.length * 1.2;
    doc.place(caption, width - 46 - captionWidth, height - 56, {
      size: 6.6,
      bold: true,
      colour: tint(accent, 0.15),
      tracking: 1.2,
    });
    doc.line(
      { x: width - 46 - captionWidth, y: height - 62 },
      { x: width - 46, y: height - 62 },
      { colour: tint(accent, 0.55), width: 0.6 },
    );
  };

  let page = 1;
  decorate();
  const ensureTextSpace = (height: number): void => {
    // Portrait puts the seal above the proof so its narrower footer remains
    // readable; reserve a little extra room for it on every portrait page.
    if (doc.y - height >= (landscape ? 210 : 232)) return;
    doc.place(`Continued on page ${String(page + 1)}`, doc.margin, 40, { size: 7, grey: 0.45 });
    doc.addPage();
    page += 1;
    decorate();
    doc.place(`CONTINUED - PAGE ${String(page)}`, doc.margin, doc.height - 94, {
      size: 7,
      bold: true,
      colour: accent,
    });
    doc.moveTo(doc.height - 110);
  };
  const writeText = (
    value: string,
    options: {
      size: number;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
      grey?: number;
      colour?: Rgb;
      tracking?: number;
    },
    measure = doc.contentWidth,
  ): void => {
    for (const line of wrapText(pdfText(value), options.size, measure, options.bold === true)) {
      ensureTextSpace(options.size + 4);
      doc.text(line, options);
    }
  };

  // ------------------------------------------------------------- the type ---
  // The type block is optically centred, not top-aligned: a landscape sheet
  // with all its words in the upper half reads as a letter that ran out.
  doc.space(landscape ? 86 : 52);
  writeText(print.heading, {
    colour: accent,
    size: landscape ? 30 : 26,
    bold: true,
    align: 'center',
    tracking: 0.4,
  });
  doc.space(6);

  // A short rule centred under the heading, in the accent, with the brand's
  // green beneath it: two weights of one gesture.
  const headingRuleWidth = Math.min(
    textWidth(pdfText(print.heading), landscape ? 30 : 26, true) + 30,
    260,
  );
  const headingRuleInset = (doc.contentWidth - headingRuleWidth) / 2;
  doc.rule({ inset: Math.max(0, headingRuleInset), grey: 0.85 });
  doc.space(12);

  writeText('This is to certify that', { size: 10, grey: 0.42, align: 'center', tracking: 0.6 });
  doc.space(8);
  writeText(print.recipientName, {
    colour: mark.ink,
    size: landscape ? 25 : 21,
    bold: true,
    align: 'center',
  });
  doc.space(2);

  // The name's own rule: the width of the name plus a margin, which is how a
  // certificate sets a name apart from the sentence about it.
  const nameWidth = Math.min(
    textWidth(pdfText(print.recipientName), landscape ? 25 : 21, true) + 56,
    doc.contentWidth,
  );
  doc.rule({ inset: Math.max(0, (doc.contentWidth - nameWidth) / 2), grey: 0.72 });
  doc.space(14);

  // The body, set to a measured measure: never wider than about 78 characters.
  const measure = Math.min(doc.contentWidth * 0.82, 420);
  writeText(print.body, { size: 11.5, align: 'center', grey: 0.16 }, measure);

  // -------------------------------------------------- dates and the seal ---
  doc.space(16);
  writeText(`Issued on ${longDate(print.issuedOn)}`, {
    size: 9.5,
    grey: 0.38,
    align: 'center',
    tracking: 0.3,
  });
  if (print.expiresOn !== null) {
    writeText(`Valid until ${longDate(print.expiresOn)}`, {
      size: 9.5,
      grey: 0.38,
      align: 'center',
      tracking: 0.3,
    });
  }

  // On portrait sheets, lift the seal above the verification text: placing it
  // between the QR and signature leaves too little horizontal room.
  const sealRadius = landscape ? 36 : 30;
  const sealCentre = {
    x: doc.width / 2,
    y: landscape ? doc.margin + sealRadius + 20 : doc.margin + 128,
  };
  // A white field with an accent rim: an ink-filled seal is unreadable at print
  // size, because the caption and the milled edge are the same value.
  doc.circle(sealCentre, sealRadius, { fill: [1, 1, 1] });
  doc.ops(...sealGeometry(sealCentre, sealRadius, { ink: accent, ring: [1, 1, 1] }));
  const sealMarkSize = sealRadius * SEAL_BANDS.mark * 0.86;
  doc.ops(
    ...markGeometry(
      {
        x: sealCentre.x - sealMarkSize / 2,
        y: sealCentre.y - sealMarkSize * 0.5,
        width: sealMarkSize,
        height: sealMarkSize,
      },
      mark,
    ),
  );
  for (const glyph of curvedCaption('BSDC', sealCentre, sealRadius * SEAL_BANDS.caption, {
    half: 'top',
    size: 6.8,
  })) {
    doc.place(glyph.character, glyph.x, glyph.y - glyph.size * 0.36, {
      size: glyph.size,
      bold: true,
      colour: accent,
      rotate: glyph.rotate,
    });
  }
  for (const glyph of curvedCaption('BSDC 2026', sealCentre, sealRadius * SEAL_BANDS.caption, {
    half: 'bottom',
    size: 6.2,
  })) {
    doc.place(glyph.character, glyph.x, glyph.y - glyph.size * 0.36, {
      size: glyph.size,
      bold: true,
      colour: accent,
      rotate: glyph.rotate,
    });
  }

  // ------------------------------------------------------ the signature ---
  // The supplied signature is a cropped transparent source, not a fabricated stroke.
  const signatureWidth = Math.min(landscape ? 170 : 130, doc.width * 0.3);
  const signatureBox = {
    x: doc.width - doc.margin - signatureWidth - 8,
    y: doc.margin + 58,
    width: signatureWidth,
    height: 46,
  };
  doc.ops(...officialSignature(signatureBox));
  doc.line(
    { x: signatureBox.x, y: signatureBox.y - 2 },
    { x: signatureBox.x + signatureBox.width, y: signatureBox.y - 2 },
    { colour: tint(accent, 0.55), width: 0.5 },
  );
  // Fit the template's signer caption into its own column; do not let a long
  // name or title run through the page frame or into the neighbouring seal.
  const captionWidth = doc.width - doc.margin - signatureBox.x;
  const signer = pdfText(print.signatureName);
  let signerSize = 9.5;
  while (signerSize > 5 && textWidth(signer, signerSize, true) > captionWidth) signerSize -= 0.5;
  if (textWidth(signer, signerSize, true) > captionWidth) {
    throw new Error('The certificate signer name is too long to fit in the signature area.');
  }
  doc.place(signer, signatureBox.x, signatureBox.y - 12, {
    size: signerSize,
    bold: true,
    colour: mark.ink,
  });
  let titleSize = 6.8;
  let titleLines = wrapText(pdfText(print.signatureTitle), titleSize, captionWidth);
  while (titleLines.length > 2 && titleSize > 5) {
    titleSize = Math.max(5, titleSize - 0.3);
    titleLines = wrapText(pdfText(print.signatureTitle), titleSize, captionWidth);
  }
  if (titleLines.length > 2) {
    throw new Error('The certificate signer title is too long to fit in the signature area.');
  }
  titleLines.forEach((line, index) => {
    doc.place(line, signatureBox.x, signatureBox.y - 23 - index * (titleSize + 2), {
      size: titleSize,
      grey: 0.45,
    });
  });

  // -------------------------------------------------- the verification ---
  // Reserved at the foot, in absolute coordinates, so no length of body copy
  // can push it off the sheet.
  const url = verificationUrl(print.siteUrl, print.code);
  const qrSize = landscape ? 74 : 66;
  const qrX = doc.margin + 14;
  const qrY = doc.margin + 22;
  // Four modules of white on every side. A QR printed over ornament is the
  // single most common reason a certificate will not scan.
  const quiet = qrSize * 0.16;
  doc.rect(qrX - quiet, qrY - quiet, qrSize + quiet * 2, qrSize + quiet * 2, [1, 1, 1]);
  doc.qr(qrMatrix(url), qrX, qrY, qrSize);

  const textX = qrX + qrSize + 12;
  doc.place('SCAN TO VERIFY', textX, qrY + qrSize - 4, {
    size: 6.5,
    bold: true,
    colour: tint(accent, 0.25),
    tracking: 1.1,
  });
  doc.place(print.code, textX, qrY + qrSize - 26, {
    size: 12.5,
    bold: true,
    colour: mark.ink,
  });
  doc.place(url.replace(/^https?:\/\//, ''), textX, qrY + qrSize - 39, {
    size: 7.5,
    colour: [0.32, 0.36, 0.34] as Rgb,
  });
  doc.place('Compare details with the BSDC registry.', textX, qrY + qrSize - 51, {
    size: 6.8,
    grey: 0.5,
  });
  doc.place(
    print.templateKey === undefined ? 'Registry entry' : `Registry entry · ${print.templateKey}`,
    textX,
    qrY + 3,
    { size: 6.4, grey: 0.55 },
  );

  return doc.build();
}
