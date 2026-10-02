/**
 * A small, dependency-free PDF 1.4 writer.
 *
 * A reporting library would have cost several hundred kilobytes of bundle for
 * what a report actually needs: text, rules, a table and a bar chart. This
 * builds those directly, is pure (it returns bytes, never touches the DOM),
 * and is therefore testable line by line.
 *
 * The base-14 fonts a PDF reader is guaranteed to have are Latin only, so a
 * generated report is written in English. Bangla would need an embedded
 * OpenType font with its own shaping, which is a different undertaking; the
 * UI says so plainly rather than silently printing empty boxes.
 */

export interface PdfTextOptions {
  size?: number;
  bold?: boolean;
  /** 0 = black, 1 = white. */
  grey?: number;
}

export interface PdfTable {
  columns: string[];
  rows: string[][];
  /** Column widths in points; defaults to an even split. */
  widths?: number[];
}

export interface PdfBarChart {
  labels: string[];
  values: number[];
  height?: number;
}

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LINE = 14;

/** Escapes the three characters that would otherwise end a PDF string. */
export function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Drops anything the base-14 fonts cannot draw, so a stray Bangla character
 * degrades to a visible gap rather than corrupting the stream.
 */
export function toLatin(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    out += code >= 32 && code <= 255 ? character : ' ';
  }
  // Removing a glyph would otherwise leave a double space where a word was.
  return out.replace(/\s+/g, ' ').trim();
}

/** Width of a string in points, using Helvetica's average advance. */
export function textWidth(value: string, size: number, bold = false): number {
  return value.length * size * (bold ? 0.56 : 0.5);
}

