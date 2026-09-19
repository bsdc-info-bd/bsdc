/**
 * BSDC — src/entities/gig/repository.ts
 * Purpose : Gig and order persistence for the freelancer hub.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Payment on BSDC is arranged between two people, not held by the platform. The order
 *   record therefore states what was agreed — package, price, due date — and never implies the
 *   platform is holding money it is not. Saying so plainly is better than a reassuring word that
 *   would be a promise the platform does not keep.
 *   A rating may only be written once, when the order is completed, which is the only reason an
 *   average on this platform is worth reading.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, gigPath, orderPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromDocument, fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { mirrorGet, mirrorList, mirrorPut, mirrorSoftDelete } from '@/services/offline/mirror';
import { readThrough, writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import type { OrderStatus } from '@/core/config/opportunities';
import {
  isCancellable,
  newOrder,
  validateGig,
  validateOrder,
  type Gig,
  type GigOrder,
} from './model';

/** Filter used when browsing the freelancer hub. */
export interface GigFilter {
  readonly category?: string | undefined;
  readonly skill?: string | undefined;
  readonly freelancerUid?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * Publishes a gig.
 * @param gig the gig entity, built by src/entities/gig/model.ts
 * @returns the write outcome, or a refused result when the draft is invalid
 */
export async function createGig(gig: Gig): Promise<WriteThroughResult> {
  const problem = validateGig({
    freelancerUid: gig.freelancerUid,
    freelancerName: gig.freelancerName,
    freelancerPhotoUrl: gig.freelancerPhotoUrl,
    title: gig.title,
    category: gig.category,
    description: gig.description,
    packages: gig.packages,
  });
  if (problem !== null) {
    return { synced: false, queued: false, error: new AppError(problem, { gigId: gig.id }) };
  }
  return await writeThrough(
    'gigs',
    gig,
    {
      kind: 'gig.create',
      entityId: gig.id,
      payload: gig as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, gigPath(gig.id)), gig);
      } catch (error) {
        throw translateFirestoreError(error, 'gig.create');
      }
    },
  );
}

/**
 * Edits a gig.
 * @param gigId gig id
 * @param patch fields to change
 * @returns the write outcome
 */
export async function updateGig(
  gigId: string,
  patch: Partial<
    Pick<Gig, 'title' | 'description' | 'coverUrl' | 'packages' | 'skills' | 'status'>
  >,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<Gig>('gigs', gigId);
  if (current === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { gigId }) };
  }
  const now = new Date().toISOString();
  const next: Gig = { ...current, ...patch, updatedAt: now };
  return await writeThrough(
    'gigs',
    next,
    { kind: 'gig.update', entityId: gigId, payload: patch },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, gigPath(gigId)), { ...patch, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'gig.update');
      }
    },
  );
}

/**
 * Moves a gig to the recovery bin.
 * @param gigId gig id
 * @returns the write outcome
 */
export async function softDeleteGig(gigId: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('gigs', gigId, now);
  return await writeThrough(
    'gigs',
    { id: gigId, deletedAt: now, updatedAt: now, createdAt: now } as unknown as Gig,
    { kind: 'gig.delete', entityId: gigId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, gigPath(gigId)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'gig.delete');
      }
    },
  );
}

/**
 * Lists active gigs, newest first.
 * @param filter optional filters
 * @returns the gigs and their provenance
 */
export async function listGigs(
  filter: GigFilter = {},
): Promise<{ readonly items: readonly Gig[]; readonly source: 'remote' | 'local' }> {
  const result = await readThrough<Gig>(
    'gigs',
    async () => {
      const { collection, query, where, orderBy, limit, getDocs } =
        await import('firebase/firestore');
      const db = await firestoreDb();
      const constraints = [where('deletedAt', '==', null), where('status', '==', 'active')];
      if (filter.category !== undefined) {
        constraints.push(where('category', '==', filter.category));
      }
      if (filter.freelancerUid !== undefined) {
        constraints.push(where('freelancerUid', '==', filter.freelancerUid));
      }
      if (filter.skill !== undefined) {
        constraints.push(where('skills', 'array-contains', filter.skill));
      }
      constraints.push(orderBy('createdAt', 'desc') as never, limit(filter.limit ?? 30) as never);
      try {
        const snapshot = await getDocs(query(collection(db, COLLECTIONS.gigs), ...constraints));
        return fromQuery<Gig>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'gig.list');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'desc',
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
    },
  );
  return { items: result.items, source: result.source };
}

