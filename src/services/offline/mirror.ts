/**
 * BSDC — src/services/offline/mirror.ts
 * Purpose : The device mirror: a readable, ordered local copy of the data a person can see.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The mirror is not a cache of someone else's content — it is the authoritative local
 *   copy of what this device has produced or fetched. Every write path updates it first, so the
 *   UI is correct within a frame whether or not the backend answered, and every read path can
 *   fall back to it without showing an empty screen that lies about the truth.
 *   Soft-deleted records stay in the mirror with `deletedAt` set until the nightly purge.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { allRecords, deleteRecord, getRecord, putRecord, type StoreName } from './idb';

/** Minimum shape a mirrored entity must have. */
export interface MirrorEntity {
  readonly id: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
}

/** Ordering direction. */
export type MirrorDirection = 'asc' | 'desc';

/** Query options for a mirrored collection. */
export interface MirrorQuery {
  readonly limit?: number | undefined;
  readonly orderBy?: string | undefined;
  readonly direction?: MirrorDirection | undefined;
  /** Returned entities must satisfy every predicate. */
  readonly where?: readonly ((entity: never) => boolean)[] | undefined;
  /** When true, soft-deleted entities are included. */
  readonly includeDeleted?: boolean | undefined;
}

/**
 * Sorts mirrored entities by a field.
 * @param entities entities to sort
 * @param field field name
 * @param direction ordering direction
 * @returns a new sorted array
 */
function sortKey(entity: unknown, field: string): string {
  const value = (entity as Record<string, unknown>)[field];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function sortEntities<T extends MirrorEntity>(
  entities: readonly T[],
  field: string,
  direction: MirrorDirection,
): readonly T[] {
  const sign = direction === 'desc' ? -1 : 1;
  return [...entities].sort((left, right) => {
    const a = sortKey(left, field);
    const b = sortKey(right, field);
    if (a === b) return 0;
    return a < b ? -sign : sign;
  });
}

/**
 * Reads a page of entities from the mirror.
 * @param store store name
 * @param query ordering, filtering and paging options
 * @returns the matching entities
 */
export async function mirrorList<T extends MirrorEntity>(
  store: StoreName,
  query: MirrorQuery = {},
): Promise<readonly T[]> {
  const all = (await allRecords<T>(store)).filter(
    (entity) => query.includeDeleted === true || !entity.deletedAt,
  );
  const filtered =
    query.where === undefined
      ? all
      : all.filter(
          (entity) => query.where?.every((predicate) => predicate(entity as never)) ?? true,
        );
  const ordered = sortEntities(filtered, query.orderBy ?? 'updatedAt', query.direction ?? 'desc');
  return query.limit === undefined ? ordered : ordered.slice(0, query.limit);
}

/**
 * Reads one entity from the mirror.
 * @param store store name
 * @param id entity id
 * @returns the entity, or undefined when absent
 */
export async function mirrorGet<T extends MirrorEntity>(
  store: StoreName,
  id: string,
): Promise<T | undefined> {
  return await getRecord<T>(store, id);
}

/**
 * Writes an entity into the mirror.
 * @param store store name
 * @param entity entity with an id
 * @returns true when the write landed
 */
export async function mirrorPut<T extends MirrorEntity>(
  store: StoreName,
  entity: T,
): Promise<boolean> {
  return await putRecord(
    store,
    entity as unknown as Record<string, unknown> & { readonly id: string },
  );
}

/**
 * Marks an entity as deleted without removing it: the recovery bin lives for thirty days.
 * @param store store name
 * @param id entity id
 * @param at deletion timestamp
 * @returns true when the marker was written
 */
export async function mirrorSoftDelete(store: StoreName, id: string, at: string): Promise<boolean> {
  const existing = await getRecord<MirrorEntity & Record<string, unknown>>(store, id);
  if (existing === undefined) return false;
  return await putRecord(store, {
    ...existing,
    deletedAt: at,
    updatedAt: at,
  });
}

/**
 * Restores a soft-deleted entity.
 * @param store store name
 * @param id entity id
 * @returns true when the entity was restored
 */
export async function mirrorRestore(store: StoreName, id: string): Promise<boolean> {
  const existing = await getRecord<MirrorEntity & Record<string, unknown>>(store, id);
  if (existing === undefined) return false;
  const { deletedAt: _removed, ...rest } = existing;
  return await putRecord(store, {
    ...rest,
    deletedAt: null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Removes an entity outright. Only the nightly purge and an explicit user action call this.
 * @param store store name
 * @param id entity id
 * @returns true when the removal was attempted
 */
export async function mirrorPurge(store: StoreName, id: string): Promise<boolean> {
  return await deleteRecord(store, id);
}

/**
 * Replaces the whole mirror contents for a store with a remote page.
 * @param store store name
 * @param entities the page to merge in
 * @returns the number of entities written
 */
export async function mirrorMerge<T extends MirrorEntity>(
  store: StoreName,
  entities: readonly T[],
): Promise<number> {
  let written = 0;
  for (const entity of entities) {
    const okWrite = await mirrorPut(store, entity);
    if (okWrite) written += 1;
  }
  return written;
}
