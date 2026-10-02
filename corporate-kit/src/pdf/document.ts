import type { QrMatrix } from './qr';

/**
 * A small, dependency-free PDF 1.4 writer for printed corporate documents.
 *
 * A certificate and a notice need text, rules, a frame, a block of body
 * copy and a QR code — not a layout engine. This draws those directly, is
 * pure (it returns bytes and never touches the DOM) and is therefore
 * testable line by line.
 *
 * The base-14 fonts a reader is guaranteed to have are Latin only, so a
 * printed document is written in English and says so; Bangla would need an
 * embedded OpenType font with its own shaping, which is a different
 * undertaking from this one.
 */

export type Orientation = 'portrait' | 'landscape';

export type TextOptions = {
  readonly size?: number;
  readonly bold?: boolean;
  /** 0 is black, 1 is white. */
  readonly grey?: number;
  readonly align?: 'left' | 'center' | 'right';
};

export type Rgb = readonly [number, number, number];

const A4_SHORT = 595.28;
const A4_LONG = 841.89;

/** Escapes the three characters that would otherwise end a PDF string. */
export function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Replaces anything the base-14 fonts cannot draw with a space, so a stray
 * Bangla character degrades to a visible gap instead of corrupting the
 * stream — and deleting it would silently fuse two words together.
 */
export function toLatin(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    out += code >= 32 && code <= 255 ? character : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Width of a string in points, using Helvetica's average advance. */
export function textWidth(value: string, size: number, bold = false): number {
  return value.length * size * (bold ? 0.56 : 0.5);
}

/** Breaks a string onto as many lines as the given width needs. */
export function wrapText(value: string, size: number, maxWidth: number, bold = false): string[] {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (textWidth(candidate, size, bold) <= maxWidth || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Converts a #rrggbb colour to the three components a PDF operator wants. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1] ?? '000000', 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
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

  private xFor(line: string, size: number, bold: boolean, align: TextOptions['align']): number {
    if (align === 'center') return (this.width - textWidth(line, size, bold)) / 2;
    if (align === 'right') return this.width - this.margin - textWidth(line, size, bold);
    return this.margin;
  }

  text(value: string, options: TextOptions = {}): this {
    const size = options.size ?? 10;
    const grey = options.grey ?? 0;
    const bold = options.bold === true;
    const font = bold ? '/F2' : '/F1';
    const lines = wrapText(toLatin(value), size, this.contentWidth, bold);

    for (const line of lines) {
      this.ensure(size + 4);
      this.cursor -= size + 4;
      this.current.push(
        `BT ${font} ${String(size)} Tf ${grey.toFixed(2)} g ` +
          `${this.xFor(line, size, bold, options.align).toFixed(2)} ${this.cursor.toFixed(2)} Td ` +
          `(${escapePdfText(line)}) Tj ET`,
      );
    }
    return this;
  }

  /** Text in the document's accent colour, used for headings on a certificate. */
  colouredText(value: string, colour: Rgb, options: TextOptions = {}): this {
    const size = options.size ?? 10;
    const bold = options.bold === true;
    const line = toLatin(value);
    this.ensure(size + 6);
    this.cursor -= size + 6;
    this.current.push(
      `BT ${bold ? '/F2' : '/F1'} ${String(size)} Tf ` +
        `${colour.map((part) => part.toFixed(3)).join(' ')} rg ` +
        `${this.xFor(line, size, bold, options.align).toFixed(2)} ${this.cursor.toFixed(2)} Td ` +
        `(${escapePdfText(line)}) Tj ET`,
    );
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
    const right = this.width - this.margin - textWidth(toLatin(value), 10, true);
    this.current.push(
      `BT /F1 10 Tf 0.25 g ${this.margin.toFixed(2)} ${this.cursor.toFixed(2)} Td ` +
        `(${escapePdfText(toLatin(key))}) Tj ET`,
      `BT /F2 10 Tf 0 g ${right.toFixed(2)} ${this.cursor.toFixed(2)} Td ` +
        `(${escapePdfText(toLatin(value))}) Tj ET`,
    );
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
        this.rect(
          x + column * module,
          y + size - (row + 1) * module,
          module + 0.2,
          module + 0.2,
          [0, 0, 0],
        );
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
          `${this.height.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
          `/Contents ${String(contentId)} 0 R >>`,
      );
      const stream = content.length > 0 ? content : '% empty';
      objects.push(
        `<< /Length ${String(encoder.encode(stream).length)} >>\nstream\n${stream}\nendstream`,
      );
    });

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
