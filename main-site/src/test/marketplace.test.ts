import { describe, expect, it } from 'vitest';
import {
  averageRating,
  canCancelOrder,
  canCheckout,
  canReviewOrder,
  cartTotals,
  discountPercent,
  formatMoney,
  groupByShop,
  isBangladeshiPhone,
  isOrderOpen,
  isPostcode,
  isPurchasable,
  orderStepIndex,
  purchaseCeiling,
  type CartLine,
} from '@/lib/market/market-types';

function line(partial: Partial<CartLine> & { productId: string }): CartLine {
  return {
    slug: partial.productId,
    title: 'Item',
    imageUrl: '',
    unitPrice: 50000,
    currency: 'BDT',
    quantity: 1,
    available: 10,
    lineTotal: 50000,
    shopId: 'shop-1',
    shopName: 'Shop One',
    inStock: true,
    ...partial,
  };
}

describe('formatMoney', () => {
  it('treats the stored integer as poisha, not taka', () => {
    expect(formatMoney(50000, 'BDT', 'en')).toContain('500');
  });

  it('drops the decimals on a whole taka amount', () => {
    expect(formatMoney(50000, 'BDT', 'en')).not.toContain('.00');
  });

  it('keeps the paisa when there are some', () => {
    expect(formatMoney(50050, 'BDT', 'en')).toContain('.5');
  });
});

describe('discountPercent', () => {
  it('reports a real saving as a whole percent', () => {
    expect(discountPercent(7500, 10000)).toBe(25);
  });

  it('refuses a "discount" that is not one', () => {
    expect(discountPercent(10000, 9000)).toBeNull();
    expect(discountPercent(10000, 10000)).toBeNull();
    expect(discountPercent(10000, null)).toBeNull();
  });
});

describe('averageRating', () => {
  it('is null rather than zero when nobody has rated', () => {
    expect(averageRating(0, 0)).toBeNull();
  });

  it('rounds to one decimal place', () => {
    expect(averageRating(14, 3)).toBe(4.7);
  });
});

describe('stock rules', () => {
  it('caps a physical product at the smaller of stock and per-order limit', () => {
    expect(purchaseCeiling({ stock: 3, isDigital: false, maxPerOrder: 10 })).toBe(3);
    expect(purchaseCeiling({ stock: 50, isDigital: false, maxPerOrder: 5 })).toBe(5);
  });

  it('ignores stock for a digital product', () => {
    expect(purchaseCeiling({ stock: 0, isDigital: true, maxPerOrder: 4 })).toBe(4);
  });

  it('knows what can still be bought', () => {
    expect(isPurchasable({ stock: 0, isDigital: false })).toBe(false);
    expect(isPurchasable({ stock: 0, isDigital: true })).toBe(true);
  });
});

describe('cartTotals', () => {
  const shipping = new Map([
    ['shop-1', { flat: 6000, freeOver: 100000 }],
    ['shop-2', { flat: 8000, freeOver: null }],
  ]);

  it('adds line totals from unit price and quantity', () => {
    const totals = cartTotals(
      [line({ productId: 'a', quantity: 2 }), line({ productId: 'b', unitPrice: 25000 })],
      new Map(),
    );
    expect(totals.subtotal).toBe(125000);
    expect(totals.itemCount).toBe(3);
    expect(totals.shipping).toBe(0);
  });

  it('charges shipping once per shop', () => {
    const totals = cartTotals(
      [
        line({ productId: 'a', unitPrice: 10000 }),
        line({ productId: 'b', unitPrice: 10000 }),
        line({ productId: 'c', unitPrice: 10000, shopId: 'shop-2', shopName: 'Shop Two' }),
      ],
      shipping,
    );
    expect(totals.shipping).toBe(14000);
    expect(totals.total).toBe(44000);
  });

  it('waives shipping above a shop threshold', () => {
    const totals = cartTotals([line({ productId: 'a', unitPrice: 100000 })], shipping);
    expect(totals.shipping).toBe(0);
  });

  it('collects the lines a shop can no longer fulfil', () => {
    const totals = cartTotals([line({ productId: 'a', inStock: false })], shipping);
    expect(totals.unavailable).toHaveLength(1);
  });
});

describe('canCheckout', () => {
  it('refuses an empty cart and a cart with an unavailable line', () => {
    expect(canCheckout([])).toBe(false);
    expect(canCheckout([line({ productId: 'a', inStock: false })])).toBe(false);
    expect(canCheckout([line({ productId: 'a' })])).toBe(true);
  });
});

describe('groupByShop', () => {
  it('keeps one group per shop in first-seen order', () => {
    const groups = groupByShop([
      line({ productId: 'a' }),
      line({ productId: 'b', shopId: 'shop-2', shopName: 'Shop Two' }),
      line({ productId: 'c' }),
    ]);
    expect(groups.map((group) => group.shopId)).toEqual(['shop-1', 'shop-2']);
    expect(groups[0]?.lines).toHaveLength(2);
  });
});

describe('order status rules', () => {
  it('allows cancelling only before anything ships', () => {
    expect(canCancelOrder('pending')).toBe(true);
    expect(canCancelOrder('confirmed')).toBe(true);
    expect(canCancelOrder('shipped')).toBe(false);
    expect(canCancelOrder('delivered')).toBe(false);
  });

  it('treats an order as open until it is delivered or cancelled', () => {
    expect(isOrderOpen('packed')).toBe(true);
    expect(isOrderOpen('delivered')).toBe(false);
    expect(isOrderOpen('cancelled')).toBe(false);
  });

  it('allows a review only after delivery', () => {
    expect(canReviewOrder('delivered')).toBe(true);
    expect(canReviewOrder('shipped')).toBe(false);
  });

  it('places each status on the progress track, and cancelled off it', () => {
    expect(orderStepIndex('pending')).toBe(0);
    expect(orderStepIndex('delivered')).toBe(4);
    expect(orderStepIndex('cancelled')).toBe(-1);
    expect(orderStepIndex('refunded')).toBe(-1);
  });
});

describe('address validation', () => {
  it('matches the database check on Bangladeshi mobile numbers', () => {
    expect(isBangladeshiPhone('01712345678')).toBe(true);
    expect(isBangladeshiPhone('+8801912345678')).toBe(true);
    expect(isBangladeshiPhone('01212345678')).toBe(false);
    expect(isBangladeshiPhone('0171234567')).toBe(false);
    expect(isBangladeshiPhone('')).toBe(false);
  });

  it('allows an empty postcode but not a malformed one', () => {
    expect(isPostcode('')).toBe(true);
    expect(isPostcode('3100')).toBe(true);
    expect(isPostcode('31000')).toBe(false);
    expect(isPostcode('abcd')).toBe(false);
  });
});
