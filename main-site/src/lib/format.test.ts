import { describe, expect, it } from 'vitest';
import { formatCountdownSegment, formatTaka, toBengaliDigits } from './format';

describe('format helpers', () => {
  it('converts Latin digits to Bengali digits', () => {
    expect(toBengaliDigits('2026')).toBe('২০২৬');
  });

  it('pads and localizes countdown segments', () => {
    expect(formatCountdownSegment(7, 'en')).toBe('07');
    expect(formatCountdownSegment(7, 'bn')).toBe('০৭');
  });

  it('formats Bangladeshi Taka amounts', () => {
    expect(formatTaka(1990, 'en')).toContain('1,990');
    expect(formatTaka(1990, 'bn')).toContain('৳');
  });
});
