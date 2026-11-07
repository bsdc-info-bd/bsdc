import type { QrMatrix } from './qr';
import { supportsPdfCharacter, unicodeOperators, unicodeWidth, usesUnicode } from './unicode';

/**
 * A small PDF 1.4 writer for printed corporate documents.
 *
 * A certificate and a notice need text, rules, a frame, a block of body
 * copy and a QR code — not a layout engine. This draws those directly, is
 * pure (it returns bytes and never touches the DOM) and is therefore
 * testable line by line.
 *
 * Latin text uses standard PDF fonts. Bengali and supported non-ASCII text
 * use shaped Noto outlines and marked ActualText, so the printed content is
 * not silently dropped when a name or notice contains Bengali.
 */

export type Orientation = 'portrait' | 'landscape';

export type TextOptions = {
  readonly size?: number;
  readonly bold?: boolean;
  /** 0 is black, 1 is white. */
  readonly grey?: number;
  /** An explicit colour wins over `grey`, for type that is part of the brand. */
  readonly colour?: Rgb;
  readonly align?: 'left' | 'center' | 'right';
  /** Extra space between characters in points: a letterspaced caption. */
  readonly tracking?: number;
};

export type Rgb = readonly [number, number, number];

/** Type placed at an exact point, for geometry rather than prose. */
export type PlaceOptions = {
  readonly size?: number;
  readonly bold?: boolean;
  /** An explicit colour, or `grey` when it is a shade of black. */
  readonly colour?: Rgb;
  /** 0 is black, 1 is white. Ignored when `colour` is given. */
  readonly grey?: number;
  readonly rotate?: number;
  readonly tracking?: number;
};

const A4_SHORT = 595.28;
const A4_LONG = 841.89;

/** Escapes the three characters that would otherwise end a PDF string. */
export function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Makes a string safe for a base-14 font with `WinAnsiEncoding`.
 *
 * Two mistakes are possible here and both are visible on paper. Dropping a
 * character fuses two words together; keeping a character the font cannot draw
 * produces a box or a blank. The third mistake is the one this function now
 * exists to prevent: writing a JavaScript string straight into the content
 * stream, where `TextEncoder` turns `·` into two bytes and the reader, told the
 * stream is WinAnsi, prints `Â·`. So the output is ASCII, punctuation that has
 * an honest ASCII equivalent is translated, and anything else becomes a space.
 *
 * An em dash becomes a hyphen, curly quotes become straight ones, and a
 * non-breaking space becomes a space — the visible difference is nil and the
 * document is correct on every reader.
 */
const ASCII_FALLBACK: Readonly<Record<string, string>> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': ',',
  '\u201b': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
  '\u2212': '-',
  '\u2026': '...',
  '\u00b7': '-',
  '\u2022': '*',
  '\u00a0': ' ',
  '\u2009': ' ',
  '\u202f': ' ',
  '\u2192': '->',
  '\u2190': '<-',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u00d7': 'x',
  '\u20b9': 'INR ',
  '\u00a3': 'GBP ',
  '\u20ac': 'EUR ',
};

