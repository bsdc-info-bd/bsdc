import { describe, expect, it } from 'vitest';
import {
  PdfDocument,
  escapePdfText,
  hexToRgb,
  pdfText,
  textWidth,
  toLatin,
  wrapText,
} from './document';
import { officialSignature } from './signature';
import {
  BRAND_MARK,
  curvedCaption,
  guilloche,
  markGeometry,
  sealGeometry,
  watermarkGeometry,
  wordmarkLayout,
} from './ornament';

/** The content stream of a one-page document, as text. */
function stream(doc: PdfDocument): string {
  return new TextDecoder().decode(doc.build());
}

describe('text a base-14 font can actually draw', () => {
  // The bug this exists for: `·` written as JavaScript into the content stream
  // becomes two UTF-8 bytes, and a reader told the stream is WinAnsi prints
  // `Â·`. A certificate carried it in its footer.
  it('is ASCII, so no character becomes two bytes on the way out', () => {
    const out = toLatin('Registry entry · course — “quoted” 100%');
    expect(out).toBe('Registry entry - course - "quoted" 100%');
    for (const character of out) {
      expect(character.codePointAt(0)).toBeLessThanOrEqual(126);
    }
  });

  it('keeps a word readable rather than deleting the character', () => {
    // Dropping it would fuse "co" and "operative" into "cooperative".
    expect(toLatin('co·operative')).toBe('co-operative');
  });

  it('degrades a script the font cannot draw to a space, not to a box', () => {
    expect(toLatin('বাংলা')).toBe('');
    expect(toLatin('a বাংলা b')).toBe('a b');
  });

  it('escapes the three characters that would end a PDF string', () => {
    expect(escapePdfText('a(b)c\\d')).toBe('a\\(b\\)c\\\\d');
  });

  it('never emits a non-ASCII byte in a document that used one', () => {
    const doc = new PdfDocument('A · B', 'portrait');
    doc.text('Ada — Rahim', { size: 10 });
    const bytes = doc.build();
    // A title is written into the metadata too, which is the other place a
    // stray character used to become two bytes.
    const ascii = Array.from(bytes).every((byte) => byte < 128);
    expect(ascii).toBe(true);
  });
});

describe('typesetting arithmetic', () => {
  it('measures a bold string wider than the same string in roman', () => {
    expect(textWidth('BSDC', 10, true)).toBeGreaterThan(textWidth('BSDC', 10, false));
  });

  it('wraps to the width it is given, never over it', () => {
    const lines = wrapText('one two three four five six seven eight nine ten', 10, 80);
    for (const line of lines) expect(textWidth(line, 10)).toBeLessThanOrEqual(80);
    // and it does not lose a word doing it
    expect(lines.join(' ')).toBe('one two three four five six seven eight nine ten');
  });

  it('does not mislabel the Indian rupee as Bangladeshi taka', () => {
    expect(pdfText('₹ 100')).toBe('INR 100');
    expect(pdfText('৳ 100')).toBe('৳ 100');
  });

  it('measures wide Helvetica glyphs accurately and wraps long unbroken words', () => {
    expect(textWidth('WWWW', 10)).toBeCloseTo(37.76, 2);
    expect(textWidth('iiii', 10)).toBeCloseTo(8.88, 2);
    const word = 'W'.repeat(80);
    const lines = wrapText(word, 10, 80);
    expect(lines.join('')).toBe(word);
    for (const line of lines) expect(textWidth(line, 10)).toBeLessThanOrEqual(80);
  });

  it('reads a hexadecimal colour, and refuses nonsense instead of guessing', () => {
    expect(hexToRgb('#1b4332')).toEqual([27 / 255, 67 / 255, 50 / 255]);
    expect(hexToRgb('1b4332')).toEqual([27 / 255, 67 / 255, 50 / 255]);
    expect(hexToRgb('not a colour')).toEqual([0, 0, 0]);
  });
});

