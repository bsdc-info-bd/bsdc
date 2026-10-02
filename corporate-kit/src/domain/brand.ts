/**
 * The brand, as numbers.
 *
 * A palette is not a matter of taste once it reaches a screen: either the
 * text on a surface can be read or it cannot, and that is arithmetic. The
 * studio refuses to save a theme whose body text falls below the WCAG 4.5:1
 * ratio, and so does `0032_seo.sql`, by the same formula.
 */

export interface BrandToken {
  readonly key: string;
  readonly label: string;
  readonly help: string;
}

/** The tokens a theme is made of. Anything else is a typo, not a colour. */
export const BRAND_TOKENS: readonly BrandToken[] = [
  { key: 'primary', label: 'Primary', help: 'Buttons, links and the header.' },
  { key: 'on-primary', label: 'On primary', help: 'Text drawn on the primary colour.' },
  { key: 'accent', label: 'Accent', help: 'Highlights and active states.' },
  { key: 'on-accent', label: 'On accent', help: 'Text drawn on the accent colour.' },
  { key: 'surface', label: 'Surface', help: 'The page background.' },
  { key: 'surface-2', label: 'Raised surface', help: 'Cards and panels.' },
  { key: 'text', label: 'Text', help: 'Body text on the surface.' },
  { key: 'text-muted', label: 'Muted text', help: 'Secondary text on the surface.' },
  { key: 'border', label: 'Border', help: 'Hairlines between regions.' },
  { key: 'danger', label: 'Danger', help: 'Destructive actions and errors.' },
];

export type BrandTokens = Record<string, string>;

/** The palette BSDC ships with: the green of the flag, darkened for text. */
export const DEFAULT_TOKENS: BrandTokens = {
  primary: '#1b4332',
  'on-primary': '#ffffff',
  accent: '#2d6a4f',
  'on-accent': '#ffffff',
  surface: '#ffffff',
  'surface-2': '#f4f7f5',
  text: '#081c15',
  'text-muted': '#45584f',
  border: '#d6e0da',
  danger: '#9b2226',
};

/** Pairs that must be readable, and the reason each one exists. */
export const CONTRAST_PAIRS: readonly {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
  readonly reason: string;
}[] = [
  { foreground: 'text', background: 'surface', minimum: 4.5, reason: 'Body text on the page' },
  {
    foreground: 'text-muted',
    background: 'surface',
    minimum: 4.5,
    reason: 'Secondary text on the page',
  },
  { foreground: 'text', background: 'surface-2', minimum: 4.5, reason: 'Text inside a card' },
  { foreground: 'on-primary', background: 'primary', minimum: 4.5, reason: 'Text on a button' },
  { foreground: 'on-accent', background: 'accent', minimum: 4.5, reason: 'Text on a highlight' },
  { foreground: 'danger', background: 'surface', minimum: 3, reason: 'Error text on the page' },
];

export function isHexColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test((value ?? '').trim());
}

/** Accepts #abc as well as #aabbcc, because that is what people type. */
export function normaliseHex(value: string): string {
  const raw = (value ?? '').trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(raw);
  if (short) return `#${short[1]!}${short[1]!}${short[2]!}${short[2]!}${short[3]!}${short[3]!}`;
  const long = /^#?([0-9a-f]{6})$/.exec(raw);
  return long ? `#${long[1]!}` : raw;
}

