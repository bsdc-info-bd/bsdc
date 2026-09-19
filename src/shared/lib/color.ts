/**
 * BSDC — src/shared/lib/color.ts
 * Purpose : Colour maths for contrast checking, avatar fallback tints and theme validation.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Used by the design-system lab to prove WCAG AA/AAA on every token pair, and by the
 *           avatar fallback to derive a stable tint from a username (PART 08.01, LAW-14).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** An RGB triplet with channels in [0, 255]. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Parses a hex colour to RGB.
 * @param hex hex colour (#rgb, #rrggbb)
 * @returns RGB triplet, or black when the input is not a valid hex colour
 */
export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Relative luminance per WCAG 2.1.
 * @param rgb colour
 * @returns luminance in [0, 1]
 */
export function luminance(rgb: Rgb): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Contrast ratio between two colours.
 * @param a first colour
 * @param b second colour
 * @returns ratio in [1, 21]
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG verdict for a foreground/background pair.
 * @param foreground text colour
 * @param background surface colour
 * @param large true when the text is 18.66px bold or 24px regular or larger
 * @returns the highest conformance level reached
 */
export function wcagLevel(
  foreground: string,
  background: string,
  large = false,
): 'fail' | 'aa' | 'aaa' {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= (large ? 4.5 : 7)) return 'aaa';
  if (ratio >= (large ? 3 : 4.5)) return 'aa';
  return 'fail';
}

/**
 * Stable pastel tint derived from a string, used for avatar fallbacks.
 * @param seed username or display name
 * @returns a hex colour
 */
export function tintFromString(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 42, 82);
}

/**
 * Converts HSL to hex.
 * @param hue degrees in [0, 360)
 * @param saturation percent
 * @param lightness percent
 * @returns hex colour
 */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (value: number): string =>
    Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
