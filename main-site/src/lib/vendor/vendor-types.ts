import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
} from '@/lib/market/market-types';
import type { DbLedgerKind, DbPayoutStatus, DbShopStatus } from '@/lib/supabase/types';

export type LedgerKind = DbLedgerKind;
export type PayoutStatus = DbPayoutStatus;
export type ShopStatus = DbShopStatus;

export interface ShopDashboard {
  id: string;
  slug: string;
  name: string;
  status: ShopStatus;
  logoUrl: string;
  commissionBps: number;
  shippingFlat: number;
  freeShippingOver: number | null;
  ratingSum: number;
  ratingCount: number;
  ordersCount: number;
  productCount: number;
  openOrders: number;
  /** Poisha available to withdraw: the sum of the whole ledger. */
  balance: number;
  lifetimeSales: number;
  suspensionReason: string;
}

export interface ShopOrder {
  id: string;
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  total: number;
  currency: string;
  itemCount: number;
  recipient: string;
  phone: string;
  addressLine: string;
  city: string;
  placedAt: string;
  /** The moves the database will actually accept from here. */
  nextStatuses: OrderStatus[];
}

export interface ShopProduct {
  id: string;
  slug: string;
  title: string;
  status: ProductStatus;
  price: number;
  currency: string;
  stock: number;
  isDigital: boolean;
  soldCount: number;
  ratingSum: number;
  ratingCount: number;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amount: number;
  memo: string;
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  amount: number;
  status: PayoutStatus;
  reference: string;
  requestedAt: string;
  decidedAt: string | null;
  method: PaymentMethod;
  accountTail: string;
}

/**
 * The same state machine as bsdc.order_transition_allowed(), so a vendor is
 * never offered a button the database would reject. Anything not listed is
 * illegal, including going backwards.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function allowedTransitions(status: OrderStatus): OrderStatus[] {
  return TRANSITIONS[status];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Commission in basis points, charged on goods only — never on the shipping
 * the courier takes. Integer arithmetic, truncated the same way Postgres
 * truncates its integer division, so the two always agree.
 */
export function commissionOn(subtotal: number, bps: number): number {
  if (subtotal <= 0 || bps <= 0) return 0;
  return Math.trunc((subtotal * bps) / 10000);
}

/** What the shop keeps from an order once the platform's cut is taken. */
export function netEarnings(subtotal: number, shipping: number, bps: number): number {
  return subtotal + shipping - commissionOn(subtotal, bps);
}

/** Basis points as a percentage a person can read, without floating noise. */
export function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

/** The running balance, summed the way the ledger is summed in Postgres. */
export function ledgerBalance(entries: readonly LedgerEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

/** A payout request is only valid when the balance actually covers it. */
export function canRequestPayout(amount: number, balance: number): boolean {
  return Number.isInteger(amount) && amount > 0 && amount <= balance;
}

export interface ProductDraft {
  slug: string;
  title: string;
  summary: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  isDigital: boolean;
  images: string[];
}

export interface DraftProblem {
  field: keyof ProductDraft;
  key: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{2,119}$/;

/**
 * Mirrors every check the database will apply when publishing, so a vendor
 * is told what is missing before the round trip rather than after it.
 */
export function validateDraft(draft: ProductDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  if (!SLUG.test(draft.slug)) problems.push({ field: 'slug', key: 'vendor.errors.slug' });
  if (draft.title.trim().length < 3) problems.push({ field: 'title', key: 'vendor.errors.title' });
  if (draft.summary.trim().length < 10) {
    problems.push({ field: 'summary', key: 'vendor.errors.summary' });
  }
  if (!Number.isInteger(draft.price) || draft.price < 0) {
    problems.push({ field: 'price', key: 'vendor.errors.price' });
  }
  if (!draft.isDigital && (!Number.isInteger(draft.stock) || draft.stock < 0)) {
    problems.push({ field: 'stock', key: 'vendor.errors.stock' });
  }
  if (draft.images.length === 0) problems.push({ field: 'images', key: 'vendor.errors.images' });

  return problems;
}

/** Turns a product title into a slug the database will accept, or ''. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
    .replace(/-+$/, '');
  return SLUG.test(slug) ? slug : '';
}
