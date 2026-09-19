/**
 * BSDC — src/core/config/plans.ts
 * Purpose : Marketplace order-based subscription plans (PART 20.1).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : BSDC sells an ORDER QUOTA, not a time period alone. The catalogue below is the
 *           build-time seed; the authoritative catalogue lives in Firestore `plans` and is
 *           Admin-editable (PART 19.2/16). Every plan is expressed in BDT (PART 20.7).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A marketplace order-quota plan. */
export interface MarketplacePlan {
  readonly id: string;
  readonly orders: number;
  readonly priceBdt: number;
  readonly durationDays: number;
  readonly labelBn: string;
  readonly labelEn: string;
  readonly featured: boolean;
  readonly active: boolean;
}

/** Free credit granted exactly once to every newly approved vendor (PART 20.1). */
export const FREE_VENDOR_CREDIT_ORDERS = 5;

export const MARKETPLACE_PLANS: readonly MarketplacePlan[] = [
  {
    id: 'plan-10',
    orders: 10,
    priceBdt: 100,
    durationDays: 30,
    labelBn: 'স্টার্টার — ১০ অর্ডার',
    labelEn: 'Starter — 10 orders',
    featured: false,
    active: true,
  },
  {
    id: 'plan-50',
    orders: 50,
    priceBdt: 490,
    durationDays: 60,
    labelBn: 'গ্রোথ — ৫০ অর্ডার',
    labelEn: 'Growth — 50 orders',
    featured: true,
    active: true,
  },
  {
    id: 'plan-100',
    orders: 100,
    priceBdt: 900,
    durationDays: 90,
    labelBn: 'বিজনেস — ১০০ অর্ডার',
    labelEn: 'Business — 100 orders',
    featured: false,
    active: true,
  },
  {
    id: 'plan-250',
    orders: 250,
    priceBdt: 1_990,
    durationDays: 120,
    labelBn: 'প্রো — ২৫০ অর্ডার',
    labelEn: 'Pro — 250 orders',
    featured: false,
    active: true,
  },
  {
    id: 'plan-500',
    orders: 500,
    priceBdt: 3_600,
    durationDays: 180,
    labelBn: 'স্কেল — ৫০০ অর্ডার',
    labelEn: 'Scale — 500 orders',
    featured: false,
    active: true,
  },
  {
    id: 'plan-1000',
    orders: 1_000,
    priceBdt: 6_500,
    durationDays: 365,
    labelBn: 'এন্টারপ্রাইজ — ১০০০ অর্ডার',
    labelEn: 'Enterprise — 1000 orders',
    featured: false,
    active: true,
  },
];

/** Vendor tiers assigned at approval time (PART 19.2/11). */
export const VENDOR_TIERS = ['bronze', 'silver', 'gold', 'verified'] as const;
export type VendorTier = (typeof VENDOR_TIERS)[number];

/**
 * Finds a plan by id.
 * @param id plan identifier
 * @returns the plan, or undefined when the id is unknown
 */
export function findPlan(id: string): MarketplacePlan | undefined {
  return MARKETPLACE_PLANS.find((plan) => plan.id === id);
}

/**
 * Effective price per order for a plan, used by the comparison table.
 * @param plan plan
 * @returns BDT per order, rounded to two decimals
 */
export function pricePerOrder(plan: MarketplacePlan): number {
  return Math.round((plan.priceBdt / plan.orders) * 100) / 100;
}
