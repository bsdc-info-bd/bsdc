import type {
  DbOrderStatus,
  DbPaymentMethod,
  DbPaymentStatus,
  DbProductStatus,
} from '@/lib/supabase/types';

export type OrderStatus = DbOrderStatus;
export type PaymentMethod = DbPaymentMethod;
export type PaymentStatus = DbPaymentStatus;
export type ProductStatus = DbProductStatus;

export type CatalogSort = 'recent' | 'price_asc' | 'price_desc' | 'popular' | 'rating';

export const CATALOG_SORTS: CatalogSort[] = [
  'recent',
  'price_asc',
  'price_desc',
  'popular',
  'rating',
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash_on_delivery',
  'bkash',
  'nagad',
  'card',
  'bank',
];

export interface CatalogProduct {
  id: string;
  slug: string;
  title: string;
  summary: string;
  imageUrl: string;
  /** Poisha. Never a float: 1 taka is 100 poisha. */
  price: number;
  priceOriginal: number | null;
  currency: string;
  stock: number;
  isDigital: boolean;
  category: string;
  ratingSum: number;
  ratingCount: number;
  soldCount: number;
  shopId: string;
  shopName: string;
  shopSlug: string;
  wishlisted: boolean;
}

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  imageUrl: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  available: number;
  lineTotal: number;
  shopId: string;
  shopName: string;
  inStock: boolean;
}

export interface OrderSummary {
  id: string;
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  total: number;
  currency: string;
  itemCount: number;
  shopName: string;
  placedAt: string;
  canCancel: boolean;
  canReview: boolean;
}

export interface PlacedOrder {
  orderId: string;
  code: string;
  total: number;
}

/**
 * Money is carried as an integer number of poisha everywhere in this
 * codebase, so a price can never drift through floating point. This is the
 * only place that turns it into something a person reads.
 */
export function formatMoney(poisha: number, currency: string, language: 'bn' | 'en'): string {
  const locale = language === 'bn' ? 'bn-BD' : 'en-BD';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: poisha % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(poisha / 100);
}

/**
 * The saving a shopper actually makes, as a whole percent, and only when
 * there is one. A "discount" that is not a discount returns null.
 */
export function discountPercent(price: number, priceOriginal: number | null): number | null {
  if (priceOriginal === null || priceOriginal <= price || priceOriginal <= 0) return null;
  return Math.round(((priceOriginal - price) / priceOriginal) * 100);
}

/** The average rating, or null when nobody has rated it — never a fake 0. */
export function averageRating(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

/** How many units a shopper may add right now, honouring both limits. */
export function purchaseCeiling(product: {
  stock: number;
  isDigital: boolean;
  maxPerOrder?: number;
}): number {
  const perOrder = product.maxPerOrder ?? 10;
  return product.isDigital ? perOrder : Math.max(0, Math.min(perOrder, product.stock));
}

export function isPurchasable(product: { stock: number; isDigital: boolean }): boolean {
  return product.isDigital || product.stock > 0;
}

export interface CartTotals {
  subtotal: number;
  shipping: number;
  total: number;
  itemCount: number;
  /** Lines whose stock no longer covers the quantity in the cart. */
  unavailable: CartLine[];
}

/**
 * Mirrors what place_order() will compute in Postgres, so the cart cannot
 * promise a total the database would refuse. Shipping is per shop, charged
 * once each, and waived above a shop's threshold.
 */
export function cartTotals(
  lines: readonly CartLine[],
  shipping: ReadonlyMap<string, { flat: number; freeOver: number | null }> = new Map(),
): CartTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const perShop = new Map<string, number>();
  for (const line of lines) {
    perShop.set(line.shopId, (perShop.get(line.shopId) ?? 0) + line.unitPrice * line.quantity);
  }

  let shippingTotal = 0;
  for (const [shopId, shopSubtotal] of perShop) {
    const rule = shipping.get(shopId);
    if (rule === undefined) continue;
    const free = rule.freeOver !== null && shopSubtotal >= rule.freeOver;
    shippingTotal += free ? 0 : rule.flat;
  }

  return {
    subtotal,
    shipping: shippingTotal,
    total: subtotal + shippingTotal,
    itemCount,
    unavailable: lines.filter((line) => !line.inStock),
  };
}

/** A cart with a line the shop can no longer fulfil must not be checked out. */
export function canCheckout(lines: readonly CartLine[]): boolean {
  return lines.length > 0 && lines.every((line) => line.inStock);
}

/** Lines grouped the way they will be ordered: one order per shop. */
export function groupByShop(
  lines: readonly CartLine[],
): { shopId: string; shopName: string; lines: CartLine[] }[] {
  const groups = new Map<string, { shopId: string; shopName: string; lines: CartLine[] }>();
  for (const line of lines) {
    const existing = groups.get(line.shopId);
    if (existing === undefined) {
      groups.set(line.shopId, { shopId: line.shopId, shopName: line.shopName, lines: [line] });
    } else {
      existing.lines.push(line);
    }
  }
  return [...groups.values()];
}

const CANCELLABLE: OrderStatus[] = ['pending', 'confirmed'];
const OPEN_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped'];

/** Mirrors cancel_order(): once it has shipped, it is too late. */
export function canCancelOrder(status: OrderStatus): boolean {
  return CANCELLABLE.includes(status);
}

export function isOrderOpen(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Mirrors submit_review(): only a delivered order earns a review. */
export function canReviewOrder(status: OrderStatus): boolean {
  return status === 'delivered';
}

/** The progress steps shown on an order, and how far it has come. */
export const ORDER_STEPS: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
];

export function orderStepIndex(status: OrderStatus): number {
  if (status === 'cancelled' || status === 'refunded') return -1;
  return ORDER_STEPS.indexOf(status);
}

const BD_PHONE = /^(\+8801|01)[3-9][0-9]{8}$/;

/** Mirrors the database check on addresses.phone, down to the operator range. */
export function isBangladeshiPhone(phone: string): boolean {
  return BD_PHONE.test(phone.trim());
}

/** Mirrors the four-digit postcode check; empty is allowed, nonsense is not. */
export function isPostcode(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || /^[0-9]{4}$/.test(trimmed);
}
