/**
 * BSDC — tools/generate-icons.mjs
 * Purpose : Generates every raster icon and share image from the SVG masters (PART 28.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The SVG files in assets/brand are the only icon masters; everything under public/ is
 *           generated and therefore disposable (and ignored by Git). Run `npm run icons:generate`
 *           after changing a master.
 *           @resvg/resvg-js is a build-time dev dependency only — nothing ships to the browser.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public');

/** Raster targets: output path, size, source SVG and optional padding ratio. */
const TARGETS = [
  { path: 'icons/favicon-16.png', size: 16, source: 'assets/brand/bsdc-icon.svg' },
  { path: 'icons/favicon-32.png', size: 32, source: 'assets/brand/bsdc-icon.svg' },
  { path: 'icons/apple-touch-icon.png', size: 180, source: 'assets/brand/bsdc-icon.svg' },
  { path: 'icons/android-chrome-192.png', size: 192, source: 'assets/brand/bsdc-icon.svg' },
  { path: 'icons/android-chrome-512.png', size: 512, source: 'assets/brand/bsdc-icon.svg' },
  {
    path: 'icons/maskable-512.png',
    size: 512,
    source: 'assets/brand/bsdc-icon.svg',
    padding: 0.12,
  },
  { path: 'icons/mstile-150.png', size: 150, source: 'assets/brand/bsdc-icon.svg' },
  { path: 'icons/og-default.png', size: 1200, source: 'assets/brand/og-card.svg' },
  { path: 'icons/twitter-card.png', size: 1200, source: 'assets/brand/og-card.svg' },
];

/**
 * Renders an SVG buffer to PNG at the requested edge length.
 * @param svg SVG source text
 * @param size edge length in pixels
 * @returns PNG bytes
 */
function render(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

/**
 * Builds the default social share card master if it does not exist yet.
 * @returns SVG source for the 1200x630 share card
 */
function shareCardSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B984D"/>
      <stop offset="0.5" stop-color="#0FB479"/>
      <stop offset="1" stop-color="#13B89B"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(96 168)">
    <rect width="192" height="192" rx="43" fill="#FFFFFF" opacity="0.14"/>
    <g transform="translate(48 48)">
      <path d="M40 24 L18 56 L40 88" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M52 20 h34 a6 6 0 0 1 6 6 v68 a6 6 0 0 1 -6 6 h-34 a6 6 0 0 1 -6 -6 v-68 a6 6 0 0 1 6 -6 z" fill="#FFFFFF"/>
      <path d="M48 40 L52 26 L52 54 Z" fill="#0FB479"/>
    </g>
  </g>
  <text x="336" y="278" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="72" font-weight="800" fill="#FFFFFF">BSDC</text>
  <text x="336" y="336" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="30" font-weight="600" fill="#D9F7E8">Bangladesh Software Development Community</text>
  <text x="336" y="392" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="26" font-weight="500" fill="#BFF0DA">Code. Community. Commerce. One platform.</text>
  <text x="96" y="560" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="#E8FBF2">a platform of RRC Development</text>
</svg>`;
}

const iconSvg = await readFile(resolve(root, 'assets/brand/bsdc-icon.svg'), 'utf8');
const logoLight = await readFile(resolve(root, 'assets/brand/bsdc-logo-light.svg'), 'utf8');

await mkdir(resolve(out, 'icons'), { recursive: true });
await writeFile(resolve(out, 'favicon.svg'), iconSvg);
await writeFile(resolve(out, 'logo-light.svg'), logoLight);
await writeFile(resolve(root, 'assets/brand/og-card.svg'), shareCardSvg());

for (const target of TARGETS) {
  const source =
    target.source === 'assets/brand/og-card.svg'
      ? shareCardSvg()
      : await readFile(resolve(root, target.source), 'utf8');
  let svg = source;
  if (target.padding !== undefined) {
    // Maskable icons keep the whole mark inside the safe zone (PART 28.2).
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const inset = 512 * target.padding;
    const scale = 1 - target.padding * 2;
    svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
      `<rect width="512" height="512" fill="#0B984D"/>` +
      `<g transform="translate(${inset} ${inset}) scale(${scale})">${inner}</g></svg>`;
  }
  const png = render(svg, target.size);
  await writeFile(resolve(out, target.path), png);
  process.stdout.write(`generated ${target.path} (${target.size}px)\n`);
}

process.stdout.write('icon generation complete\n');
