/**
 * The colours that cannot be tokens, and the reason each one is stuck.
 *
 * The design brief asks that no component paint a hex — every colour in the
 * interface is named from `styles/base.css`, so a theme change reaches it. That
 * rule holds, and these are the four cases where a colour is not a theme choice
 * at all: a third party's identity, the maths of a file format, and the two
 * places a browser API paints from a string it cannot resolve a `var()` inside.
 *
 * They live here rather than at their call sites for the same reason the palette
 * lives in one file: so that the count of exceptions is a number someone can
 * read, and so that `grep` for a hardcoded colour outside the design system
 * returns nothing, which is the check the brief actually asks for.
 */

import { tokenColor } from './color';

/**
 * Google's four-mark logo, as its brand guidelines specify it.
 *
 * These are not our brand and may not be restyled — a recoloured Google button
 * is a policy violation on Google's side and a trust signal broken on ours. The
 * same is true in both themes by requirement, which is exactly why they are not
 * tokens: a token that swapped would be a breach.
 */
export const GOOGLE_MARK_COLOURS = {
  blue: '#4285f4',
  green: '#34a853',
  yellow: '#fbbc05',
  red: '#ea4335',
} as const;

/** Yahoo's wordmark purple, likewise theirs and likewise themeless. */
export const YAHOO_MARK_COLOUR = '#6001d2';

/**
 * The colour a JPEG gets instead of transparency.
 *
 * A JPEG has no alpha channel, so a transparent PNG flattened into one takes on
 * whatever the canvas was painted with first. White is not a design decision
 * here: it is what the format expects, and it is the same in both themes for the
 * same reason a brand mark is.
 */
export const JPEG_BACKDROP = '#ffffff';

/**
 * The browser-chrome colour behind the theme-colour meta tag.
 *
 * The meta tag wants a literal, and the value it should show is a palette token.
 * So the token is read from the document, and these two strings are what paints
 * when there is no document to read from — prerender, and a test environment.
 * Naming them here rather than at the call site keeps the tokens the only source
 * of truth, and keeps the count of literals in the app a number one file owns.
 */
export const THEME_CHROME_FALLBACK = {
  dark: '#0b1512',
  light: '#1b4332',
} as const;

/** The delivery-radius ring, for Leaflet, which writes its colour into an SVG attribute. */
export const MAP_ACCENT_FALLBACK = '#1461c9';

/**
 * A token, read for an API that cannot take `var()`.
 *
 * `fallback` is the no-document floor, and the tokens below are what the app
 * passes. A caller with no fallback at all would paint `undefined` during
 * prerender, so it is required rather than optional.
 */
export function paintToken(token: string, fallback: string): string {
  return tokenColor(token, fallback);
}
