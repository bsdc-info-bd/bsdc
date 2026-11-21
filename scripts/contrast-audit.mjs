#!/usr/bin/env node
/**
 * The contrast floor, as a program.
 *
 * WCAG 2.2 AA (1.4.3) asks for 4.5:1 between text and the surface it sits on,
 * and 3:1 where the text is large. That is a fact about two colours, so it is
 * a fact a machine can settle — and the only way to settle it for a whole
 * interface at once is to read the tokens and every class string that uses
 * them, because a colour in this codebase is a CSS custom property that swaps
 * when the theme swaps. A ratio measured in the light theme says nothing about
 * the dark one: `--bsdc-green-700` is #2d6a4f under light and #74c69d under
 * dark, so white on it is 6.4:1 on one theme and 2.0:1 on the other.
 *
 *   node scripts/contrast-audit.mjs             # table, exit 1 on any failure
 *   node scripts/contrast-audit.mjs --json      # machine-readable
 *   node scripts/contrast-audit.mjs --strict    # gate the advisory tier too
 *
 * What it reads:
 *   1. the token blocks in `main-site/src/styles/base.css`, per theme;
 *   2. the Tailwind colour map in `main-site/tailwind.config.ts`, so a token is
 *      looked up by the name a component writes (`text-blue-text`, not
 *      `--bsdc-blue-text`);
 *   3. every string literal of Tailwind classes in the main-site TSX sources.
 *
 * What it pairs, per class string:
 *   - each foreground utility with the background utility written beside it,
 *     nearest neighbour first, so `bg-green-700 text-white` and
 *     `text-white bg-green-700` both measure;
 *   - `hover:` and `active:` fills against the resting text they paint behind,
 *     because a button whose label disappears on hover is still broken;
 *   - `dark:` overrides in the dark theme only, where a `dark:` utility for the
 *     same property supersedes the plain one instead of sitting beside it.
 *
 * Two tiers, because certainty differs:
 *   CERTAIN  — foreground and opaque background named in the same class string.
 *              The component declares the pair, so the measurement is the
 *              measurement. These gate.
 *   ADVISORY — a foreground with no background of its own in the string, or a
 *              translucent fill whose backdrop is unknown. A lightbox captions
 *              a photograph; a badge sits on an image; pairing those against the
 *              page background reports a number no user ever sees. These are
 *              listed for a human and gated only under `--strict`.
 *
 * Alpha is composited, not ignored: `bg-green-950/55` is 55% of that colour over
 * whatever is behind it, and `text-white/75` likewise.
 *
 * Large text (>= 24px, or >= 18.66px at weight 700+) gets the 3:1 floor the spec
 * allows, judged from the `text-*` size utility in the same string. The scale is
 * clamped, so the size used is the low end of the clamp — the narrow-phone end,
 * where a heading is likeliest to lose the exemption. Unsized text takes the
 * strict floor, because a gate that guesses generously passes itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'main-site');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const STRICT = args.includes('--strict');

const read = (p) => readFileSync(p, 'utf8');

/* ------------------------------------------------------------------ *
 * Colour maths
 * ------------------------------------------------------------------ */

function parseHex(input) {
  let h = String(input).trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/i.test(h) || /^[0-9a-f]{8}$/i.test(h)) {
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  return null;
}