describe('the page vocabulary', () => {
  it('moves the cursor only when it is asked to', () => {
    const doc = new PdfDocument('x', 'portrait');
    const before = doc.y;
    doc.place('placed', 100, 100, { size: 10 });
    expect(doc.y).toBe(before);
  });

  // The bug this exists for: `cos` and `sin` were left in the text matrix as
  // words, so the operator was invalid PDF and every glyph landed at the same
  // place. A rotated letter must produce a real matrix.
  it('rotates type with a numeric matrix, never a word', () => {
    const doc = new PdfDocument('x', 'portrait');
    doc.place('V', 100, 200, { size: 8, rotate: Math.PI / 2 });
    const content = new TextDecoder().decode(doc.build());
    expect(content).not.toMatch(/\bcos\b/);
    expect(content).not.toMatch(/\bsin\b/);
    // cos(pi/2) = 0, sin(pi/2) = 1
    expect(content).toContain('0.0000 1.0000 -1.0000 0.0000 100.00 200.00 Tm');
  });

  it('places type without rotation with the identity matrix', () => {
    const doc = new PdfDocument('x', 'portrait');
    doc.place('flat', 10, 20, { size: 8 });
    expect(new TextDecoder().decode(doc.build())).toContain('1 0 0 1 10.00 20.00 Tm');
  });

  it('draws a circle using PDF cubic curves, filled or stroked', () => {
    const doc = new PdfDocument('x', 'portrait');
    doc.circle({ x: 50, y: 50 }, 10, { fill: [1, 0, 0], stroke: [0, 0, 0], width: 1 });
    const content = new TextDecoder().decode(doc.build());
    expect(content).not.toMatch(/\barc\b/);
    expect(content).toContain('60.00 50.00 m');
    expect(content).toContain('60.00 50.00 c h f');
    expect(content).toContain('60.00 50.00 c h S');
  });

  it('starts a new page rather than printing past the margin', () => {
    const doc = new PdfDocument('x', 'portrait');
    for (let line = 0; line < 200; line += 1) doc.text(`line ${String(line)}`, { size: 10 });
    const content = new TextDecoder().decode(doc.build());
    // Two or more /Type /Page objects: the text overflowed onto a second sheet.
    expect(content.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
  });
});

describe('the brand, drawn', () => {
  it('draws the mark as a filled square, an outline shield and a check', () => {
    const ops = markGeometry({ x: 0, y: 0, width: 64, height: 64 }, BRAND_MARK);
    expect(ops.length).toBeGreaterThanOrEqual(4);
    expect(ops.join(' ')).toContain('W n');
    // The check starts at y=32, dips to 27, and rises to 37 in PDF coordinates.
    expect(ops.join(' ')).toContain('25.00 32.00 m 30.00 27.00 l 39.00 37.00 l');
    expect(ops.join(' ')).toMatch(/S$/);
  });

  it('watermarks with strokes only, so it cannot print as a grey box', () => {
    const ops = watermarkGeometry({ x: 0, y: 0, width: 100, height: 100 }, [0.9, 0.9, 0.9]);
    expect(ops.join(' ')).not.toContain('re f');
    expect(ops.join(' ')).toContain('S');
  });

  it('lays out the wordmark against the mark, at a size that fits', () => {
    const layout = wordmarkLayout({ x: 40, y: 100, width: 0, height: 30 });
    expect(layout.title.text).toBe('BSDC');
    expect(layout.title.x).toBeGreaterThan(layout.mark.x + layout.mark.width);
    expect(layout.subtitle.size).toBeLessThan(layout.title.size);
    expect(layout.subtitle.size).toBeGreaterThanOrEqual(4.6);
  });

  it('draws a guilloche that tapers at both ends', () => {
    const ops = guilloche({ x: 0, y: 0, width: 400, height: 40 }, { strokes: 2, steps: 32 });
    // Two strokes, two waves each.
    expect(ops).toHaveLength(4);
    for (const path of ops) expect(path).toContain(' l ');
  });
});

describe('a seal', () => {
  it('has four bands, and its rim is drawn over its field', () => {
    const ops = sealGeometry({ x: 100, y: 100 }, 30, { ink: [0, 0, 0], ring: [1, 1, 1] });
    expect(ops[0]).toContain('f');
    expect(ops.join(' ')).not.toMatch(/\barc\b/);
    expect(ops.join(' ')).toContain('130.00 100.00 m');
    // 60 milled rays, plus the field, rim and inner ring.
    expect(ops.length).toBe(63);
  });
});

describe('type on a circle', () => {
  const centre = { x: 200, y: 200 };

  it('fits a long caption by shrinking it, rather than wrapping past the ring', () => {
    const short = curvedCaption('VERIFIED', centre, 30, { half: 'top', size: 7 });
    const long = curvedCaption('BANGLADESH SOFTWARE DEVELOPMENT COMMUNITY', centre, 30, {
      half: 'top',
      size: 7,
    });
    expect(short[0]?.size).toBeCloseTo(7, 1);
    expect(long[0]?.size ?? 0).toBeLessThan(4);
    expect(long[0]?.size ?? 0).toBeGreaterThan(2);
  });

  it('keeps every character on the arc it was given', () => {
    for (const half of ['top', 'bottom'] as const) {
      for (const glyph of curvedCaption('BSDC 2024', centre, 24, { half })) {
        const distance = Math.hypot(glyph.x - centre.x, glyph.y - centre.y);
        expect(distance).toBeCloseTo(24, 1);
      }
    }
  });

  it('centres on the vertical: the middle character sits at the apex', () => {
    const glyphs = curvedCaption('ABC', centre, 30, { half: 'top' });
    const middle = glyphs[1];
    expect(middle?.x).toBeCloseTo(centre.x, 0);
    expect(middle?.y).toBeCloseTo(centre.y + 30, 0);
  });

  // Type on a seal stands upright against its arc at both the top and the
  // bottom: a caption that turned upside down at the foot of the ring would be
  // correct geometry and unreadable type.
  it('keeps the type upright against the ring, at the top and at the bottom', () => {
    const top = curvedCaption('ABC', centre, 30, { half: 'top' })[1];
    const bottom = curvedCaption('ABC', centre, 30, { half: 'bottom' })[1];
    expect(top?.rotate).toBeCloseTo(0, 1);
    expect(bottom?.rotate).toBeCloseTo(0, 1);
    const first = curvedCaption('ABCDE', centre, 30, { half: 'bottom' })[0];
    const last = curvedCaption('ABCDE', centre, 30, { half: 'bottom' })[4];
    // The ends lean in opposite directions, which is what makes the run curve.
    expect((first?.rotate ?? 0) * (last?.rotate ?? 0)).toBeLessThan(0);
  });

  it('answers nothing for an empty caption instead of a broken arc', () => {
    expect(curvedCaption('', centre, 30)).toEqual([]);
  });
});

describe('the supplied signature', () => {
  it('draws the cropped, transparent signature within its box', () => {
    const ops = officialSignature({ x: 100, y: 100, width: 160, height: 44 });
    expect(ops[0]).toBe('q');
    expect(ops.at(-1)).toBe('Q');
    expect(ops.join(' ')).toContain(' re');
    expect(ops.length).toBeGreaterThan(3);
  });

  it('does not draw for a zero-size box', () => {
    expect(officialSignature({ x: 0, y: 0, width: 0, height: 40 })).toEqual([]);
  });
});

describe('Bengali PDF text', () => {
  it('keeps the original Bengali and emits shaped outlines with ActualText', () => {
    const text = 'আয়েশা রহমান';
    expect(pdfText(text)).toBe(text);
    const doc = new PdfDocument('x');
    doc.text(text, { size: 14 });
    const output = stream(doc);
    expect(output).toContain('/ActualText <FEFF');
    expect(output).toContain(' c');
    expect(textWidth(text, 14)).toBeGreaterThan(0);
  });

  it('refuses an unsupported character rather than silently losing it', () => {
    expect(() => pdfText('Unsupported 😀')).toThrow('U+1F600');
  });

  it('splits long words only at grapheme boundaries', () => {
    const word = 'বাংলাদেশ'.repeat(10);
    expect(wrapText(word, 12, 80).join('')).toBe(word);
  });
});

describe('the document as a file', () => {
  it('is a PDF that a reader can open: header, xref, trailer, EOF', () => {
    const doc = new PdfDocument('A document', 'landscape', 48);
    doc.colouredText('Title', [0.1, 0.3, 0.2], { size: 20, bold: true, align: 'center' });
    const content = stream(doc);
    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain('xref');
    expect(content).toContain('trailer');
    expect(content.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('writes the title into the metadata, in ASCII', () => {
    const doc = new PdfDocument('BSDC certificate — Nusrat', 'portrait');
    expect(stream(doc)).toContain('/Title (BSDC certificate - Nusrat)');
  });

  it('counts lengths in bytes, so a multi-byte character cannot shift the xref', () => {
    const doc = new PdfDocument('x', 'portrait');
    doc.text('a b c', { size: 10 });
    const content = stream(doc);
    // Every offset in the xref points at an object header, which is what a
    // reader follows; a character-counted length breaks the file silently.
    for (const match of content.matchAll(/(\d{10}) 00000 n /g)) {
      const offset = Number(match[1]);
      expect(content.slice(offset, offset + 4)).toMatch(/^\d+ 0/);
    }
  });
});
