/**
 * BSDC — src/shared/lib/slugify.ts
 * Purpose : URL slugs for posts, profiles, stores, tags and products (PART 09.01, PART 10.06).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two strategies exist because BSDC is bilingual:
 *             slugify  — transliterates to ASCII (canonical, used when the entity has no Bengali)
 *             slugifyBn — preserves Bengali characters (used for Bengali titles)
 *           Both are deterministic: the same input always produces the same slug, which is what
 *           makes the prerender pipeline stable (ADR-022).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** ASCII transliteration map for Bengali characters. */
const TRANSLITERATION: Readonly<Record<string, string>> = {
  অ: 'o',
  আ: 'a',
  ই: 'i',
  ঈ: 'i',
  উ: 'u',
  ঊ: 'u',
  ঋ: 'ri',
  এ: 'e',
  ঐ: 'oi',
  ও: 'o',
  ঔ: 'ou',
  ক: 'k',
  খ: 'kh',
  গ: 'g',
  ঘ: 'gh',
  ঙ: 'ng',
  চ: 'ch',
  ছ: 'chh',
  জ: 'j',
  ঝ: 'jh',
  ঞ: 'n',
  ট: 't',
  ঠ: 'th',
  ড: 'd',
  ঢ: 'dh',
  ণ: 'n',
  ত: 't',
  থ: 'th',
  দ: 'd',
  ধ: 'dh',
  ন: 'n',
  প: 'p',
  ফ: 'ph',
  ব: 'b',
  ভ: 'bh',
  ম: 'm',
  য: 'j',
  র: 'r',
  ল: 'l',
  শ: 'sh',
  ষ: 'sh',
  স: 's',
  হ: 'h',
  ড়: 'r',
  ঢ়: 'rh',
  য়: 'y',
  'া': 'a',
  'ি': 'i',
  'ী': 'i',
  'ু': 'u',
  'ূ': 'u',
  'ৃ': 'ri',
  'ে': 'e',
  'ৈ': 'oi',
  'ো': 'o',
  'ৌ': 'ou',
  '্': '',
  ৎ: 't',
  'ং': 'ng',
  'ঃ': 'h',
  'ঁ': 'n',
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

/**
 * Transliterates Bengali to ASCII.
 * @param value Bengali text
 * @returns ASCII approximation
 */
export function transliterate(value: string): string {
  return Array.from(value)
    .map((char) => TRANSLITERATION[char] ?? char)
    .join('');
}

/**
 * ASCII slug. Falls back to a short deterministic suffix when the input has no usable characters.
 * @param value source text
 * @param maxLength maximum slug length
 * @returns a URL-safe slug
 */
export function slugify(value: string, maxLength = 80): string {
  const transliterated = transliterate(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '');
  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'item';
}

/**
 * Bengali-preserving slug for Bengali titles (keeps U+0980..U+09FF and ASCII alphanumerics).
 * @param value source text
 * @param maxLength maximum slug length
 * @returns a URL-safe slug that keeps Bengali readable
 */
export function slugifyBn(value: string, maxLength = 80): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Script=Bengali}a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'item';
}

/**
 * Chooses the right slug strategy for a string.
 * @param value source text
 * @param maxLength maximum slug length
 * @returns Bengali-preserving slug when the text is Bengali, ASCII slug otherwise
 */
export function slugifyAuto(value: string, maxLength = 80): string {
  return /[\u0980-\u09FF]/.test(value) ? slugifyBn(value, maxLength) : slugify(value, maxLength);
}
