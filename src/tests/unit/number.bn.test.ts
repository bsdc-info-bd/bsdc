/**
 * BSDC — src/tests/unit/number.bn.test.ts
 * Purpose : Unit coverage for Bengali numeral handling and BDT formatting (PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatCurrency,
  fromBanglaNumerals,
  hasBanglaNumerals,
  toBanglaNumerals,
} from '@/shared/lib/number.bn';

describe('Bengali numerals', () => {
  it('converts ASCII digits to Bengali digits', () => {
    expect(toBanglaNumerals(2026)).toBe('২০২৬');
    expect(toBanglaNumerals('10 / 50')).toBe('১০ / ৫০');
  });

  it('converts Bengali digits back to ASCII', () => {
    expect(fromBanglaNumerals('২০২৬')).toBe('2026');
  });

  it('detects Bengali digits', () => {
    expect(hasBanglaNumerals('২০২৬')).toBe(true);
    expect(hasBanglaNumerals('2026')).toBe(false);
  });

  it('formats currency in BDT', () => {
    expect(formatCurrency(490, 'en')).toContain('490');
    expect(formatCurrency(490, 'bn')).toContain('৪৯০');
  });

  it('formats compact counts in both scripts', () => {
    expect(formatCompact(1_200, 'en')).toBe('1.2K');
    expect(formatCompact(1_200, 'bn')).toContain('১');
  });
});