const toHex = (rgb) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.max(0, Math.min(1, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** WCAG 2.2 relative luminance. */
function luminance([r, g, b]) {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(foreground, background) {
  const a = parseHex(foreground);
  const b = parseHex(background);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color/NN` in Tailwind is an alpha blend of the colour over what is behind it. */
function composite(foreground, background, alpha) {
  const a = parseHex(foreground);
  const b = parseHex(background);
  if (!a || !b) return foreground;
  return toHex(a.map((c, i) => c * alpha + b[i] * (1 - alpha)));
}

/* ------------------------------------------------------------------ *
 * 1. Tokens, per theme
 * ------------------------------------------------------------------ */

const baseCss = read(join(site, 'src/styles/base.css'));

/** The balanced `{ ... }` body that follows `marker`. */
function bodyAfter(base, marker) {
  const from = base.indexOf(marker);
  if (from === -1) return null;
  const open = base.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < base.length; i++) {
    if (base[i] === '{') depth++;
    else if (base[i] === '}') {
      depth--;
      if (depth === 0) return base.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * Every colour token declared directly inside a theme block. A token may point
 * at another token — `--bsdc-ring: var(--bsdc-green-500)` — so one hop is
 * followed, which is as deep as this palette goes.
 */
function tokensFor(marker) {
  const raw = bodyAfter(baseCss, marker);
  if (!raw) throw new Error(`no ${marker} block in base.css`);
  const body = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const hexes = new Map();
  for (const [, name, value] of body.matchAll(
    /--(bsdc-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    hexes.set(name, value);
  }
  for (const [, name, target] of body.matchAll(
    /--(bsdc-[a-z0-9-]+)\s*:\s*var\(--(bsdc-[a-z0-9-]+)\)\s*;/g,
  )) {
    const value = hexes.get(target);
    if (value && !hexes.has(name)) hexes.set(name, value);
  }
  return hexes;
}

const lightTokens = tokensFor(':root,');
// CSS custom properties cascade: a token the dark block does not redefine —
// --bsdc-chat-outgoing, --bsdc-scrim — keeps the value declared on :root. A
// theme map holding only the block's own declarations would report those as
// missing and fail a palette that is in fact correct.
const darkTokens = new Map(lightTokens);
for (const [name, value] of tokensFor("[data-theme='dark']")) darkTokens.set(name, value);

const themes = { light: lightTokens, dark: darkTokens };

/* ------------------------------------------------------------------ *
 * 2. Tailwind colour name -> token
 * ------------------------------------------------------------------ */

/**
 * The palette's home, in whichever shape the config file currently keeps it.
 * Tried in order, because a script that silently finds nothing here would go on
 * to resolve every colour against Tailwind's stock palette and report a clean
 * pass about colours the application never paints; MINIMUM_TOKENS below is what
 * turns that silence into a loud failure.
 */
const tailwindConfig = read(join(site, 'tailwind.config.ts'));
/**
 * Comments are stripped before the block is split. A note in this config reads
 * "White on --bsdc-green-700 is 6.4:1 in light and 2.0:1 in dark, because the
 * green ramp inverts with the theme", and the comma in that sentence is at
 * bracket depth zero: splitting first would cut `primary: token('primary')`
 * away from its key and silently drop the colour from the map — reporting every
 * `bg-primary` in the codebase as a class that names nothing.
 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const colorsBlock = stripComments(
  bodyAfter(tailwindConfig, 'const themeColors =') ?? bodyAfter(tailwindConfig, 'colors:'),
);
if (!colorsBlock) throw new Error('no colors block in tailwind.config.ts');

/**
 * Split on commas that are not nested inside a bracket.
 *
 * Braces, square brackets and parentheses all count: a font-size entry is
 * `['clamp(0.6875rem, 0.66rem + 0.14vw, 0.75rem)', { lineHeight: '1.45' }]`,
 * and splitting only on brace depth cuts that entry at the comma inside
 * `clamp()`. The pieces still parse, the regexes still run, and the map comes
 * back empty — which for this script means every size silently loses its
 * large-text exemption, the one failure mode that makes a gate look stricter
 * than it is while measuring nothing.
 */
function splitTopLevel(src) {
  const parts = [];
  const OPEN = { '{': '}', '[': ']', '(': ')' };
  const CLOSE = { '}': '{', ']': '[', ')': '(' };
  const stack = [];
  let current = '';
  for (const ch of src) {
    if (OPEN[ch]) stack.push(ch);
    else if (CLOSE[ch]) stack.pop();
    if (ch === ',' && stack.length === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Flatten the colour map to the names Tailwind generates: `green: { 700: … }`
 * is `bg-green-700`, and a `DEFAULT` key takes its group's own name. Keys here
 * are bare as often as they are quoted, and both spellings are valid, so a
 * parser matching only one silently drops tokens — and a gate that resolves
 * `bg-green-700` to Tailwind's stock palette measures colours this application
 * never paints, which reads as a pass and means nothing.
 */
const KEY = `'?([A-Za-z0-9-]+)'?`;
/**
 * A leaf colour is either the token written directly — `'var(--bsdc-bg)'` — or
 * the helper that wraps it for alpha, `token('bg')`. Both spellings must be
 * understood, because a parser that recognises only one resolves every name to
 * Tailwind's stock palette and then measures, and passes, colours this
 * application never paints.
 */
function tokenNameOf(value) {
  const direct = /'var\(--([a-z0-9-]+)\)'/.exec(value);
  if (direct) return direct[1];
  const wrapped = /\btoken\('([a-z0-9-]+)'\)/.exec(value);
  return wrapped ? `bsdc-${wrapped[1]}` : null;
}

function flattenColors(block, prefix, out) {
  for (const entry of splitTopLevel(block)) {
    const m = new RegExp(`^\\s*${KEY}\\s*:\\s*([\\s\\S]*)$`).exec(entry);
    if (!m) continue;
    const [, name, value] = m;
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      flattenColors(
        trimmed.slice(1, trimmed.lastIndexOf('}')),
        prefix ? `${prefix}-${name}` : name,
        out,
      );
      continue;
    }
    const varName = tokenNameOf(trimmed);
    if (!varName) continue;
    const full = prefix ? (name === 'DEFAULT' ? prefix : `${prefix}-${name}`) : name;
    out.set(full, varName);
  }
  return out;
}

const tokenOfColorName = flattenColors(colorsBlock, '', new Map());

/**
 * The gate checks its own sight. If the theme file changed shape hard enough
 * that almost nothing resolves, that is a broken audit, not a clean one, and a
 * clean-looking audit is precisely how a broken one does damage.
 */
const MINIMUM_TOKENS = 20;
if (tokenOfColorName.size < MINIMUM_TOKENS) {
  console.error(
    `contrast audit: only ${tokenOfColorName.size} colour name(s) resolved from ` +
      `main-site/tailwind.config.ts (expected at least ${MINIMUM_TOKENS}). The theme's shape has ` +
      `changed underneath this script; fix the parser before believing any result it prints.`,
  );
  process.exit(2);
}
if (!themes.light.size || !themes.dark.size) {
  console.error(
    'contrast audit: no colour tokens parsed from base.css — refusing to report a pass.',
  );
  process.exit(2);
}

const twColors = (() => {
  try {
    return createRequire(join(site, 'package.json'))('tailwindcss/colors.js');
  } catch {
    return {};
  }
})();

/** Resolve a Tailwind colour name to a hex for one theme, saying if it is on-token. */
function resolveColor(name, theme) {
  if (name === 'white') return { hex: '#ffffff', onToken: true };
  if (name === 'black') return { hex: '#000000', onToken: true };
  const token = tokenOfColorName.get(name);
  if (token) {
    const hex = themes[theme].get(token);
    return hex ? { hex, onToken: true, token } : null;
  }
  const off = defaultPalette(name);
  return off ? { hex: off, onToken: false } : null;
}

/** `red-500` -> Tailwind's red[500]; a name this config defines finds nothing here. */
function defaultPalette(name) {
  const m = /^([a-z]+)-(\d{2,3})$/.exec(name);
  if (!m) return null;
  const family = twColors[m[1]];
  if (!family || typeof family !== 'object') return null;
  const value = family[m[2]];
  return typeof value === 'string' && value.startsWith('#') ? value : null;
}

/* ------------------------------------------------------------------ *
 * 3. Font sizes, for the large-text exemption
 * ------------------------------------------------------------------ */

const minPxOfSize = new Map();
{
  const block = stripComments(bodyAfter(tailwindConfig, 'fontSize:'));
  if (block) {
    for (const entry of splitTopLevel(block)) {
      const m = /^\s*'?([A-Za-z0-9-]+)'?\s*:\s*\[\s*'([^']+)'/.exec(entry);
      if (!m) continue;
      const px = [...m[2].matchAll(/(\d*\.?\d+)rem/g)].map(([, n]) => Number(n) * 16);
      if (px.length) minPxOfSize.set(m[1], Math.min(...px));
    }
  }
}

/* ------------------------------------------------------------------ *
 * 4. The scan
 * ------------------------------------------------------------------ */

function* tsxFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      yield* tsxFiles(full);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      yield full;
    }
  }
}