export function toLatin(value: string): string {
  let out = '';
  for (const character of value) {
    const replacement = ASCII_FALLBACK[character];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    // Printable ASCII only: that is what WinAnsiEncoding and Helvetica agree on
    // for every character that is not a language-specific one.
    out += code >= 32 && code <= 126 ? character : ' ';
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

/** Print-safe text without silently deleting unsupported characters. */
export function pdfText(value: string): string {
  let out = '';
  for (const character of value) {
    const replacement = ASCII_FALLBACK[character];
    if (replacement !== undefined) {
      out += replacement;
    } else if (/\s/u.test(character)) {
      out += ' ';
    } else {
      const code = character.codePointAt(0) ?? 0;
      if (code >= 32 && code <= 126) out += character;
      else if (supportsPdfCharacter(character)) out += character;
      else
        throw new Error(
          `This PDF cannot print character U+${code.toString(16).toUpperCase()}. Remove or replace it before downloading.`,
        );
    }
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

// ASCII advance widths from Adobe's Core 14 AFM files; see fonts/README.md.
// WinAnsi uses quotesingle and grave at 39 and 96 rather than Adobe Standard's
// curly quotes. Accurate advances keep wide unbroken words inside the page.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
] as const;
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
] as const;

/** Width in points, using Helvetica AFM advances or the shaped Noto font. */
export function textWidth(value: string, size: number, bold = false): number {
  if (usesUnicode(value)) return unicodeWidth(value, size);
  const widths = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const character of value) units += widths[character.charCodeAt(0) - 32] ?? 0;
  return (units * size) / 1000;
}

/** Breaks a string onto as many lines as the given width needs. */
export function wrapText(value: string, size: number, maxWidth: number, bold = false): string[] {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  const segmenter = new Intl.Segmenter('bn', { granularity: 'grapheme' });
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== '') lines.push(current);
    current = '';
    // Split an exceptionally long URL or word only at grapheme boundaries.
    for (const part of segmenter.segment(word)) {
      const next = current + part.segment;
      if (current !== '' && textWidth(next, size, bold) > maxWidth) {
        lines.push(current);
        current = part.segment;
      } else current = next;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

/** Converts a #rrggbb colour to the three components a PDF operator wants. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1] ?? '000000', 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** A circle path made from PDF cubic Béziers (PDF has no `arc` operator). */
export function circlePath(
  centre: { readonly x: number; readonly y: number },
  radius: number,
): string {
  const { x, y } = centre;
  const k = radius * 0.5522847498;
  const n = (value: number): string => value.toFixed(2);
  return [
    `${n(x + radius)} ${n(y)} m`,
    `${n(x + radius)} ${n(y + k)} ${n(x + k)} ${n(y + radius)} ${n(x)} ${n(y + radius)} c`,
    `${n(x - k)} ${n(y + radius)} ${n(x - radius)} ${n(y + k)} ${n(x - radius)} ${n(y)} c`,
    `${n(x - radius)} ${n(y - k)} ${n(x - k)} ${n(y - radius)} ${n(x)} ${n(y - radius)} c`,
    `${n(x + k)} ${n(y - radius)} ${n(x + radius)} ${n(y - k)} ${n(x + radius)} ${n(y)} c h`,
  ].join(' ');
}

/**
 * Document builder. Content is accumulated per page and serialised once;
 * cross-reference offsets are counted in bytes, not characters, because a
 * single non-ASCII byte would otherwise shift every offset in the file.
 */
export class PdfDocument {
  readonly width: number;
  readonly height: number;
  readonly margin: number;

  private readonly pages: string[] = [];
  private current: string[] = [];
  private cursor: number;
  private readonly unicodeUnits = new Set<number>();

  constructor(
    private readonly title: string,
    orientation: Orientation = 'portrait',
    margin = 48,
  ) {
    this.width = orientation === 'landscape' ? A4_LONG : A4_SHORT;
    this.height = orientation === 'landscape' ? A4_SHORT : A4_LONG;
    this.margin = margin;
    this.cursor = this.height - margin;
  }

  /** Where the next line will be drawn, measured from the bottom. */
  get y(): number {
    return this.cursor;
  }

  get contentWidth(): number {
    return this.width - this.margin * 2;
  }

  private ensure(space: number): void {
    if (this.cursor - space < this.margin) this.addPage();
  }

  addPage(): this {
    if (this.current.length > 0) this.pages.push(this.current.join('\n'));
    this.current = [];
    this.cursor = this.height - this.margin;
    return this;
  }

  space(points = 14): this {
    this.cursor -= points;
    return this;
  }

  moveTo(y: number): this {
    this.cursor = y;
    return this;
  }

  /** Where a run of type starts, before any tracking is added. */
  xAt(value: string, size: number, options: TextOptions = {}): number {
    const tracked = this.trackedWidth(value, size, options.bold === true, options.tracking ?? 0);
    if (options.align === 'center') return (this.width - tracked) / 2;
    if (options.align === 'right') return this.width - this.margin - tracked;
    return this.margin;
  }

  private trackedWidth(value: string, size: number, bold: boolean, tracking: number): number {
    return textWidth(value, size, bold) + Math.max(0, value.length - 1) * tracking;
  }

  /** The colour operator a run of type is drawn with. */
  private colourOp(options: TextOptions): string {
    if (options.colour) return `${options.colour.map((part) => part.toFixed(3)).join(' ')} rg`;
    return `${(options.grey ?? 0).toFixed(2)} g`;
  }

  private drawUnicode(
    value: string,
    size: number,
    x: number,
    y: number,
    colour: Rgb,
    rotate = 0,
  ): void {
    for (let i = 0; i < value.length; i += 1) this.unicodeUnits.add(value.charCodeAt(i));
    this.current.push(...unicodeOperators(value, size, x, y, colour, rotate));
  }

  /**
   * One run of type on one line.
   *
   * `Tc` is the character-spacing operator, which is how a letterspaced
   * caption is set without drawing each letter by hand; it is reset in the
   * same block so it cannot leak into the next line.
   */
  private drawLine(
    line: string,
    size: number,
    bold: boolean,
    options: TextOptions,
    y: number,
  ): void {
    if (usesUnicode(line)) {
      const colour = options.colour ?? [options.grey ?? 0, options.grey ?? 0, options.grey ?? 0];
      this.drawUnicode(line, size, this.xAt(line, size, { ...options, tracking: 0 }), y, colour);
      return;
    }
    const font = bold ? '/F2' : '/F1';
    const tracking = options.tracking ?? 0;
    const trackingOp = ` ${tracking.toFixed(2)} Tc`;
    this.current.push(
      `BT ${font} ${String(size)} Tf${trackingOp} ${this.colourOp(options)} ` +
        `${this.xAt(line, size, options).toFixed(2)} ${y.toFixed(2)} Td ` +
        `(${escapePdfText(line)}) Tj ET`,
    );
  }

  text(value: string, options: TextOptions = {}): this {
    const size = options.size ?? 10;
    const bold = options.bold === true;
    const lines = wrapText(pdfText(value), size, this.contentWidth, bold);

    for (const line of lines) {
      this.ensure(size + 4);
      this.cursor -= size + 4;
      this.drawLine(line, size, bold, options, this.cursor);
    }
    return this;
  }

  /** Text in the document's accent colour, used for headings on a certificate. */
  colouredText(value: string, colour: Rgb, options: TextOptions = {}): this {
    return this.text(value, { ...options, colour });
  }

  /**
   * Type at an exact place on the page, in an exact colour, with no wrapping
   * and no cursor movement: the vocabulary a layout needs when it is drawing
   * a mark rather than writing a document.
   */
  place(value: string, x: number, y: number, options: PlaceOptions = {}): this {
    const size = options.size ?? 10;
    const printable = pdfText(value);
    if (usesUnicode(printable)) {
      const colour = options.colour ?? [options.grey ?? 0, options.grey ?? 0, options.grey ?? 0];
      this.drawUnicode(printable, size, x, y, colour, options.rotate);
      return this;
    }
    const font = options.bold === true ? '/F2' : '/F1';
    const colour = options.colour
      ? `${options.colour.map((part) => part.toFixed(3)).join(' ')} rg`
      : `${(options.grey ?? 0).toFixed(2)} g`;
    const tracking = ` ${(options.tracking ?? 0).toFixed(2)} Tc`;
    // Rotation is a transformation of the text matrix, so the angle is applied
    // inside `BT`/`ET` and cannot affect anything else on the page.
    const place =
      options.rotate === undefined
        ? `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`
        : // A rotation matrix inside `BT`/`ET`: cos, sin, -sin, cos, then the
          // origin. The angle is applied to the text matrix only, so nothing
          // else on the page can be affected by it.
          `${Math.cos(options.rotate).toFixed(4)} ${Math.sin(options.rotate).toFixed(4)} ` +
          `${(-Math.sin(options.rotate)).toFixed(4)} ${Math.cos(options.rotate).toFixed(4)} ` +
          `${x.toFixed(2)} ${y.toFixed(2)} Tm`;
    this.current.push(
      `BT ${font} ${size.toFixed(2)} Tf${tracking} ${colour} ${place} (${escapePdfText(printable)}) Tj ET`,
    );
    return this;
  }

  /** Raw content-stream operators, for the geometry modules. */
  ops(...operators: readonly string[]): this {
    this.current.push(...operators);
    return this;
  }

  /**
   * A straight line between two points, in a colour and at a weight. The
   * building block of every ornament that is not a curve.
   */
  line(
    from: { readonly x: number; readonly y: number },
    to: { readonly x: number; readonly y: number },
    options: { readonly colour?: Rgb; readonly width?: number } = {},
  ): this {
    const colour = `${(options.colour ?? [0, 0, 0]).map((part) => part.toFixed(3)).join(' ')} RG`;
    this.current.push(
      `${(options.width ?? 0.5).toFixed(2)} w ${colour} ` +
        `${from.x.toFixed(2)} ${from.y.toFixed(2)} m ${to.x.toFixed(2)} ${to.y.toFixed(2)} l S`,
    );
    return this;
  }

  /** A circle, filled or stroked, in absolute page coordinates. */
  circle(
    centre: { readonly x: number; readonly y: number },
    radius: number,
    options: { readonly fill?: Rgb; readonly stroke?: Rgb; readonly width?: number } = {},
  ): this {
    const arc = circlePath(centre, radius);
    if (options.stroke) {
      const colour = options.stroke.map((part) => part.toFixed(3)).join(' ');
      this.current.push(`${(options.width ?? 0.5).toFixed(2)} w ${colour} RG ${arc} S`);
    }
    if (options.fill) {
      const colour = options.fill.map((part) => part.toFixed(3)).join(' ');
      this.current.push(`${colour} rg ${arc} f`);
    }
    return this;
  }

  /** A filled shape described by already-formatted path operators. */
  fillPath(operators: readonly string[], colour: Rgb): this {
    const rgb = colour.map((part) => part.toFixed(3)).join(' ');
    this.current.push(`${rgb} rg ${operators.join(' ')} f`);
    return this;
  }

  rule(options: { readonly inset?: number; readonly grey?: number } = {}): this {
    const inset = options.inset ?? 0;
    const grey = options.grey ?? 0.7;
    this.ensure(8);
    this.cursor -= 8;
    this.current.push(
      `0.75 w ${grey.toFixed(2)} G ${(this.margin + inset).toFixed(2)} ${this.cursor.toFixed(2)} m ` +
        `${(this.width - this.margin - inset).toFixed(2)} ${this.cursor.toFixed(2)} l S`,
    );
    return this;
  }

  /** Key and value on one line, the value right-aligned. */
  keyValue(key: string, value: string): this {
    this.ensure(16);
    this.cursor -= 16;
    const printable = pdfText(value);
    const right = this.width - this.margin - textWidth(printable, 10, true);
    this.place(key, this.margin, this.cursor, { size: 10, grey: 0.25 });
    this.place(printable, right, this.cursor, { size: 10, bold: true });
    return this;
  }

  /** A border around the whole page, which is what makes a certificate one. */
  frame(colour: Rgb, inset = 24, lineWidth = 2): this {
    this.current.push(
      `${lineWidth.toFixed(2)} w ${colour.map((part) => part.toFixed(3)).join(' ')} RG ` +
        `${inset.toFixed(2)} ${inset.toFixed(2)} ` +
        `${(this.width - inset * 2).toFixed(2)} ${(this.height - inset * 2).toFixed(2)} re S`,
    );
    return this;
  }

  /** A filled rectangle, in absolute page coordinates. */
  rect(x: number, y: number, width: number, height: number, colour: Rgb): this {
    this.current.push(
      `${colour.map((part) => part.toFixed(3)).join(' ')} rg ` +
        `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`,
    );
    return this;
  }

  /**
   * Draws a QR matrix as vector squares, so it stays sharp at any print
   * size — a rasterised code that has been scaled is the usual reason a
   * printed QR will not scan.
   */
  qr(matrix: QrMatrix, x: number, y: number, size: number): this {
    const module = size / matrix.size;
    this.rect(x, y, size, size, [1, 1, 1]);
    for (let row = 0; row < matrix.size; row += 1) {
      for (let column = 0; column < matrix.size; column += 1) {
        if (matrix.modules[row]?.[column] !== true) continue;
        this.rect(x + column * module, y + size - (row + 1) * module, module, module, [0, 0, 0]);
      }
    }
    return this;
  }

  /** Serialises the document. */
  build(): Uint8Array {
    if (this.current.length > 0) {
      this.pages.push(this.current.join('\n'));
      this.current = [];
    }
    if (this.pages.length === 0) this.pages.push('');

    const encoder = new TextEncoder();
    const objects: string[] = [];
    const kids = this.pages.map((_, index) => `${String(5 + index * 2)} 0 R`).join(' ');
    const unicodeFontId = 5 + this.pages.length * 2;
    const unicodeFont = this.unicodeUnits.size > 0 ? ` /F3 ${String(unicodeFontId)} 0 R` : '';

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Count ${String(this.pages.length)} /Kids [${kids}] >>`);
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );

    this.pages.forEach((content, index) => {
      const contentId = 6 + index * 2;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ` +
          `${this.height.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R${unicodeFont} >> >> ` +
          `/Contents ${String(contentId)} 0 R >>`,
      );
      const stream = content.length > 0 ? content : '% empty';
      objects.push(
        `<< /Length ${String(encoder.encode(stream).length)} >>\nstream\n${stream}\nendstream`,
      );
    });

    if (this.unicodeUnits.size > 0) {
      const descendantId = unicodeFontId + 1;
      const cmapId = unicodeFontId + 2;
      objects.push(
        `<< /Type /Font /Subtype /Type0 /BaseFont /BSDC-Text /Encoding /Identity-H ` +
          `/DescendantFonts [${String(descendantId)} 0 R] /ToUnicode ${String(cmapId)} 0 R >>`,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /BSDC-Text ` +
          `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
          `/FontDescriptor << /Type /FontDescriptor /FontName /BSDC-Text /Flags 4 ` +
          `/FontBBox [0 -300 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >> ` +
          `/DW 1000 /CIDToGIDMap /Identity >>`,
      );
      const mappings = [...this.unicodeUnits]
        .sort((a, b) => a - b)
        .map((unit) => {
          const code = unit.toString(16).padStart(4, '0').toUpperCase();
          return `<${code}> <${code}>`;
        });
      const blocks: string[] = [];
      for (let i = 0; i < mappings.length; i += 100) {
        const chunk = mappings.slice(i, i + 100);
        blocks.push(`${String(chunk.length)} beginbfchar\n${chunk.join('\n')}\nendbfchar`);
      }
      const cmap = [
        '/CIDInit /ProcSet findresource begin',
        '12 dict begin',
        'begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        '/CMapName /BSDC-UCS def',
        '/CMapType 2 def',
        '1 begincodespacerange <0000> <FFFF> endcodespacerange',
        ...blocks,
        'endcmap',
        'CMapName currentdict /CMap defineresource pop',
        'end',
        'end',
      ].join('\n');
      objects.push(
        `<< /Length ${String(encoder.encode(cmap).length)} >>\nstream\n${cmap}\nendstream`,
      );
    }

    const infoId = objects.length + 1;
    objects.push(
      `<< /Title (${escapePdfText(toLatin(this.title))}) /Producer (BSDC) /Creator (BSDC corporate) >>`,
    );

    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((object, index) => {
      offsets.push(encoder.encode(body).length);
      body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
    });

    const startXref = encoder.encode(body).length;
    body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    body +=
      `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R /Info ${String(infoId)} 0 R >>\n` +
      `startxref\n${String(startXref)}\n%%EOF\n`;

    return encoder.encode(body);
  }
}

/**
 * Hands the bytes to the browser as a download. A Blob built from a typed
 * array view needs a real ArrayBuffer under the current library settings,
 * so the bytes are copied rather than passed by reference.
 */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
