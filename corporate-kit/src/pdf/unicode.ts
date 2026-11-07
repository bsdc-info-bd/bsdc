import { create, type Font, type GlyphRun } from 'fontkit';
import fontData from './fonts/NotoSansBengali.b64?raw';
import type { Rgb } from './document';

/**
 * Noto Sans Bengali, SIL OFL 1.1; see fonts/OFL.txt. The base64-encoded font is bundled
 * locally, not loaded from a third party at print time. Fontkit applies OpenType
 * shaping before the glyph outlines are drawn in the PDF.
 */
let cachedFont: Font | null = null;
function font(): Font {
  if (cachedFont) return cachedFont;
  const binary = atob(fontData);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  // Fontkit's browser build accepts Uint8Array; its Node typings name Buffer.
  const parsed = create(bytes as unknown as Parameters<typeof create>[0]);
  if (!('layout' in parsed)) throw new Error('The PDF font is not a single OpenType font.');
  cachedFont = parsed;
  return parsed;
}

export function supportsPdfCharacter(character: string): boolean {
  const cp = character.codePointAt(0) ?? 0;
  return cp === 0x200c || cp === 0x200d || font().hasGlyphForCodePoint(cp);
}

export function usesUnicode(value: string): boolean {
  return /[^\x20-\x7e]/.test(value);
}

/** Shape Bengali separately from Latin: fontkit detects the script per run. */
function runs(value: string): readonly GlyphRun[] {
  const sections: string[] = [];
  let previous = '';
  for (const character of value) {
    const cp = character.codePointAt(0) ?? 0;
    const bengali = (cp >= 0x0980 && cp <= 0x09ff) || cp === 0x200c || cp === 0x200d;
    const kind = bengali ? 'bn' : 'other';
    if (kind !== previous) sections.push('');
    const last = sections.length - 1;
    sections[last] = (sections[last] ?? '') + character;
    previous = kind;
  }
  return sections.map((section) => font().layout(section));
}

export function unicodeWidth(value: string, size: number): number {
  return (runs(value).reduce((sum, run) => sum + run.advanceWidth, 0) * size) / font().unitsPerEm;
}

/** UTF-16BE for PDF's marked-content ActualText. */
function actualText(value: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i += 1) {
    hex += value.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  }
  return hex;
}

/**
 * Print shaped glyph outlines. Quadratics are converted to PDF cubic curves;
 * positions are in font units and the PDF matrix scales them to points.
 * ActualText preserves the source text for readers that support marked content.
 */
export function unicodeOperators(
  value: string,
  size: number,
  x: number,
  y: number,
  colour: Rgb,
  rotate = 0,
): readonly string[] {
  const scale = size / font().unitsPerEm;
  const n = (number: number): string => number.toFixed(3);
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  const result = [
    `/Span << /ActualText <${actualText(value)}> >> BDC`,
    `q ${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} ${n(x)} ${n(y)} cm`,
    `${colour.map(n).join(' ')} rg`,
  ];
  let penX = 0;
  let penY = 0;
  for (const run of runs(value)) {
    run.glyphs.forEach((glyph, index) => {
      const position = run.positions[index];
      if (!position) return;
      const offsetX = penX + position.xOffset;
      const offsetY = penY + position.yOffset;
      let lastX = 0;
      let lastY = 0;
      const point = (px: number, py: number): string =>
        `${n((offsetX + px) * scale)} ${n((offsetY + py) * scale)}`;
      const path: string[] = [];
      for (const command of glyph.path.commands) {
        const a = command.args;
        if (command.command === 'moveTo' || command.command === 'lineTo') {
          lastX = a[0] ?? 0;
          lastY = a[1] ?? 0;
          path.push(`${point(lastX, lastY)} ${command.command === 'moveTo' ? 'm' : 'l'}`);
        } else if (command.command === 'quadraticCurveTo') {
          const cx = a[0] ?? 0;
          const cy = a[1] ?? 0;
          const ex = a[2] ?? 0;
          const ey = a[3] ?? 0;
          path.push(
            `${point(lastX + (2 / 3) * (cx - lastX), lastY + (2 / 3) * (cy - lastY))} ` +
              `${point(ex + (2 / 3) * (cx - ex), ey + (2 / 3) * (cy - ey))} ${point(ex, ey)} c`,
          );
          lastX = ex;
          lastY = ey;
        } else if (command.command === 'bezierCurveTo') {
          lastX = a[4] ?? 0;
          lastY = a[5] ?? 0;
          path.push(
            `${point(a[0] ?? 0, a[1] ?? 0)} ${point(a[2] ?? 0, a[3] ?? 0)} ${point(lastX, lastY)} c`,
          );
        } else if (command.command === 'closePath') {
          path.push('h');
        }
      }
      if (path.length > 0) result.push(`${path.join(' ')} f`);
      penX += position.xAdvance;
      penY += position.yAdvance;
    });
  }
  // Outlines alone are not selectable in many PDF readers, even with
  // ActualText. An invisible CID text layer with a ToUnicode map preserves
  // copy/search without changing the shaped appearance.
  const utf16 = actualText(value).slice(4);
  result.push(`BT /F3 ${n(size)} Tf 3 Tr 1 0 0 1 0 0 Tm <${utf16}> Tj 0 Tr ET`, 'Q', 'EMC');
  return result;
}