/**
 * Reads one gig.
 * @param gigId gig id
 * @returns the gig, or undefined when it does not exist
 */
export async function loadGig(gigId: string): Promise<Gig | undefined> {
  const result = await readThrough<Gig>(
    'gigs',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDoc(doc(db, gigPath(gigId)));
        const gig = fromDocument<Gig>(snapshot);
        return gig === undefined ? [] : [gig];
      } catch (error) {
        throw translateFirestoreError(error, 'gig.read');
      }
    },
    { limit: 1 },
  );
  return result.items[0] ?? (await mirrorGet<Gig>('gigs', gigId));
}

/**
 * Places an order against a gig.
 * @param gig the gig being ordered
 * @param packageName the package chosen
 * @param buyerUid the buyer
 * @param buyerName the buyer's name
 * @param requirement what the buyer needs
 * @returns the write outcome, or a refused result when the order is not valid
 */
export async function placeOrder(
  gig: Gig,
  packageName: string,
  buyerUid: string,
  buyerName: string,
  requirement: string,
): Promise<WriteThroughResult> {
  const problem = validateOrder({ gig, packageName, buyerUid, buyerName, requirement });
  if (problem !== null) {
    return { synced: false, queued: false, error: new AppError(problem, { gigId: gig.id }) };
  }
  const order = newOrder({ gig, packageName, buyerUid, buyerName, requirement });
  await mirrorPut('orders', order);
  return await writeThrough(
    'orders',
    order,
    {
      kind: 'order.create',
      entityId: order.id,
      payload: order as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, orderPath(order.id)), order);
      } catch (error) {
        throw translateFirestoreError(error, 'order.create');
      }
    },
  );
}

/**
 * Advances or cancels an order.
 * @param orderId order id
 * @param status the new status
 * @returns the write outcome
 */
export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<GigOrder>('orders', orderId);
  if (current === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { orderId }) };
  }
  if (status === 'cancelled' && !isCancellable(current)) {
    return { synced: false, queued: false, error: new AppError('BSDC-GIG-003', { orderId }) };
  }
  const now = new Date().toISOString();
  const next: GigOrder = {
    ...current,
    status,
    deliveredAt: status === 'delivered' ? now : current.deliveredAt,
    completedAt: status === 'completed' ? now : current.completedAt,
    deletedAt: status === 'cancelled' ? now : current.deletedAt,
    updatedAt: now,
  };
  await mirrorPut('orders', next);
  return await writeThrough(
    'orders',
    next,
    { kind: 'order.status', entityId: orderId, payload: { status } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, orderPath(orderId)), {
          status,
          ...(status === 'delivered' ? { deliveredAt: now } : {}),
          ...(status === 'completed' ? { completedAt: now } : {}),
          ...(status === 'cancelled' ? { deletedAt: now } : {}),
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'order.status');
      }
    },
  );
}

/**
 * Rates a completed order. One rating per order, written once and never edited.
 * @param orderId order id
 * @param rating one to five
 * @param review the written review
 * @returns the write outcome
 */
export async function reviewOrder(
  orderId: string,
  rating: number,
  review: string,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<GigOrder>('orders', orderId);
  if (current === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { orderId }) };
  }
  if (current.status !== 'completed' || current.rating > 0) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-007', { orderId }) };
  }
  const clamped = Math.min(5, Math.max(1, Math.trunc(rating)));
  const now = new Date().toISOString();
  const next: GigOrder = { ...current, rating: clamped, review: review.trim(), updatedAt: now };
  await mirrorPut('orders', next);
  return await writeThrough(
    'orders',
    next,
    { kind: 'order.review', entityId: orderId, payload: { rating: clamped, review } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, orderPath(orderId)), {
          rating: clamped,
          review: review.trim(),
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'order.review');
      }
    },
  );
}

/**
 * Lists the orders a person is the buyer of, newest first.
 * @param buyerUid buyer account id
 * @returns their purchases
 */
export async function listPurchases(buyerUid: string): Promise<readonly GigOrder[]> {
  return await mirrorList<GigOrder>('orders', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(order: GigOrder) => order.buyerUid === buyerUid],
  });
}

/**
 * Lists the orders a freelancer has been asked for, newest first.
 * @param freelancerUid freelancer account id
 * @returns their incoming orders
 */
export async function listIncomingOrders(freelancerUid: string): Promise<readonly GigOrder[]> {
  return await mirrorList<GigOrder>('orders', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(order: GigOrder) => order.freelancerUid === freelancerUid],
  });
}