const CLASS_TOKEN =
  /(?:\b((?:[a-z-]+:)*)(bg|text|fill)-([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(\d{1,3}))?\b)/g;
/** Variants that change who sees the colour, and so are worth acting on. */
const STATE_VARIANTS = new Set(['hover', 'active', 'focus', 'focus-visible', 'group-hover']);

function stringLiterals(source) {
  const out = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (index) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const re = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/g;
  for (const m of source.matchAll(re)) {
    const template = m[3];
    const body = m[1] ?? m[2] ?? template ?? '';
    if (template !== undefined && template.includes('${')) {
      // A template literal is not one element's class string. It is a shared
      // prefix plus whichever branch of `cond ? 'A' : 'B'` applies, and the two
      // branches never paint at the same time. Measuring `bg-primary` from one
      // branch against `text-text` from the other reported twelve defects that
      // do not exist, which is the fastest way to make a gate get ignored.
      const cut = template.indexOf('${');
      const prefix = template.slice(0, cut);
      if (prefix.trim().length > 2) out.push({ body: prefix, line: lineOf(m.index) });
      for (const branch of template.matchAll(/'([^'\n]*)"|"([^"\n]*)"/g)) {
        const inner = branch[1] ?? branch[2] ?? '';
        if (inner.trim().length > 2)
          out.push({ body: `${prefix} ${inner}`, line: lineOf(m.index) });
      }
      continue;
    }
    if (body.length > 2) out.push({ body, line: lineOf(m.index) });
  }
  return out;
}

/**
 * One class string is one element's whole style, and this codebase writes an
 * element's classes in a single literal, so a conditional pair like
 * `selected ? 'bg-green-700 text-white' : 'bg-surface text-muted'` stays two
 * independent measurements. Merging the two would test white on surface and
 * report a defect that does not exist.
 */
function parseClasses(literal) {
  const tokens = [];
  for (const m of literal.matchAll(CLASS_TOKEN)) {
    const [, rawVariants, property, name, alpha] = m;
    const variants = (rawVariants ?? '').split(':').filter(Boolean);
    if (variants.some((v) => v !== 'dark' && !STATE_VARIANTS.has(v))) continue;
    tokens.push({
      index: tokens.length,
      property,
      name,
      alpha: alpha === undefined ? 1 : Number(alpha) / 100,
      dark: variants.includes('dark'),
      state: variants.filter((v) => STATE_VARIANTS.has(v)).join('+'),
    });
  }
  return tokens;
}

/** The background utility written closest to this text utility, tie going to the earlier. */
function nearest(list, index) {
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => Math.abs(a.index - index) - Math.abs(b.index - index) || a.index - b.index,
  )[0];
}

