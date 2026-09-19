#!/usr/bin/env node
/**
 * BSDC — tools/generate-sprite.mjs
 * Purpose : Rebuilds the reaction section of the UI sprite from the SVG masters and publishes it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Reaction glyphs must render identically in the app, in an exported PDF and in an
 *           e-mail, which rules out a JavaScript-only icon component. The masters in
 *           assets/icons/reactions are the source of truth; this script folds them into
 *           assets/icons/sprite.svg as <symbol> elements and publishes the result to
 *           public/icons/sprite.svg so <use href="/icons/sprite.svg#reaction-like"> resolves.
 *           Brand marks and UI glyphs already in the sprite are preserved untouched.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reactionsDir = resolve(root, 'assets/icons/reactions');
const spritePath = resolve(root, 'assets/icons/sprite.svg');
const publicPath = resolve(root, 'public/icons/sprite.svg');

/**
 * Extracts the inner drawing content of an SVG master.
 * @param source raw SVG text
 * @returns the content between the opening and closing <svg> tags
 */
function innerSvg(source) {
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const opened = cleaned.indexOf('<svg');
  const tagEnd = cleaned.indexOf('>', opened);
  const closed = cleaned.lastIndexOf('</svg>');
  if (opened < 0 || tagEnd < 0 || closed < 0) {
    return '';
  }
  return cleaned.slice(tagEnd + 1, closed).trim();
}

/**
 * Extracts the viewBox of an SVG master.
 * @param source raw SVG text
 * @returns the viewBox value, defaulting to a 24x24 box
 */
function viewBox(source) {
  const match = /viewBox="([^"]+)"/.exec(source);
  return match?.[1] ?? '0 0 24 24';
}

/**
 * Extracts the glyph's intrinsic tint from its inline style.
 * @param source raw SVG text
 * @returns the colour, or currentColor when none is declared
 */
function tint(source) {
  const match = /color:\s*(#[0-9a-fA-F]{3,8})/.exec(source);
  return match?.[1] ?? 'currentColor';
}

/**
 * Rebuilds the sprite.
 * @returns the number of reaction symbols written
 */
async function build() {
  const files = (await readdir(reactionsDir))
    .filter((file) => file.startsWith('reaction-') && file.endsWith('.svg'))
    .sort();

  const symbols = [];
  for (const file of files) {
    const source = await readFile(resolve(reactionsDir, file), 'utf8');
    const id = basename(file, '.svg');
    const content = innerSvg(source);
    if (content.length === 0) {
      continue;
    }
    symbols.push(
      `  <symbol id="${id}" viewBox="${viewBox(source)}">\n    <g style="color:${tint(source)}">${content}</g>\n  </symbol>`,
    );
  }

  const existing = await readFile(spritePath, 'utf8');
  const stripped = existing.replace(/\n {2}<symbol id="reaction-[\s\S]*?<\/symbol>/g, '');
  const closed = stripped.lastIndexOf('</svg>');
  if (closed < 0) {
    throw new Error('The sprite master has no closing </svg> tag.');
  }

  const rebuilt = `${stripped.slice(0, closed)}${symbols.join('\n')}\n</svg>\n`;
  await writeFile(spritePath, rebuilt, 'utf8');

  await mkdir(dirname(publicPath), { recursive: true });
  await writeFile(publicPath, rebuilt, 'utf8');

  return symbols.length;
}

const count = await build();
process.stdout.write(`[bsdc] sprite rebuilt: ${count} reaction symbols published.\n`);
