/**
 * BSDC — src/tests/unit/text.test.ts
 * Purpose : Unit coverage for the bilingual text primitives (PART 23.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  countGraphemes,
  detectLanguage,
  excerpt,
  initials,
  sanitizeText,
  truncateAtWord,
} from '@/shared/lib/text';

describe('text primitives', () => {
  it('detects Bangla script', () => {
    expect(detectLanguage('আমরা বাংলায় কাজ করি')).toBe('bn');
    expect(detectLanguage('We build software')).toBe('en');
    expect(detectLanguage('BSDC community')).toBe('en');
  });

  it('keeps Bangla compound graphemes intact when counting', () => {
    expect(countGraphemes('ক্ষ')).toBeGreaterThanOrEqual(1);
    expect(countGraphemes('abc')).toBe(3);
  });

  it('builds initials without splitting a Bengali grapheme', () => {
    expect(initials('Rizwan Rahim Chowdhury')).toBe('RC');
    expect(initials('রিজওয়ান')).toBe('র');
    expect(initials('  ')).toBe('?');
  });

  it('truncates at a word boundary', () => {
    const truncated = truncateAtWord('Bangladesh Software Development Community', 20);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.startsWith('Bangladesh')).toBe(true);
  });

  it('strips zero-width and control characters', () => {
    expect(sanitizeText('স্বাগতম\u200B')).toBe('স্বাগতম');
  });

  it('produces a single-line excerpt within the meta-description band', () => {
    const value = excerpt('Line one\n\nLine two with   spacing', 155);
    expect(value).not.toContain('\n');
    expect(value.length).toBeLessThanOrEqual(156);
  });
});