export function channels(hex: string): readonly [number, number, number] {
  const value = normaliseHex(hex).replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function linear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.1 contrast, 1 to 21, rounded the way the studio displays it. */
export function contrastRatio(foreground: string, background: string): number {
  if (!isHexColour(normaliseHex(foreground)) || !isHexColour(normaliseHex(background))) return 0;
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(ratio * 100) / 100;
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA large' | 'fail';

export function contrastGrade(ratio: number): ContrastGrade {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'fail';
}

/** Black or white, whichever can actually be read on the given colour. */
export function readableOn(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111111', background)
    ? '#ffffff'
    : '#111111';
}

/** Mixes towards white or black to build the shades a theme needs. */
export function mix(hex: string, towards: string, amount: number): string {
  const weight = Math.min(1, Math.max(0, amount));
  const from = channels(hex);
  const to = channels(towards);
  const part = (index: 0 | 1 | 2): string => {
    const value = Math.round((from[index] * (1 - weight) + to[index] * weight) * 255);
    return value.toString(16).padStart(2, '0');
  };
  return `#${part(0)}${part(1)}${part(2)}`;
}

export interface Shade {
  readonly step: number;
  readonly hex: string;
}

/** A nine-step ramp from one colour, for borders, hovers and disabled states. */
export function shades(hex: string): readonly Shade[] {
  const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  return steps.map((step) => ({
    step,
    hex:
      step < 500
        ? mix(hex, '#ffffff', (500 - step) / 500)
        : step === 500
          ? normaliseHex(hex)
          : mix(hex, '#000000', (step - 500) / 800),
  }));
}

export interface ThemeProblem {
  readonly token: string;
  readonly message: string;
}

/** Everything wrong with a palette, listed; the same refusals SQL makes. */
export function themeProblems(tokens: BrandTokens): readonly ThemeProblem[] {
  const problems: ThemeProblem[] = [];
  for (const token of BRAND_TOKENS) {
    const value = tokens[token.key];
    if (value === undefined || value.trim() === '') {
      problems.push({ token: token.key, message: `${token.label} is not set.` });
    } else if (!isHexColour(normaliseHex(value))) {
      problems.push({ token: token.key, message: `${token.label} must be a #rrggbb colour.` });
    }
  }
  for (const key of Object.keys(tokens)) {
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(key)) {
      problems.push({ token: key, message: `${key} is not a usable CSS custom property name.` });
    }
  }
  if (problems.length > 0) return problems;

  for (const pair of CONTRAST_PAIRS) {
    const foreground = tokens[pair.foreground];
    const background = tokens[pair.background];
    if (foreground === undefined || background === undefined) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio < pair.minimum) {
      problems.push({
        token: pair.foreground,
        message: `${pair.reason} is ${ratio.toFixed(2)}:1 against ${pair.background}; it needs ${pair.minimum}:1.`,
      });
    }
  }
  return problems;
}

/** The theme as the stylesheet the site loads. Sorted, so diffs are readable. */
export function themeCss(tokens: BrandTokens): string {
  const body = Object.keys(tokens)
    .sort()
    .map((key) => `  --brand-${key}: ${normaliseHex(tokens[key] ?? '')};`)
    .join('\n');
  return `:root {\n${body}\n}\n`;
}

/** The theme as the JSON the database stores, with every value tidied. */
export function cleanTokens(tokens: BrandTokens): BrandTokens {
  const out: BrandTokens = {};
  for (const key of Object.keys(tokens).sort()) {
    out[key] = normaliseHex(tokens[key] ?? '');
  }
  return out;
}

export interface BrandTheme {
  readonly key: string;
  readonly name: string;
  readonly tokens: BrandTokens;
  readonly is_active: boolean;
  readonly updated_at: string;
}

/**
 * The wordmark, drawn rather than stored, so a palette change reaches the
 * logo without anybody opening a drawing program. Returned as SVG source
 * because that is both what the page renders and what the studio downloads.
 */
export function wordmarkSvg(tokens: BrandTokens, text = 'BSDC'): string {
  const primary = normaliseHex(tokens['primary'] ?? DEFAULT_TOKENS['primary'] ?? '#1b4332');
  const accent = normaliseHex(tokens['accent'] ?? DEFAULT_TOKENS['accent'] ?? '#2d6a4f');
  const onPrimary = readableOn(primary);
  const safe = text.replace(/[<>&]/g, '').slice(0, 8) || 'BSDC';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" role="img"',
    ` aria-label="${safe}">`,
    `<rect width="96" height="96" rx="20" fill="${primary}"/>`,
    `<path d="M30 26h26a16 16 0 0 1 0 32H30z" fill="none" stroke="${onPrimary}" stroke-width="8"/>`,
    `<path d="M30 58h30a16 16 0 0 1 0 32H30z" fill="none" stroke="${accent}" stroke-width="8"/>`,
    `<text x="116" y="62" font-family="Inter, Segoe UI, sans-serif" font-size="44"`,
    ` font-weight="700" fill="${primary}">${safe}</text>`,
    '</svg>',
  ].join('');
}
