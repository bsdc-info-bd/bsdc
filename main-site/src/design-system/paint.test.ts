import { describe, expect, it } from 'vitest';
import {
  GOOGLE_MARK_COLOURS,
  JPEG_BACKDROP,
  MAP_ACCENT_FALLBACK,
  paintToken,
  THEME_CHROME_FALLBACK,
} from './paint';

/**
 * The five colours the design brief allows nobody to change, and the two rules
 * that keep them honest.
 *
 * A brand mark is not a palette decision: Google's own guidelines fix those four
 * values, and a recoloured sign-in button is both a policy breach and the exact
 * kind of thing a member reads as phishing. The check below is therefore not
 * "these match our theme" — it is "these do *not* match our theme, and no theme
 * switch may ever move them".
 */
describe('third-party marks', () => {
  it('carries Google’s four published values, lowercased and complete', () => {
    expect(GOOGLE_MARK_COLOURS).toEqual({
      blue: '#4285f4',
      green: '#34a853',
      yellow: '#fbbc05',
      red: '#ea4335',
    });
  });

  it('does not collide with the BSDC ramp, so a brand mark cannot be themed away', () => {
    // If a brand value were ever also a token value, editing the palette would
    // edit somebody else's logo. Six characters of distance is the guard.
    const ours = ['#1b4332', '#2d6a4f', '#52b788', '#74c69d', '#0b1512'];
    const theirs = [...Object.values(GOOGLE_MARK_COLOURS), '#6001d2'];
    expect(theirs.filter((value) => ours.includes(value))).toEqual([]);
  });
});

describe('formats and fallbacks', () => {
  it('flattens a JPEG against white, because the format has no alpha', () => {
    expect(JPEG_BACKDROP).toBe('#ffffff');
  });

  it('names a fallback that is a real colour, so prerender cannot paint `undefined`', () => {
    for (const value of [...Object.values(THEME_CHROME_FALLBACK), MAP_ACCENT_FALLBACK]) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('answers the fallback when there is no document to read a token from', () => {
    // Vitest runs without a stylesheet for these tokens, which is the same
    // situation as prerender: the call must degrade to the literal, never to
    // an empty string that a browser would drop.
    expect(paintToken('--bsdc-does-not-exist', '#1b4332')).toBe('#1b4332');
  });
});