/**
 * Which utility of a property actually paints, for one theme.
 *
 * `dark:` is an override, not an addition: a component writing
 * `text-green-800 dark:text-green-100` paints the second colour and nothing
 * else in the dark theme, so measuring the first against a dark surface would
 * report a pairing no user sees.
 */
function painting(list, theme) {
  if (!list.length) return [];
  if (theme === 'dark') {
    const overridden = list.filter((t) => t.dark);
    if (overridden.length) return overridden;
  }
  return list.filter((t) => !t.dark);
}

/**
 * Colour utilities that name no colour at all.
 *
 * `text-foreground`, `bg-card`, `text-primary-foreground` are the vocabulary of
 * a different theme file. Tailwind emits no rule for them, so the class is
 * inert and the element inherits — which is invisible in a screenshot review
 * and indistinguishable from "the design is subtle". `bg-primary/10` sat in
 * three components for exactly that reason until a token named `primary`
 * existed. Anything the theme does not define is a bug, not a style.
 */
const NOT_A_COLOR = new Set([
  // text-<size> and text-<alignment>
  ...minPxOfSize.keys(),
  'left',
  'right',
  'center',
  'justify',
  'start',
  'end',
  'top',
  'bottom',
  'baseline',
  'middle',
  'nowrap',
  'wrap',
  'wrap-reverse',
  // bg-<position|repeat|size|image>
  'cover',
  'contain',
  'auto',
  'none',
  'gradient-to-t',
  'gradient-to-tr',
  'gradient-to-r',
  'gradient-to-br',
  'gradient-to-b',
  'gradient-to-bl',
  'gradient-to-l',
  'gradient-to-tl',
  // border-<width>, ring-<width>
  '0',
  '2',
  '4',
  '8',
  'x',
  'y',
  's',
  'e',
  't',
  'b',
  'l',
  'r',
  'balance',
  'pretty',
  'clip-text',
  'content',
  'opacity-0',
  'solid',
  'dashed',
  'dotted',
  'double',
  'hidden',
  'collapse',
  'no-repeat',
  'repeat-x',
  'repeat-y',
  'repeat',
  'fixed',
  'scroll',
  'local',
  'inset',
  'full',
]);

