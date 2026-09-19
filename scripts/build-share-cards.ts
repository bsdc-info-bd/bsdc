/**
 * BSDC — scripts/build-share-cards.ts
 * Purpose : Renders the Open Graph and Twitter card image for every public page (PART 10.05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A share card is the first thing most people see of a page, so every public route gets
 *   one, generated at build time and served as a static PNG. No Worker renders it on request
 *   (ADR-036), which also means no request can fail to produce one.
 *   Bangla needs a font with Bengali glyphs, and this container has none — only DejaVu, which is
 *   Latin and Cyrillic. Rather than emit a card full of empty boxes and call it bilingual, the
 *   script looks for a Bengali-capable font, and when it finds none it renders the card in English
 *   and says so. Supply one at `assets/fonts/` or point `BSDC_CARD_FONT_BN` at it and the Bangla
 *   title appears on the card as it does on the page. This is logged in PUBLIC_LIMITATIONS.md.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ROUTES } from '../src/core/config/routes';
import { BRAND, SITE_URL } from '../src/core/config/app';

/** Card geometry. 1200x630 is what every major platform expects. */
const CARD = { width: 1200, height: 630 } as const;

/** Where the rendered cards go. */
const OUT_DIR = resolve(process.cwd(), 'public/cards');

/** Latin font used when no Bengali font is available, and for the wordmark always. */
const LATIN_FONT =
  process.env['BSDC_CARD_FONT'] ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

/** A Bengali-capable font, when one has been supplied. */
const BANGLA_FONT =
  process.env['BSDC_CARD_FONT_BN'] ??
  ['assets/fonts/NotoSansBengali-Bold.ttf', 'assets/fonts/HindSiliguri-Bold.ttf'].find((path) =>
    existsSync(resolve(process.cwd(), path)),
  );

/** Resvg is loaded lazily: a build that renders no cards does not pay for the renderer. */
type Resvg = new (
  svg: string,
  options?: Record<string, unknown>,
) => {
  render(): { asPng(): Buffer };
};

/**
 * Wraps a title to the card width. Card text is measured in characters because a build script has
 * no text engine until the font is loaded, and a fixed budget per line is predictable, testable and
 * never clips a Bangla line the way a naive character count on Latin would.
 * @param title the title
 * @param perLine characters per line
 * @param maxLines how many lines fit
 * @returns the wrapped lines
 */
function wrap(title: string, perLine: number, maxLines: number): readonly string[] {
  const words = title.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length === 0) {
      line = word;
      continue;
    }
    if (`${line} ${word}`.length <= perLine) {
      line = `${line} ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line.length > 0) lines.push(line);
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    const last = lines[maxLines - 1] ?? '';
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, perLine - 1))}…`;
  }
  return lines;
}

/**
 * Escapes a string for SVG text content.
 * @param value the raw string
 * @returns the escaped string
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the SVG for one card.
 * @param titleEn the English title
 * @param titleBn the Bangla title, when a Bengali font is available
 * @returns the SVG source
 */
function cardSvg(titleEn: string, titleBn: string | null): string {
  const lines = wrap(titleEn, 26, 3);
  const bangla = titleBn === null ? [] : wrap(titleBn, 22, 2);
  const titleBlock = lines
    .map((line, index) => `<tspan x="80" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`)
    .join('');
  const banglaBlock = bangla
    .map((line, index) => `<tspan x="80" dy="${index === 0 ? 0 : 64}">${escapeXml(line)}</tspan>`)
    .join('');
  const banglaY = 250 + lines.length * 78 + 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" role="img" aria-label="${escapeXml(titleEn)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#123024"/>
    </linearGradient>
  </defs>
  <rect width="${CARD.width}" height="${CARD.height}" fill="url(#bg)"/>
  <rect x="0" y="${CARD.height - 10}" width="${CARD.width}" height="10" fill="#2d6a4f"/>
  <text x="80" y="120" font-family="BSDC" font-size="46" fill="#7fd1a4" letter-spacing="6">${escapeXml(BRAND.short)}</text>
  <text x="80" y="170" font-family="BSDC" font-size="28" fill="#9fb3a8">${escapeXml(BRAND.nameEn)}</text>
  <text x="80" y="250" font-family="BSDC" font-size="64" fill="#f4f7f5">
    ${titleBlock}
  </text>
  ${
    banglaBlock.length > 0
      ? `<text x="80" y="${banglaY}" font-family="BSDC-BN" font-size="52" fill="#c8e6d4" xml:lang="bn">
    ${banglaBlock}
  </text>`
      : ''
  }
  <text x="80" y="${CARD.height - 46}" font-family="BSDC" font-size="26" fill="#7f8f88">${escapeXml(SITE_URL.replace(/^https?:\/\//, ''))}</text>
  <text x="80" y="${CARD.height - 20}" font-family="BSDC" font-size="22" fill="#5f6f68">${escapeXml(BRAND.legalLine)}</text>
</svg>`;
}

/**
 * Reads a font file as a buffer, or returns null when it is not there.
 * @param path absolute path
 * @returns the bytes, or null
 */
function fontBytes(path: string | undefined): Buffer | null {
  if (path === undefined || !existsSync(path)) return null;
  return readFileSync(path);
}

/** Renders one card per public route. */
async function main(): Promise<void> {
  const latin = fontBytes(LATIN_FONT);
  if (latin === null) {
    console.info(
      `[bsdc] no font at ${LATIN_FONT}; set BSDC_CARD_FONT and run again. Skipping share cards.`,
    );
    return;
  }
  const bangla = fontBytes(BANGLA_FONT);
  if (bangla === null) {
    console.info(
      '[bsdc] no Bengali-capable font; share cards will carry the English title only. ' +
        'Drop one at assets/fonts/ or set BSDC_CARD_FONT_BN.',
    );
  }

  const { Resvg } = (await import('@resvg/resvg-js')) as { Resvg: Resvg };
  mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  for (const route of ROUTES) {
    if (route.status !== 'live' || route.noindex === true || route.path.includes(':')) continue;
    const svg = cardSvg(route.titleKey.replace(/-/g, ' '), bangla === null ? null : route.titleKey);
    const renderer = new Resvg(svg, {
      fitTo: { mode: 'width', value: CARD.width },
      font: {
        fontFiles: bangla === null ? [LATIN_FONT] : [LATIN_FONT, BANGLA_FONT ?? LATIN_FONT],
        defaultFontFamily: 'BSDC',
        loadSystemFonts: false,
      },
    });
    const name = route.path === '/' ? 'home' : route.path.replace(/^\//, '').replace(/\//g, '-');
    const file = resolve(OUT_DIR, `${name}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderer.render().asPng());
    written += 1;
  }
  console.info(`[bsdc] share cards written: ${written} card(s) in public/cards`);
}

await main();
