import { describe, expect, it } from 'vitest';
import { contrastRatio, normalizeHex, readableInkOn, relativeLuminance } from './color';

/**
 * These four helpers exist so that a colour can leave the palette without
 * leaving the palette's rules behind. The cases below are the ones that were
 * actually wrong in the product: a white label on an advertiser's pale accent,
 * and a pin whose hex had no theme to follow.
 */
describe('normalizeHex', () => {
  it('expands the shorthand and lowercases', () => {
    expect(normalizeHex('#AbC')).toBe('#aabbcc');
    expect(normalizeHex('#1461C9')).toBe('#1461c9');
  });

  it('refuses anything that is not a hex colour', () => {
    expect(normalizeHex('rebeccapurple')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('measures black, white and mid grey at their WCAG values', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('returns null for an unparseable colour rather than zero', () => {
    expect(relativeLuminance('#nope')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is symmetric and matches the floor the audit uses', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    // The brand fill and its ink, as base.css declares them for light mode.
    expect(contrastRatio('#ffffff', '#2d6a4f')).toBeGreaterThanOrEqual(4.5);
  });

  it('returns null when either side is unreadable', () => {
    expect(contrastRatio('var(--x)', '#000000')).toBeNull();
  });
});

describe('readableInkOn', () => {
  it('keeps white on a dark accent', () => {
    expect(readableInkOn('#1b4332')).toBe('#ffffff');
  });

  it('drops to dark ink on a pale accent, which is where white-on-white came from', () => {
    expect(readableInkOn('#f7f3d0')).toBe('#0b1512');
    expect(readableInkOn('#ffd400')).toBe('#0b1512');
    expect(contrastRatio(readableInkOn('#ffd400'), '#ffd400')).toBeGreaterThanOrEqual(4.5);
  });

  it('picks the closer of two inks when neither clears the floor', () => {
    const mid = '#7f7f7f';
    const ink = readableInkOn(mid);
    const other = ink === '#ffffff' ? '#0b1512' : '#ffffff';
    expect(contrastRatio(ink, mid)!).toBeGreaterThan(contrastRatio(other, mid)!);
  });

  it('falls back for a missing or malformed accent', () => {
    expect(readableInkOn(undefined)).toBe('#ffffff');
    expect(readableInkOn('not a colour', { fallback: '#123456' })).toBe('#123456');
  });
});