/** `border-t-white` sets the top border to `white`; the side is not the colour. */
function colourNameOf(property, raw) {
  if (
    property === 'border' ||
    property === 'divide' ||
    property === 'outline' ||
    property === 'ring'
  ) {
    const m = /^(?:([rtblsxy]|x|y)-)?(?:offset-\d+|inset-\d+)?([\s\S]*)$/.exec(raw);
    if (m) return m[2] || null;
  }
  return raw;
}

/* ------------------------------------------------------------------------- *
 * Opacity scale
 *
 * A colour utility's alpha modifier is looked up in `theme.opacity` by the same
 * rule as its colour is looked up in `theme.colors`: `bg-scrim/92` is no more a
 * utility than `bg-scrim/9` is a colour, because 92 is not on the scale. The
 * utility is silently absent from the stylesheet, which is the exact failure
 * mode this script exists to catch, one notch further out — the colour resolves
 * and the modifier does not.
 *
 * The scale is read from Tailwind itself rather than hardcoded, so this stays
 * true if the config ever extends it. If the resolver cannot be loaded (no
 * installed tailwindcss, e.g. a docs-only checkout) the check is skipped and the
 * report says so: a gate that guesses is worse than a gate that abstains.
 * ------------------------------------------------------------------------- */
const DEFAULT_OPACITY_SCALE = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];
let opacityScale = new Set(DEFAULT_OPACITY_SCALE.map(String));
let opacityScaleSource = "Tailwind's default scale";
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const siteRequire = createRequire(join(root, 'main-site', 'package.json'));
  const resolveConfig = siteRequire('tailwindcss/resolveConfig');
  const { loadConfig } = siteRequire('tailwindcss/lib/lib/load-config');
  const configPath = siteRequire.resolve(join(site, 'tailwind.config.ts'));
  const resolved = resolveConfig(loadConfig(configPath, site));
  if (resolved?.theme?.opacity) {
    opacityScale = new Set(Object.keys(resolved.theme.opacity));
    opacityScaleSource = 'the project config, resolved by Tailwind';
  }
} catch {
  /* left on the default scale */
}

const nearestOnScale = (value) => {
  const n = Number(value);
  const sorted = [...opacityScale].map(Number).sort((a, b) => a - b);
  return sorted.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), sorted[0]);
};

const dead = [];
const deadAlpha = [];
function checkUtility(file, line, utility, name) {
  if (name === null) return;
  if (NOT_A_COLOR.has(name)) return;
  if (name.startsWith('[') || /^\d/.test(name)) return;
  if (tokenOfColorName.has(name)) return;
  if (
    name === 'white' ||
    name === 'black' ||
    name === 'transparent' ||
    name === 'current' ||
    name === 'inherit'
  )
    return;
  if (defaultPalette(name)) return;
  dead.push({ file, line, utility });
}

const certain = [];
const advisory = [];
const offToken = new Map();
let measured = 0;

