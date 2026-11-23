/**
 * Colour arithmetic for the places a CSS custom property cannot reach.
 *
 * The palette lives in `src/styles/base.css` as tokens that swap with the
 * theme, and components are expected to name those tokens and never a hex
 * value. This module is imported by path rather than through the
 * `@/design-system` barrel on purpose: the barrel re-exports `ThemeToggle`,
 * which reads the theme store, and the store is one of this module's callers,
 * so a barrel import here would close a cycle. Checkpoint F-25 asserts that
 * stays true. Four surfaces sit outside that reach: a Canvas 2D context, an SVG
 * string handed to a third party, a browser chrome colour, and a colour an
 * advertiser typed into a form. The first three are fixed by reading the token
 * back out of the document. The fourth is fixed here, by asking which of two
 * inks a given fill can carry — which is the same question the contrast audit
 * asks of every other pairing in the product, and the reason an ad CTA with a
 * pale accent no longer ships white-on-white.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` -> `#aabbcc`; anything that is not a hex colour returns null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!HEX.test(value)) return null;
  if (value.length === 4) return `#${[...value.slice(1)].map((c) => c + c).join('')}`;
  return value;
}

function channels(hex: string): [number, number, number] | null {
  const value = hex.slice(1);
  if (value.length !== 6) return null;
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

/** WCAG 2.2 relative luminance, or null for anything unparseable. */
export function relativeLuminance(hex: string): number | null {
  const rgb = channels(hex);
  if (!rgb) return null;
  let sum = 0;
  const coefficients = [0.2126, 0.7152, 0.0722];
  for (let i = 0; i < 3; i++) {
    const channel = rgb[i] ?? 0;
    const weight = coefficients[i] ?? 0;
    sum += weight * (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }
  return sum;
}

/** Contrast ratio between two hex colours, or null if either is unreadable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(normalizeHex(a) ?? '');
  const lb = relativeLuminance(normalizeHex(b) ?? '');
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The ink a label should use on `background`, within WCAG 2.2 AA.
 *
 * Only two candidates are offered, and the winner is whichever clears the
 * floor by more — on an arbitrary third-party fill there is no palette to
 * consult, and picking by measured contrast beats the usual habit of assuming
 * white. An input that is not a hex colour returns `fallback`, so a caller
 * with no accent still renders.
 */
export function readableInkOn(
  background: string | null | undefined,
  options?: { light?: string; dark?: string; floor?: number; fallback?: string },
): string {
  const light = options?.light ?? '#ffffff';
  const dark = options?.dark ?? '#0b1512';
  const fallback = options?.fallback ?? light;
  const hex = normalizeHex(background);
  if (hex === null) return fallback;
  const onLight = contrastRatio(light, hex);
  const onDark = contrastRatio(dark, hex);
  if (onLight === null || onDark === null) return fallback;
  const floor = options?.floor ?? 4.5;
  if (onLight >= floor) return light;
  if (onDark >= floor) return dark;
  return onLight >= onDark ? light : dark;
}

/**
 * A design token's current value, for the few APIs that cannot take a
 * `var()`: a Canvas context, a Leaflet path option, the browser chrome colour.
 * Reading the token keeps `base.css` the only place a hex is written, so a
 * theme change cannot leave a stale literal behind in component code.
 */
export function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return normalizeHex(value) !== null ? value : fallback;
}
