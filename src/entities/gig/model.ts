/**
 * BSDC — src/entities/gig/model.ts
 * Purpose : The freelancer hub: a gig somebody sells, and an order somebody places for it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Money on BSDC is settled by a human, not by the platform: an order records what was
 *   agreed and who agreed it, and the payment happens outside through a method both sides can
 *   see. That is a deliberate design choice, and it is stated on the order screen rather than
 *   hidden behind a reassuring word like "escrow" that would be a promise we do not keep.
 *   Ratings are two-sided and one-per-order, which is the only way a reputation means anything.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import { orderId, uid } from '@/shared/lib/uid';
import {
  GIG_STATUSES,
  ORDER_STATUSES,
  type GigCategory,
  type GigStatus,
  type OrderStatus,
} from '@/core/config/opportunities';

/** One priced tier of a gig. */
export interface GigPackage {
  readonly name: string;
  readonly description: string;
  readonly priceBdt: number;
  readonly deliveryDays: number;
  readonly revisions: number;
}

/** A service a freelancer sells. */
export interface Gig {
  readonly id: string;
  readonly freelancerUid: string;
  readonly freelancerName: string;
  readonly freelancerPhotoUrl: string;
  readonly title: string;
  readonly category: GigCategory;
  readonly description: string;
  readonly coverUrl: string;
  readonly packages: readonly GigPackage[];
  readonly skills: readonly string[];
  readonly ratingSum: number;
  readonly ratingCount: number;
  readonly completedOrders: number;
  readonly status: GigStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** An order placed against a gig. */
export interface GigOrder {
  readonly id: string;
  readonly readableId: string;
  readonly gigId: string;
  readonly gigTitle: string;
  readonly buyerUid: string;
  readonly buyerName: string;
  readonly freelancerUid: string;
  readonly packageName: string;
  readonly priceBdt: number;
  readonly requirement: string;
  readonly deliveryDays: number;
  readonly status: OrderStatus;
  readonly dueAt: string;
  readonly deliveredAt: string | null;
  readonly completedAt: string | null;
  readonly rating: number;
  readonly review: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to publish a gig. */
export interface NewGigInput {
  readonly freelancerUid: string;
  readonly freelancerName: string;
  readonly freelancerPhotoUrl: string;
  readonly title: string;
  readonly category: GigCategory;
  readonly description: string;
  readonly packages: readonly GigPackage[];
  readonly skills?: readonly string[] | undefined;
  readonly coverUrl?: string | undefined;
  readonly status?: GigStatus | undefined;
  readonly now?: Date | undefined;
}

/** Minimum price a package may carry, in BDT. Keeping a floor stops a race to nothing. */
export const MIN_PACKAGE_PRICE_BDT = 500;

/**
 * Builds a gig entity.
 * @param input gig values
 * @returns a complete gig entity
 */
export function newGig(input: NewGigInput): Gig {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: uid(20),
    freelancerUid: input.freelancerUid,
    freelancerName: input.freelancerName,
    freelancerPhotoUrl: input.freelancerPhotoUrl,
    title: input.title.trim(),
    category: input.category,
    description: input.description.slice(0, TEXT_LIMITS.productDescription),
    coverUrl: input.coverUrl ?? '',
    packages: input.packages,
    skills: input.skills ?? [],
    ratingSum: 0,
    ratingCount: 0,
    completedOrders: 0,
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Validates a gig draft.
 * @param input the draft
 * @returns null when valid, otherwise the BSDC error code to surface
 */
export function validateGig(input: NewGigInput): 'BSDC-DATA-007' | 'BSDC-GIG-001' | null {
  if (input.title.trim().length === 0) return 'BSDC-DATA-007';
  const usable = input.packages.filter(
    (pack) => pack.priceBdt >= MIN_PACKAGE_PRICE_BDT && pack.deliveryDays > 0,
  );
  if (usable.length === 0) return 'BSDC-GIG-001';
  return null;
}

/**
 * The entry price of a gig: the cheapest package, which is what a listing card shows.
 * @param gig the gig
 * @returns the lowest package price, or 0 when there are no packages
 */
export function startingPrice(gig: Gig): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const pack of gig.packages) {
    if (pack.priceBdt < lowest) lowest = pack.priceBdt;
  }
  return Number.isFinite(lowest) ? lowest : 0;
}

/**
 * Average rating of a gig, rounded to one decimal. Zero means unrated, which the UI says.
 * @param gig the gig
 * @returns the average rating
 */
export function averageRating(gig: Gig): number {
  if (gig.ratingCount <= 0) return 0;
  return Math.round((gig.ratingSum / gig.ratingCount) * 10) / 10;
}

/** Values needed to place an order. */
export interface NewOrderInput {
  readonly gig: Gig;
  readonly packageName: string;
  readonly buyerUid: string;
  readonly buyerName: string;
  readonly requirement: string;
  readonly now?: Date | undefined;
}

/**
 * Builds an order entity with its delivery date already resolved.
 * @param input order values
 * @returns a complete order entity
 */
export function newOrder(input: NewOrderInput): GigOrder {
  const now = input.now ?? new Date();
  const chosen =
    input.gig.packages.find((pack) => pack.name === input.packageName) ?? input.gig.packages[0];
  const priceBdt = chosen?.priceBdt ?? 0;
  const deliveryDays = chosen?.deliveryDays ?? 7;
  const due = new Date(now.getTime() + deliveryDays * 86_400_000);
  return {
    id: uid(20),
    readableId: orderId(now),
    gigId: input.gig.id,
    gigTitle: input.gig.title,
    buyerUid: input.buyerUid,
    buyerName: input.buyerName,
    freelancerUid: input.gig.freelancerUid,
    packageName: chosen?.name ?? input.packageName,
    priceBdt,
    requirement: input.requirement.trim(),
    deliveryDays,
    status: 'pending',
    dueAt: due.toISOString(),
    deliveredAt: null,
    completedAt: null,
    rating: 0,
    review: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };
}

/**
 * Validates an order before it is written.
 * @param input the order draft
 * @returns null when valid, otherwise the BSDC error code to surface
 */
export function validateOrder(input: NewOrderInput): 'BSDC-GIG-002' | 'BSDC-DATA-007' | null {
  if (input.gig.freelancerUid === input.buyerUid) return 'BSDC-GIG-002';
  if (input.requirement.trim().length === 0) return 'BSDC-DATA-007';
  return null;
}

/**
 * Statuses in which a buyer may still cancel an order without asking anyone.
 * @returns the cancellable statuses
 */
export function cancellableStatuses(): readonly OrderStatus[] {
  return ['pending', 'accepted'];
}

/**
 * Reports whether a buyer may cancel an order right now.
 * @param order the order
 * @returns true while the work has not started
 */
export function isCancellable(order: GigOrder): boolean {
  return order.deletedAt === null && cancellableStatuses().includes(order.status);
}

/**
 * Reports whether an order has reached a point where work is finished either way.
 * @param order the order
 * @returns true for completed and cancelled orders
 */
export function isOrderClosed(order: GigOrder): boolean {
  return order.status === 'completed' || order.status === 'cancelled';
}

/**
 * Days until an order is due, negative when it is late.
 * @param order the order
 * @param now optional instant
 * @returns whole days remaining
 */
export function daysToDue(order: GigOrder, now: Date = new Date()): number {
  return Math.ceil((Date.parse(order.dueAt) - now.getTime()) / 86_400_000);
}

/**
 * Counts orders per status for the freelancer's own dashboard.
 * @param orders the orders
 * @returns a count per status
 */
export function countOrdersByStatus(
  orders: readonly GigOrder[],
): Readonly<Record<OrderStatus, number>> {
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const order of orders) {
    if (order.deletedAt !== null) continue;
    counts[order.status] += 1;
  }
  return counts;
}

/**
 * Earnings a freelancer has completed, in BDT.
 * @param orders the orders
 * @returns the sum of completed order values
 */
export function completedEarnings(orders: readonly GigOrder[]): number {
  return orders
    .filter((order) => order.status === 'completed')
    .reduce((total, order) => total + order.priceBdt, 0);
}

/**
 * Lists every gig status in presentation order.
 * @returns the statuses
 */
export function gigStatuses(): readonly GigStatus[] {
  return GIG_STATUSES;
}