/** Breaks a string onto as many lines as the given width needs. */
export function wrapText(value: string, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (textWidth(candidate, size) <= maxWidth || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Nice round axis maximum, so a bar chart has an honest ceiling. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Document builder. Content is accumulated per page, then serialised once. */
export class PdfDocument {
  private readonly pages: string[] = [];
  private current: string[] = [];
  private cursor = PAGE_HEIGHT - MARGIN;

  constructor(private readonly title: string) {}

  private ensure(space: number): void {
    if (this.cursor - space < MARGIN) this.addPage();
  }

  addPage(): void {
    if (this.current.length > 0) this.pages.push(this.current.join('\n'));
    this.current = [];
    this.cursor = PAGE_HEIGHT - MARGIN;
  }

  text(value: string, options: PdfTextOptions = {}): this {
    const size = options.size ?? 10;
    const grey = options.grey ?? 0;
    const font = options.bold === true ? '/F2' : '/F1';
    const content = toLatin(value);
    const lines = wrapText(content, size, PAGE_WIDTH - MARGIN * 2);

    for (const line of lines) {
      this.ensure(size + 4);
      this.cursor -= size + 4;
      this.current.push(
        `BT ${font} ${String(size)} Tf ${grey.toFixed(2)} g ` +
          `${String(MARGIN)} ${this.cursor.toFixed(2)} Td (${escapePdfText(line)}) Tj ET`,
      );
    }
    return this;
  }

  heading(value: string): this {
    this.space(6);
    return this.text(value, { size: 14, bold: true });
  }

  space(points = LINE): this {
    this.cursor -= points;
    return this;
  }

  rule(): this {
    this.ensure(8);
    this.cursor -= 8;
    this.current.push(
      `0.75 w 0.7 G ${String(MARGIN)} ${this.cursor.toFixed(2)} m ` +
        `${String(PAGE_WIDTH - MARGIN)} ${this.cursor.toFixed(2)} l S`,
    );
    return this;
  }

  /** Key and value on one line, the value right-aligned. */
  keyValue(key: string, value: string): this {
    this.ensure(16);
    this.cursor -= 16;
    const right = PAGE_WIDTH - MARGIN - textWidth(toLatin(value), 10, true);
    this.current.push(
      `BT /F1 10 Tf 0.25 g ${String(MARGIN)} ${this.cursor.toFixed(2)} Td ` +
        `(${escapePdfText(toLatin(key))}) Tj ET`,
      `BT /F2 10 Tf 0 g ${right.toFixed(2)} ${this.cursor.toFixed(2)} Td ` +
        `(${escapePdfText(toLatin(value))}) Tj ET`,
    );
    return this;
  }

  table(table: PdfTable): this {
    const available = PAGE_WIDTH - MARGIN * 2;
    const widths =
      table.widths ?? table.columns.map(() => available / Math.max(1, table.columns.length));

    const row = (cells: string[], bold: boolean): void => {
      this.ensure(16);
      this.cursor -= 16;
      let x = MARGIN;
      cells.forEach((cell, index) => {
        const width = widths[index] ?? 0;
        this.current.push(
          `BT ${bold ? '/F2' : '/F1'} 9 Tf 0 g ${x.toFixed(2)} ${this.cursor.toFixed(2)} Td ` +
            `(${escapePdfText(toLatin(cell))}) Tj ET`,
        );
        x += width;
      });
    };

    row(table.columns, true);
    this.rule();
    for (const line of table.rows) row(line, false);
    return this;
  }

  /** A plain bar chart: no gridlines, no gradient, just the numbers. */
  barChart(chart: PdfBarChart): this {
    const height = chart.height ?? 120;
    const width = PAGE_WIDTH - MARGIN * 2;
    const max = niceMax(Math.max(0, ...chart.values));
    const count = Math.max(1, chart.values.length);
    const slot = width / count;
    const barWidth = Math.max(1, slot * 0.7);

    this.ensure(height + 24);
    this.cursor -= height + 24;
    const base = this.cursor + 16;

    chart.values.forEach((value, index) => {
      const barHeight = max > 0 ? (Math.max(0, value) / max) * height : 0;
      const x = MARGIN + index * slot + (slot - barWidth) / 2;
      this.current.push(
        `0.15 0.45 0.25 rg ${x.toFixed(2)} ${base.toFixed(2)} ` +
          `${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re f`,
      );
    });

    this.current.push(
      `0.75 w 0.7 G ${String(MARGIN)} ${base.toFixed(2)} m ` +
        `${String(PAGE_WIDTH - MARGIN)} ${base.toFixed(2)} l S`,
    );

    // Only the first and last label: a dense axis is unreadable at this size.
    const first = chart.labels[0];
    const last = chart.labels[chart.labels.length - 1];
    if (first !== undefined) {
      this.current.push(
        `BT /F1 8 Tf 0.4 g ${String(MARGIN)} ${(base - 11).toFixed(2)} Td ` +
          `(${escapePdfText(toLatin(first))}) Tj ET`,
      );
    }
    if (last !== undefined && chart.labels.length > 1) {
      const x = PAGE_WIDTH - MARGIN - textWidth(toLatin(last), 8);
      this.current.push(
        `BT /F1 8 Tf 0.4 g ${x.toFixed(2)} ${(base - 11).toFixed(2)} Td ` +
          `(${escapePdfText(toLatin(last))}) Tj ET`,
      );
    }
    return this;
  }

  /** Serialises the document. Offsets are counted in bytes, not characters. */
  build(): Uint8Array {
    if (this.current.length > 0) {
      this.pages.push(this.current.join('\n'));
      this.current = [];
    }
    if (this.pages.length === 0) this.pages.push('');

    const encoder = new TextEncoder();
    const objects: string[] = [];
    const pageCount = this.pages.length;

    // 1 catalogue, 2 pages, 3 font regular, 4 font bold, then page/content pairs.
    const kids = this.pages.map((_, index) => `${String(5 + index * 2)} 0 R`).join(' ');

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Count ${String(pageCount)} /Kids [${kids}] >>`);
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );

    this.pages.forEach((content, index) => {
      const contentId = 6 + index * 2;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ` +
          `${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
          `/Contents ${String(contentId)} 0 R >>`,
      );
      const stream = content.length > 0 ? content : '% empty';
      objects.push(
        `<< /Length ${String(encoder.encode(stream).length)} >>\nstream\n${stream}\nendstream`,
      );
    });

    const infoId = objects.length + 1;
    objects.push(
      `<< /Title (${escapePdfText(toLatin(this.title))}) /Producer (BSDC) ` +
        `/Creator (BSDC admin) >>`,
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
      `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R ` +
      `/Info ${String(infoId)} 0 R >>\nstartxref\n${String(startXref)}\n%%EOF\n`;

    return encoder.encode(body);
  }
}