for (const file of tsxFiles(join(site, 'src'))) {
  const source = read(file);
  const rel = relative(root, file);
  for (const { body, line } of stringLiterals(source)) {
    for (const m of body.matchAll(
      /(?:^|(?<=[\s:]))(?:[a-z-]+:)*(bg|text|border|ring|fill|from|via|to|placeholder|outline|divide)-([^\s/'"`)}]+)/g,
    )) {
      const property = m[1];
      const name = colourNameOf(property, m[2].split('/')[0]);
      checkUtility(rel, line, m[0], name);
      // `bg-scrim/92`, `bg-green-500/12`: a modifier that is not on the scale
      // never becomes a utility, and nothing in the build complains.
      // The utility regex above stops at the slash on purpose (a colour name
      // never contains one), so the modifier has to be read from the text that
      // follows rather than from the match.
      const modifier = /^\/([0-9]{1,3})(?=[\s'"`]|$)/.exec(body.slice(m.index + m[0].length));
      if (modifier && !opacityScale.has(modifier[1])) {
        deadAlpha.push({
          file: rel,
          line,
          utility: `${m[0]}/${modifier[1]}`,
          modifier: modifier[1],
        });
      }
      // A raw palette entry is reported whether or not a text colour shares
      // its class string: `bg-green-50 dark:bg-green-950` is off-token and
      // unmeasurable for the same reason — a name from a palette that does not
      // swap with the theme.
      if (name && !NOT_A_COLOR.has(name) && !name.startsWith('[')) {
        const found = resolveColor(name, 'light') ?? resolveColor(name, 'dark');
        if (found && !found.onToken) noteOffToken(rel, line, `${property}-${name}`, found.hex);
      }
    }
    const tokens = parseClasses(body);
    if (!tokens.length) continue;
    const foregrounds = tokens.filter((t) => t.property === 'text' || t.property === 'fill');
    const backgrounds = tokens.filter((t) => t.property === 'bg');
    if (!foregrounds.length) continue;

    for (const theme of ['light', 'dark']) {
      const pageBg = themes[theme].get('bsdc-bg');
      for (const state of new Set(tokens.map((t) => t.state))) {
        const fgs = painting(
          foregrounds.filter((t) => t.state === state && (theme === 'dark' || !t.dark)),
          theme,
        );
        if (!fgs.length) continue;
        let bgs = painting(
          backgrounds.filter((t) => t.state === state && (theme === 'dark' || !t.dark)),
          theme,
        );
        let declared = bgs.length > 0;
        if (!declared && state !== '') {
          // A hover or active fill paints behind the resting label, so the two
          // are a real pair even though only one of them changed.
          bgs = painting(
            backgrounds.filter((t) => t.state === '' && (theme === 'dark' || !t.dark)),
            theme,
          );
        }

        for (const f of fgs) {
          const fgColor = resolveColor(f.name, theme);
          if (!fgColor) continue;
          if (!fgColor.onToken) noteOffToken(rel, line, `${f.property}-${f.name}`, fgColor.hex);

          const bg = bgs.length ? nearest(bgs, f.index) : null;
          let surface = pageBg;
          let tier = 'advisory';
          let reason = 'no background declared for this text';
          if (bg) {
            const bgColor = resolveColor(bg.name, theme);
            if (!bgColor) continue;
            if (!bgColor.onToken) noteOffToken(rel, line, `bg-${bg.name}`, bgColor.hex);
            if (bg.alpha < 1) {
              surface = composite(bgColor.hex, pageBg, bg.alpha);
              reason = 'translucent fill over a backdrop this script cannot see';
            } else {
              surface = bgColor.hex;
              tier = 'certain';
              reason = '';
            }
          }

          const paint = f.alpha < 1 ? composite(fgColor.hex, surface, f.alpha) : fgColor.hex;
          const ratio = contrast(paint, surface);
          if (ratio === null) continue;
          measured++;
          const floor = floorFor(body);
          if (ratio >= floor) continue;
          // Text whose own state variant changed but whose surface did not is a
          // declared pair only if the resting surface is opaque.
          if (!declared && state !== '' && bgs.length === 0) tier = 'advisory';
          (tier === 'certain' ? certain : advisory).push({
            file: rel,
            line,
            theme,
            state: f.state || 'rest',
            foreground: `${f.name}${f.alpha < 1 ? `/${Math.round(f.alpha * 100)}` : ''}`,
            background: bg
              ? `${bg.name}${bg.alpha < 1 ? `/${Math.round(bg.alpha * 100)}` : ''}`
              : 'page',
            ratio: Number(ratio.toFixed(2)),
            floor,
            ...(reason ? { reason } : {}),
          });
        }
      }
    }
  }
}

function noteOffToken(file, line, name, hex) {
  const key = `${file}:${line}`;
  if (!offToken.has(key)) offToken.set(key, { file, line, names: new Set() });
  offToken.get(key).names.add(`${name} (${hex})`);
}

/** 3:1 for text large or heavy enough to earn it under 1.4.3, else 4.5:1. */
function floorFor(literal) {
  const size = [...minPxOfSize.keys()].find((name) =>
    new RegExp(`\\btext-${name}\\b`).test(literal),
  );
  if (!size) return 4.5;
  const px = minPxOfSize.get(size);
  const bold = /\bfont-(bold|extrabold|black)\b/.test(literal);
  if (px >= 24) return 3;
  if (px >= 18.66 && bold) return 3;
  return 4.5;
}

/* ------------------------------------------------------------------ *
 * 5. Token floors: the pairs the palette itself promises
 * ------------------------------------------------------------------ */

/**
 * The pairs the palette promises, checked where they are defined rather than
 * only where they are used. Sixty-one files write `bg-primary text-on-primary`;
 * a theme edit that breaks the promise breaks all of them at once, and a scan
 * of call sites would still find nothing wrong with any single one of them.
 */
const SEMANTIC_PAIRS = [
  ['body text on the page', 'bsdc-text', 'bsdc-bg', 4.5],
  ['body text on a card', 'bsdc-text', 'bsdc-surface', 4.5],
  ['body text on a raised surface', 'bsdc-text', 'bsdc-surface-2', 4.5],
  ['secondary text on the page', 'bsdc-text-muted', 'bsdc-bg', 4.5],
  ['secondary text on a card', 'bsdc-text-muted', 'bsdc-surface', 4.5],
  ['secondary text on a raised surface', 'bsdc-text-muted', 'bsdc-surface-2', 4.5],
  ['link text on the page', 'bsdc-blue-text', 'bsdc-bg', 4.5],
  ['link text on a card', 'bsdc-blue-text', 'bsdc-surface', 4.5],
  ['danger text on the page', 'bsdc-danger-text', 'bsdc-bg', 4.5],
  ['danger text on a card', 'bsdc-danger-text', 'bsdc-surface', 4.5],
  ['warning text on the page', 'bsdc-warn-text', 'bsdc-bg', 4.5],
  ['warning text on a card', 'bsdc-warn-text', 'bsdc-surface', 4.5],
  ['label on the primary fill', 'bsdc-on-primary', 'bsdc-primary', 4.5],
  ['label on the primary fill, hovered', 'bsdc-on-primary', 'bsdc-primary-hover', 4.5],
  ['label on the primary fill, pressed', 'bsdc-on-primary', 'bsdc-primary-active', 4.5],
  ['label on a danger fill', 'bsdc-on-danger', 'bsdc-danger', 4.5],
  ['label on a blue fill', 'bsdc-on-blue', 'bsdc-blue-fill', 4.5],
  ['label on an outgoing chat bubble', '#ffffff', 'bsdc-chat-outgoing', 4.5],
  ['label on a media scrim', '#ffffff', 'bsdc-scrim', 4.5],
  ['hero label at the near end of the ramp', 'bsdc-on-hero', 'bsdc-hero-from', 4.5],
  ['hero label mid-ramp', 'bsdc-on-hero', 'bsdc-hero-via', 4.5],
  ['hero label at the far end of the ramp', 'bsdc-on-hero', 'bsdc-hero-to', 4.5],
  ['selected text', 'bsdc-selection-ink', 'bsdc-selection-bg', 4.5],
  ['focus ring against the page', 'bsdc-ring', 'bsdc-bg', 3],
];

const tokenFails = [];
const colourOf = (theme, ref) => (ref.startsWith('#') ? ref : themes[theme].get(ref));
for (const [label, fgName, bgName, floor] of SEMANTIC_PAIRS) {
  for (const theme of ['light', 'dark']) {
    const fg = colourOf(theme, fgName);
    const bg = colourOf(theme, bgName);
    if (!fg || !bg) {
      tokenFails.push({
        label,
        theme,
        floor,
        ratio: null,
        note: `no --${!fg ? fgName : bgName} in ${theme}`,
      });
      continue;
    }
    const ratio = contrast(fg, bg);
    if (ratio !== null && ratio < floor) {
      tokenFails.push({
        label,
        theme,
        floor,
        ratio: Number(ratio.toFixed(2)),
        foreground: fg,
        background: bg,
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 6. Report
 * ------------------------------------------------------------------ */

const fails =
  certain.length +
  tokenFails.length +
  (STRICT ? advisory.length : 0) +
  dead.length +
  deadAlpha.length;
const offList = [...offToken.values()];

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ok: fails === 0,
        measured,
        dead,
        deadAlpha,
        tokens: { light: Object.fromEntries(themes.light), dark: Object.fromEntries(themes.dark) },
        certain,
        advisory,
        tokenFails,
        offToken: offList.map((e) => ({ file: e.file, line: e.line, names: [...e.names] })),
      },
      null,
      2,
    ),
  );
  process.exit(fails === 0 ? 0 : 1);
}

console.log(`contrast audit — ${measured} pair(s) measured across 2 theme(s)`);

if (tokenFails.length) {
  console.log('\nToken floors:');
  for (const f of tokenFails) {
    console.log(
      `  fail  ${f.label} in ${f.theme}: ${f.ratio ?? f.note} (needs ${f.floor}:1)` +
        (f.foreground ? `  ${f.foreground} on ${f.background}` : ''),
    );
  }
}

const printList = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title}`);
  const byFile = new Map();
  for (const o of list) {
    if (!byFile.has(o.file)) byFile.set(o.file, []);
    byFile.get(o.file).push(o);
  }
  for (const [file, items] of byFile) {
    console.log(`  ${file}`);
    for (const o of items) {
      console.log(
        `    line ${String(o.line).padEnd(5)} ${o.theme}/${o.state.padEnd(7)} text-${o.foreground} on bg-${o.background} = ${o.ratio}:1 (needs ${o.floor}:1)${o.reason ? `  [${o.reason}]` : ''}`,
      );
    }
  }
};

printList('Certain failures — foreground and opaque background in the same class string:', certain);
printList('Advisory, not gated unless --strict:', advisory);

if (offList.length) {
  console.log(
    `\nOff-token palette colours at ${offList.length} site(s) — no theme can swap these:`,
  );
  for (const e of offList) console.log(`  ${e.file}:${e.line}  ${[...e.names].join(', ')}`);
}

if (dead.length) {
  console.log(
    `\nUtilities naming a colour this theme does not define (${dead.length}) — Tailwind emits no rule for these:`,
  );
  for (const d of dead) console.log(`  ${d.file}:${d.line}  ${d.utility}`);
}
if (deadAlpha.length) {
  console.log(
    `\nAlpha modifiers outside theme.opacity (${deadAlpha.length}) — the scale is ${opacityScaleSource}, and a modifier not on it produces no utility at all:`,
  );
  for (const d of deadAlpha)
    console.log(`  ${d.file}:${d.line}  ${d.utility}  (nearest: ${nearestOnScale(d.modifier)})`);
}

console.log(
  fails === 0
    ? '\nPASS — every certain pair, and every token floor, clears WCAG 2.2 AA in both themes.'
    : `\nFAIL — ${certain.length} certain pair(s), ${tokenFails.length} token floor(s) below the floor, ${dead.length} undefined colour utility name(s), ${deadAlpha.length} off-scale alpha modifier(s)${STRICT ? `, ${advisory.length} advisory` : ''}.`,
);
if (!STRICT && advisory.length)
  console.log(`(${advisory.length} advisory finding(s) listed; --strict gates them)`);

process.exit(fails === 0 ? 0 : 1);
