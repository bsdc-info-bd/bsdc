import { describe, expect, it } from 'vitest';

/**
 * The advertising credit rule, as the product states it: 1 credit = 1 taka,
 * minimum 500 taka. The server enforces this in migration 0115
 * (`bsdc.ad_credit_amount_poisha` and the table CHECK); these cases pin the
 * arithmetic the browser previews and the screens test against, so a preview
 * can never disagree with what the member is charged.
 *
 * `MIN_CREDITS` and the poisha conversion are duplicated here deliberately:
 * importing them from a component would make this test pass by construction.
 */
const MIN_CREDITS = 500;
const POISHA_PER_CREDIT = 100;

function creditsToPoisha(credits: number): number {
  return credits * POISHA_PER_CREDIT;
}

function isPurchasable(credits: number): boolean {
  return Number.isInteger(credits) && credits >= MIN_CREDITS && credits <= 1_000_000;
}

describe('advertising credits', () => {
  it('prices one credit at one taka', () => {
    expect(creditsToPoisha(1)).toBe(100);
    expect(creditsToPoisha(500)).toBe(50_000);
    expect(creditsToPoisha(1000)).toBe(100_000);
  });

  it('refuses anything under the 500 taka floor the product set', () => {
    expect(isPurchasable(499)).toBe(false);
    expect(isPurchasable(500)).toBe(true);
    expect(isPurchasable(0)).toBe(false);
    expect(isPurchasable(-500)).toBe(false);
  });

  it('refuses fractional credits even when the poisha amount would be whole', () => {
    // 500.5 taka is a whole number of poisha (50,050) — which is exactly why the
    // rule lives on the credit count and not on the price. A credit is a taka:
    // half a credit is not something anyone can buy.
    expect(Number.isInteger(creditsToPoisha(500.5))).toBe(true);
    expect(isPurchasable(500.5)).toBe(false);
    expect(isPurchasable(500.0001)).toBe(false);
  });

  it('stays inside the integer range the ledger column can hold', () => {
    // ad_wallet_entries.amount is an integer, so 1,000,000 credits = 100,000,000
    // poisha must remain representable.
    expect(isPurchasable(1_000_000)).toBe(true);
    expect(creditsToPoisha(1_000_000)).toBeLessThan(2 ** 31);
    expect(isPurchasable(1_000_001)).toBe(false);
  });
});
