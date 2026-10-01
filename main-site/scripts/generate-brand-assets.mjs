#!/usr/bin/env node
/**
 * BSDC brand asset pipeline.
 *
 * Source of truth: ../brand/bsdc-logo.svg (wordmark) and ../brand/bsdc-shield.svg
 * (mark). Everything below is derived at build time — no manual image work and
 * no binary assets committed to Git.
 *
 * Outputs (main-site/public):
 *   favicon.svg, favicon-{16,32,48,64,96,128}.png, apple-touch-icon.png
 *   icons/icon-{192,256,384,512,1024}.png, icons/maskable-512.png
 *   og/og-image.png (1200x630), og/og-image-square.png (1200x1200),
 *   og/twitter-card.png (1200x600)
 *   Android launcher icons for the Capacitor shell (mdpi to xxxhdpi).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '..');
const brandDir = resolve(repoRoot, 'brand');
const publicDir = resolve(appRoot, 'public');
const androidResDir = resolve(repoRoot, 'android-app/resources/android/icon');

const BRAND = {
  green900: '#081C15',
  green800: '#1B4332',
  green700: '#2D6A4F',
  green200: '#52B788',
  white: '#FFFFFF',
  name: 'Bangladesh Software Development Community',
  short: 'BSDC',
  tagline: 'The open developer community of Bangladesh',
  url: 'www.bsdc.info.bd',
};

const FAVICON_SIZES = [16, 32, 48, 64, 96, 128];
const PWA_SIZES = [192, 256, 384, 512, 1024];
const ANDROID_DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

/** Social card background with the shield mark, wordmark and tagline. */
function socialCardSvg(width, height) {
  const markSize = Math.round(Math.min(width, height) * 0.22);
  const markX = Math.round(width * 0.08);
  const markY = Math.round(height * 0.5 - markSize / 2 - height * 0.08);
  const titleSize = Math.round(width * 0.052);
  const taglineSize = Math.round(width * 0.028);
  const urlSize = Math.round(width * 0.022);
  const textX = markX;
  const titleY = markY + markSize + Math.round(height * 0.12);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.green800}"/>
      <stop offset="1" stop-color="${BRAND.green900}"/>
    </linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.green700}"/>
      <stop offset="1" stop-color="${BRAND.green800}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g transform="translate(${markX} ${markY}) scale(${markSize / 64})">
    <rect width="64" height="64" rx="16" fill="url(#mark)"/>
    <path d="M32 12 16 20v14c0 11 7.5 17 16 19 8.5-2 16-8 16-19V20L32 12z" fill="none" stroke="${BRAND.green200}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M25 32l5 5 9-10" fill="none" stroke="${BRAND.white}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="${textX}" y="${titleY}" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="${titleSize}" font-weight="800" fill="${BRAND.white}">${escapeXml(BRAND.short)} — ${escapeXml(BRAND.name)}</text>
  <text x="${textX}" y="${titleY + Math.round(taglineSize * 2)}" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="${taglineSize}" font-weight="600" fill="${BRAND.green200}">${escapeXml(BRAND.tagline)}</text>
  <text x="${textX}" y="${height - Math.round(height * 0.07)}" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="${urlSize}" font-weight="600" fill="${BRAND.white}" opacity="0.8">${escapeXml(BRAND.url)}</text>
</svg>`;
}

/** Maskable icons need the mark inside the 80% safe area. */
function maskableSvg(size) {
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BRAND.green800}"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 64})">
    <rect width="64" height="64" rx="16" fill="${BRAND.green700}"/>
    <path d="M32 12 16 20v14c0 11 7.5 17 16 19 8.5-2 16-8 16-19V20L32 12z" fill="none" stroke="${BRAND.green200}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M25 32l5 5 9-10" fill="none" stroke="${BRAND.white}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function main() {
  const shieldSvg = await readFile(resolve(brandDir, 'bsdc-shield.svg'));

  await ensureDir(publicDir);
  await ensureDir(resolve(publicDir, 'icons'));
  await ensureDir(resolve(publicDir, 'og'));
  await ensureDir(androidResDir);

  // Favicon: keep the vector original alongside raster fallbacks.
  await writeFile(resolve(publicDir, 'favicon.svg'), shieldSvg);

  for (const size of FAVICON_SIZES) {
    await sharp(shieldSvg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(resolve(publicDir, `favicon-${size}.png`));
  }

  await sharp(shieldSvg, { density: 384 })
    .resize(180, 180)
    .flatten({ background: BRAND.green800 })
    .png({ compressionLevel: 9 })
    .toFile(resolve(publicDir, 'apple-touch-icon.png'));

  for (const size of PWA_SIZES) {
    await sharp(shieldSvg, { density: 512 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(resolve(publicDir, `icons/icon-${size}.png`));
  }

  await sharp(Buffer.from(maskableSvg(512)))
    .png({ compressionLevel: 9 })
    .toFile(resolve(publicDir, 'icons/maskable-512.png'));

  const cards = [
    ['og/og-image.png', 1200, 630],
    ['og/og-image-square.png', 1200, 1200],
    ['og/twitter-card.png', 1200, 600],
  ];
  for (const [file, width, height] of cards) {
    const svg = Buffer.from(socialCardSvg(width, height));
    await sharp(svg).png({ compressionLevel: 9 }).toFile(resolve(publicDir, file));
    await sharp(svg)
      .webp({ quality: 88 })
      .toFile(resolve(publicDir, file.replace('.png', '.webp')));
  }

  for (const [density, size] of ANDROID_DENSITIES) {
    await sharp(shieldSvg, { density: 512 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(resolve(androidResDir, `ic_launcher-${density}.png`));
  }

  const generated =
    FAVICON_SIZES.length + PWA_SIZES.length + ANDROID_DENSITIES.length + cards.length * 2 + 2;
  process.stdout.write(`BSDC brand assets generated: ${generated} files\n`);
}

main().catch((error) => {
  process.stderr.write(`BSDC brand asset generation failed: ${String(error)}\n`);
  process.exitCode = 1;
});
