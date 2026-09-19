/**
 * BSDC — src/shared/lib/number.bn.ts
 * Purpose : Bengali numeral conversion and locale number formatting (PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : ADR-024 — the DOM keeps ASCII digits (so copying, sorting and screen readers stay
 *           correct) and Bengali digits are a rendering choice. Use `toBanglaNumerals` only on
 *           display strings that are never parsed back.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;
const EN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * Converts ASCII digits to Bengali digits.
 * @param value text or number whose digits should be rendered in Bengali
 * @returns the same string with digits replaced
 */
export function toBanglaNumerals(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => BN_DIGITS[Number(digit)] ?? digit);
}

/**
 * Converts Bengali digits back to ASCII digits (used when parsing user input).
 * @param value text possibly containing Bengali digits
 * @returns text with ASCII digits only
 */
export function fromBanglaNumerals(value: string): string {
  let output = value;
  BN_DIGITS.forEach((bnDigit, index) => {
    output = output.split(bnDigit).join(EN_DIGITS[index] ?? '');
  });
  return output;
}

/**
 * Checks whether a string contains only Bengali digits.
 * @param value text to inspect
 * @returns true when every digit is a Bengali digit
 */
export function hasBanglaNumerals(value: string): boolean {
  return /[\u09E6-\u09EF]/.test(value);
}

/**
 * Formats a number for a locale, optionally rendering Bengali digits.
 * @param value number to format
 * @param locale 'bn' or 'en'
 * @param options Intl options forwarded to NumberFormat
 * @returns formatted string
 */
export function formatNumber(
  value: number,
  locale: 'bn' | 'en',
  options: Intl.NumberFormatOptions = {},
): string {
  const formatted = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', options).format(
    value,
  );
  return locale === 'bn' && options.numberingSystem !== 'latn'
    ? toBanglaNumerals(formatted)
    : formatted;
}

/**
 * Compact count formatting (1.2K, ৫.২ হাজার). Used by counters and badges.
 * @param value number to format
 * @param locale 'bn' or 'en'
 * @returns compact representation
 */
export function formatCompact(value: number, locale: 'bn' | 'en'): string {
  if (Math.abs(value) < 1000) return formatNumber(value, locale);
  const formatted = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
  return locale === 'bn' ? toBanglaNumerals(formatted) : formatted;
}

/**
 * Formats BDT amounts. BSDC is BDT-only at launch (PART 20.7, PART 21.8).
 * @param value amount in taka
 * @param locale 'bn' or 'en'
 * @param withSymbol whether to prefix the taka sign
 * @returns formatted currency string
 */
export function formatCurrency(value: number, locale: 'bn' | 'en', withSymbol = true): string {
  const formatted = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    style: withSymbol ? 'currency' : 'decimal',
    currency: 'BDT',
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
  return locale === 'bn' ? toBanglaNumerals(formatted) : formatted;
}
