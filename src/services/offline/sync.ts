/**
 * BSDC — src/services/offline/sync.ts
 * Purpose : Read-through and write-through: the two primitives every repository is built from.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Read-through — ask the backend, merge the answer into the mirror, answer from the
 *   mirror. If the backend does not answer, answer from the mirror anyway and say so.
 *   Write-through — write the mirror, enqueue the mutation, then try the backend. If the backend
 *   answers, dequeue. If it does not, the mutation stays queued and is replayed by the outbox.
 *   Because both primitives live here, no repository can accidentally skip one of the three steps,
 *   and the UI always knows whether what it is showing came from the network or from the device.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { type AppError } from '@/core/errors/AppError';
import { withRemote } from '@/services/backend/gateway';
import { mirrorList, mirrorMerge, mirrorPut, type MirrorEntity, type MirrorQuery } from './mirror';
import { enqueueMutation, markCompleted, markAttemptFailed, type OutboxKind } from './outbox';
import type { StoreName } from './idb';

/** Where a read-through result came from. */
export type ReadSource = 'remote' | 'local';

/** Outcome of a read-through. */
export interface ReadThroughResult<T> {
  readonly items: readonly T[];
  readonly source: ReadSource;
  readonly error: AppError | null;
}

/** Outcome of a write-through. */
export interface WriteThroughResult {
  /** True when the backend accepted the write in this call. */
  readonly synced: boolean;
  /** True when the mutation was queued for a later attempt. */
  readonly queued: boolean;
  readonly error: AppError | null;
}

/** Description of the mutation a write-through should enqueue. */
export interface WriteThroughMutation {
  readonly kind: OutboxKind;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Reads a collection, preferring the backend and always able to answer from the mirror.
 * @param store mirror store
 * @param remote remote read operation
 * @param query ordering, filtering and paging for the mirror fallback and the trimmed page
 * @returns the items plus their provenance
 */
export async function readThrough<T extends MirrorEntity>(
  store: StoreName,
  remote: () => Promise<readonly T[]>,
  query: MirrorQuery = {},
): Promise<ReadThroughResult<T>> {
  const result = await withRemote(remote, `read ${store}`);
  if (result.ok) {
    await mirrorMerge(store, result.value);
    return { items: await mirrorList<T>(store, query), source: 'remote', error: null };
  }
  return { items: await mirrorList<T>(store, query), source: 'local', error: result.error };
}

/**
 * Writes an entity to the mirror, enqueues the mutation and attempts the backend.
 * @param store mirror store
 * @param entity the entity as it should exist on this device
 * @param mutation the queued mutation that will replay this write
 * @param remote remote write operation, or null when the surface is device-only
 * @returns whether the write reached the backend and whether it was queued
 */
export async function writeThrough<T extends MirrorEntity>(
  store: StoreName,
  entity: T,
  mutation: WriteThroughMutation,
  remote: (() => Promise<void>) | null,
): Promise<WriteThroughResult> {
  await mirrorPut(store, entity);
  const entry = await enqueueMutation(mutation.kind, mutation.entityId, mutation.payload);

  if (remote === null) return { synced: false, queued: true, error: null };

  const result = await withRemote(remote, mutation.kind);
  if (result.ok) {
    await markCompleted(entry.id);
    return { synced: true, queued: false, error: null };
  }

  await markAttemptFailed(entry.id, result.error.message);
  return { synced: false, queued: true, error: result.error };
}

/**
 * Applies a local-only change without touching the network or the queue.
 * Used for view state, drafts and optimistic counters that the backend recomputes.
 * @param store mirror store
 * @param entity entity to write
 * @returns true when the write landed
 */
export async function writeLocal<T extends MirrorEntity>(
  store: StoreName,
  entity: T,
): Promise<boolean> {
  return await mirrorPut(store, entity);
}
