/**
 * BSDC — src/services/offline/outbox.ts
 * Purpose : The durable queue of mutations that have not reached the backend yet.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A write is never lost because a connection dropped. Every mutation is written to the
 *   mirror first (so the UI is instantly correct) and enqueued here second (so it can be replayed).
 *   Replay is ordered, exponential and capped: after eight attempts an entry is surfaced to the
 *   person as a failed action they can retry or discard, instead of being retried forever.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { allRecords, deleteRecord, getRecord, putRecord } from './idb';

/** Mutations the platform can queue. */
export const OUTBOX_KINDS = [
  'post.create',
  'post.update',
  'post.delete',
  'comment.create',
  'comment.delete',
  'reaction.set',
  'group.create',
  'group.join',
  'group.leave',
  'group.request',
  'group.reviewRequest',
  'group.setRole',
  'group.removeMember',
  'message.send',
  'message.react',
  'message.edit',
  'message.unsend',
  'notification.read',
  'saved.toggle',
  'profile.update',
  'story.create',
  'story.delete',
  'story.view',
  'event.create',
  'event.update',
  'event.delete',
  'rsvp.set',
  'job.create',
  'job.update',
  'job.delete',
  'application.submit',
  'application.withdraw',
  'application.status',
  'project.create',
  'project.update',
  'project.delete',
  'project.join',
  'project.leave',
  'gig.create',
  'gig.update',
  'gig.delete',
  'order.create',
  'order.status',
  'order.review',
  'follow.toggle',
  'report.create',
  'appeal.create',
  'flag.toggle',
  'role.assign',
  'recovery.restore',
  'recovery.purge',
  'broadcast.create',
  'broadcast.send',
] as const;

export type OutboxKind = (typeof OUTBOX_KINDS)[number];

/** A queued mutation. */
export interface OutboxEntry {
  readonly id: string;
  readonly kind: OutboxKind;
  /** Entity id the mutation targets, used for de-duplication. */
  readonly entityId: string;
  /** Serialisable payload for the repository that will replay it. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly attempts: number;
  readonly lastError?: string | undefined;
  readonly nextAttemptAt: string;
}

/** Attempts before an entry is considered permanently failed. */
export const MAX_ATTEMPTS = 8;

/** Base backoff in milliseconds; each attempt doubles it. */
export const BASE_BACKOFF_MS = 2_000;

/** Store backing the queue. */
const STORE = 'outbox' as const;

/**
 * Computes the backoff delay for an attempt number.
 * @param attempts number of attempts already made
 * @returns the delay in milliseconds
 */
export function backoffFor(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), 15 * 60 * 1_000);
}

/**
 * Enqueues a mutation, replacing any pending entry for the same kind and entity.
 * @param kind mutation kind
 * @param entityId target entity id
 * @param payload serialisable payload
 * @returns the queued entry
 */
export async function enqueueMutation(
  kind: OutboxKind,
  entityId: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<OutboxEntry> {
  const existing = (await allRecords<OutboxEntry>(STORE)).find(
    (entry) => entry.kind === kind && entry.entityId === entityId,
  );
  const entry: OutboxEntry = {
    id: existing?.id ?? `${kind}:${entityId}`,
    kind,
    entityId,
    payload: existing === undefined ? payload : { ...existing.payload, ...payload },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
  };
  await putRecord(STORE, entry as unknown as Record<string, unknown> & { readonly id: string });
  return entry;
}

/**
 * Lists entries that are due for another attempt.
 * @returns the due entries, oldest first
 */
export async function dueMutations(): Promise<readonly OutboxEntry[]> {
  const now = Date.now();
  return (await allRecords<OutboxEntry>(STORE))
    .filter((entry) => Date.parse(entry.nextAttemptAt) <= now)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

/**
 * Lists every queued entry.
 * @returns all entries
 */
export async function allMutations(): Promise<readonly OutboxEntry[]> {
  return await allRecords<OutboxEntry>(STORE);
}

/**
 * Counts queued entries.
 * @returns the queue depth
 */
export async function pendingCount(): Promise<number> {
  return (await allRecords<OutboxEntry>(STORE)).length;
}

/**
 * Records a failed attempt and schedules the next one.
 * @param id entry id
 * @param message redacted failure message
 * @returns the updated entry, or undefined when it was already removed
 */
export async function markAttemptFailed(
  id: string,
  message: string,
): Promise<OutboxEntry | undefined> {
  const existing = await getRecord<OutboxEntry>(STORE, id);
  if (existing === undefined) return undefined;
  const attempts = existing.attempts + 1;
  const updated: OutboxEntry = {
    ...existing,
    attempts,
    lastError: message,
    nextAttemptAt: new Date(Date.now() + backoffFor(attempts)).toISOString(),
  };
  await putRecord(STORE, updated as unknown as Record<string, unknown> & { readonly id: string });
  return updated;
}

/**
 * Removes an entry after a successful replay.
 * @param id entry id
 */
export async function markCompleted(id: string): Promise<void> {
  await deleteRecord(STORE, id);
}

/**
 * Replays due mutations through a handler.
 * @param handler performs one mutation; reject or throw to count an attempt
 * @returns how many entries were sent and how many failed
 */
export async function flushOutbox(
  handler: (entry: OutboxEntry) => Promise<void>,
): Promise<{ readonly sent: number; readonly failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const entry of await dueMutations()) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      failed += 1;
      continue;
    }
    try {
      await handler(entry);
      await markCompleted(entry.id);
      sent += 1;
    } catch (error) {
      await markAttemptFailed(entry.id, error instanceof Error ? error.message : 'unknown');
      failed += 1;
    }
  }
  return { sent, failed };
}

/**
 * Discards an entry permanently. Used when a person chooses to drop a failed action.
 * @param id entry id
 */
export async function discardMutation(id: string): Promise<void> {
  await deleteRecord(STORE, id);
}
