import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@/lib/market/market-types';
import {
  allowedTransitions,
  bpsToPercent,
  canRequestPayout,
  canTransition,
  commissionOn,
  ledgerBalance,
  netEarnings,
  slugify,
  validateDraft,
  type LedgerEntry,
  type ProductDraft,
} from '@/lib/vendor/vendor-types';

function entry(amount: number, kind: LedgerEntry['kind']): LedgerEntry {
  return { id: `${kind}-${String(amount)}`, kind, amount, memo: '', createdAt: '2026-01-01' };
}

const DRAFT: ProductDraft = {
  slug: 'hand-bound-notebook',
  title: 'Hand bound notebook',
  summary: 'A hundred pages of recycled paper, stitched by hand in Sylhet.',
  description: 'Long form description.',
  price: 45000,
  stock: 12,
  category: 'stationery',
  isDigital: false,
  images: ['https://cdn.bsdc.info.bd/notebook.jpg'],
};

describe('order state machine', () => {
  it('moves an order forward one step at a time', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'packed')).toBe(true);
    expect(canTransition('packed', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'delivered')).toBe(true);
  });

  it('refuses to skip a step', () => {
    expect(canTransition('pending', 'shipped')).toBe(false);
    expect(canTransition('confirmed', 'delivered')).toBe(false);
  });

  it('never goes backwards', () => {
    expect(canTransition('shipped', 'packed')).toBe(false);
    expect(canTransition('delivered', 'shipped')).toBe(false);
    expect(canTransition('confirmed', 'pending')).toBe(false);
  });

  it('allows cancellation only before the parcel leaves', () => {
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('packed', 'cancelled')).toBe(true);
    expect(canTransition('shipped', 'cancelled')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });

  it('treats cancelled and refunded as the end of the road', () => {
    expect(allowedTransitions('cancelled')).toEqual([]);
    expect(allowedTransitions('refunded')).toEqual([]);
  });

  it('only allows a refund after delivery', () => {
    const statuses: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped'];
    for (const status of statuses) expect(canTransition(status, 'refunded')).toBe(false);
    expect(canTransition('delivered', 'refunded')).toBe(true);
  });

  it('offers exactly the moves the database would accept', () => {
    expect(allowedTransitions('pending')).toEqual(['confirmed', 'cancelled']);
    expect(allowedTransitions('shipped')).toEqual(['delivered']);
  });
});

describe('commission', () => {
  it('charges basis points on the goods', () => {
    expect(commissionOn(100_000, 500)).toBe(5_000);
    expect(commissionOn(45_000, 250)).toBe(1_125);
  });

  it('never charges the shop for the courier', () => {
    const subtotal = 200_000;
    const shipping = 8_000;
    expect(netEarnings(subtotal, shipping, 500)).toBe(subtotal + shipping - 10_000);
  });

  it('truncates the way integer division truncates', () => {
    expect(commissionOn(999, 500)).toBe(49);
    expect(Number.isInteger(commissionOn(1_234_567, 333))).toBe(true);
  });

  it('charges nothing on an empty or free order', () => {
    expect(commissionOn(0, 500)).toBe(0);
    expect(commissionOn(100_000, 0)).toBe(0);
  });

  it('reads basis points back as a percentage', () => {
    expect(bpsToPercent(500)).toBe(5);
    expect(bpsToPercent(250)).toBe(2.5);
    expect(bpsToPercent(0)).toBe(0);
  });
});

describe('ledger and payouts', () => {
  it('sums credits and debits into a balance', () => {
    const entries = [entry(100_000, 'sale'), entry(-5_000, 'commission'), entry(-20_000, 'payout')];
    expect(ledgerBalance(entries)).toBe(75_000);
  });

  it('starts an empty shop at zero', () => {
    expect(ledgerBalance([])).toBe(0);
  });

  it('allows a payout the balance covers', () => {
    expect(canRequestPayout(50_000, 75_000)).toBe(true);
    expect(canRequestPayout(75_000, 75_000)).toBe(true);
  });

  it('refuses a payout larger than the balance', () => {
    expect(canRequestPayout(75_001, 75_000)).toBe(false);
  });

  it('refuses zero, negative and fractional amounts', () => {
    expect(canRequestPayout(0, 75_000)).toBe(false);
    expect(canRequestPayout(-100, 75_000)).toBe(false);
    expect(canRequestPayout(10.5, 75_000)).toBe(false);
  });
});

describe('product drafts', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(DRAFT)).toEqual([]);
  });

  it('insists on a usable address', () => {
    expect(validateDraft({ ...DRAFT, slug: 'Ab' }).map((p) => p.field)).toContain('slug');
    expect(validateDraft({ ...DRAFT, slug: 'Has Spaces' }).map((p) => p.field)).toContain('slug');
  });

  it('insists on a summary a buyer can read', () => {
    expect(validateDraft({ ...DRAFT, summary: 'too short' }).map((p) => p.field)).toContain(
      'summary',
    );
  });

  it('insists on at least one image', () => {
    expect(validateDraft({ ...DRAFT, images: [] }).map((p) => p.field)).toContain('images');
  });

  it('rejects a negative or fractional price', () => {
    expect(validateDraft({ ...DRAFT, price: -1 }).map((p) => p.field)).toContain('price');
    expect(validateDraft({ ...DRAFT, price: 10.5 }).map((p) => p.field)).toContain('price');
  });

  it('ignores stock for a digital product', () => {
    expect(validateDraft({ ...DRAFT, isDigital: true, stock: -3 })).toEqual([]);
  });

  it('builds a slug from a title', () => {
    expect(slugify('Hand Bound Notebook')).toBe('hand-bound-notebook');
    expect(slugify('  Spaced   out  ')).toBe('spaced-out');
  });

  it('returns an empty slug when nothing usable survives', () => {
    expect(slugify('নোটবই')).toBe('');
    expect(slugify('ab')).toBe('');
  });
});
