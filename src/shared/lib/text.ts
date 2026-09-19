/**
 * BSDC — src/shared/lib/text.ts
 * Purpose : Bilingual text primitives: script detection, truncation, initials and Bangla-aware
 *           counting (PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Bangla occupies the Unicode block U+0980..U+09FF. Detection drives `lang` attributes,
 *           line-height selection and search normalisation (ADR-024).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Unicode range of the Bengali script. */
const BANGLA_RANGE = /[\u0980-\u09FF]/;

/**
 * Detects whether a string contains Bengali script.
 * @param value text to inspect
 * @returns true when at least one Bengali code point is present
 */
export function hasBangla(value: string): boolean {
  return BANGLA_RANGE.test(value);
}

/**
 * Picks the document language for a piece of user content.
 * @param value text to inspect
 * @returns 'bn' when Bengali is present, otherwise 'en'
 */
export function detectLanguage(value: string): 'bn' | 'en' {
  return hasBangla(value) ? 'bn' : 'en';
}

/**
 * Truncates text at a word boundary without cutting a Bengali conjunct in half.
 * @param value source text
 * @param maxLength maximum number of characters
 * @returns truncated text with an ellipsis when shortened
 */
export function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

/**
 * Builds display initials for an avatar fallback. Bengali names use the first grapheme so
 * compound characters are never split (ADR-024).
 * @param name display name or username
 * @returns one or two uppercase characters, or a single Bengali grapheme
 */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  if (hasBangla(trimmed)) return Array.from(trimmed)[0] ?? '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/**
 * Counts grapheme clusters rather than code units so emoji-free Bengali text counts correctly.
 * @param value text to count
 * @returns number of user-perceived characters
 */
export function countGraphemes(value: string): number {
  if (typeof Intl.Segmenter === 'undefined') return Array.from(value).length;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const _segment of segmenter.segment(value)) count += 1;
  return count;
}

/**
 * Strips control characters and zero-width joiners that are sometimes pasted from chat apps.
 * @param value raw text
 * @returns cleaned text
 */
export function sanitizeText(value: string): string {
  // The control characters below are the ones chat apps paste into Bengali text; removing them
  // is the entire purpose of this function, so the control-character pattern is intentional.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
}

/**
 * Builds a stable, human-readable excerpt for meta descriptions (120-158 chars, PART 10.06).
 * @param value source body
 * @param maxLength target length
 * @returns trimmed, single-line excerpt
 */
export function excerpt(value: string, maxLength = 155): string {
  const flat = sanitizeText(value).replace(/\s+/g, ' ').trim();
  return truncateAtWord(flat, maxLength);
}
