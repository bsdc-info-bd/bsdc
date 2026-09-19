/**
 * BSDC — src/tests/unit/offline.test.ts
 * Purpose : Proves the device mirror and the outbox keep their promises.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : IndexedDB is absent in the Node test environment, so these exercises run against the
 *   in-memory fallback — which is itself the behaviour a locked-down WebView gets. The guarantees
 *   under test (ordering, soft delete, recovery, backoff, idempotent enqueue) are identical.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearMemoryFallback, clearStore } from '@/services/offline/idb';
import { mirrorList, mirrorPut, mirrorRestore, mirrorSoftDelete } from '@/services/offline/mirror';
import {
  MAX_ATTEMPTS,
  allMutations,
  backoffFor,
  discardMutation,
  dueMutations,
  enqueueMutation,
  markAttemptFailed,
  markCompleted,
  pendingCount,
} from '@/services/offline/outbox';

/** A minimal mirrored entity. */
interface Thing {
  readonly id: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly label: string;
}

/**
 * Builds a mirrored entity.
 * @param id identifier
 * @param updatedAt sort key
 * @returns the entity
 */
function thing(id: string, updatedAt: string): Thing {
  return { id, updatedAt, deletedAt: null, label: id.toUpperCase() };
}

describe('device mirror', () => {
  beforeEach(async () => {
    clearMemoryFallback();
    await clearStore('posts');
    await clearStore('outbox');
  });

  it('orders by a field in both directions', async () => {
    await mirrorPut('posts', thing('a', '2026-01-01T00:00:00.000Z'));
    await mirrorPut('posts', thing('b', '2026-03-01T00:00:00.000Z'));
    await mirrorPut('posts', thing('c', '2026-02-01T00:00:00.000Z'));

    const descending = await mirrorList<Thing>('posts', {
      orderBy: 'updatedAt',
      direction: 'desc',
    });
    expect(descending.map((entry) => entry.id)).toEqual(['b', 'c', 'a']);

    const ascending = await mirrorList<Thing>('posts', { orderBy: 'updatedAt', direction: 'asc' });
    expect(ascending.map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
  });

  it('hides soft-deleted entities unless asked for them', async () => {
    await mirrorPut('posts', thing('a', '2026-01-01T00:00:00.000Z'));
    await mirrorSoftDelete('posts', 'a', '2026-04-01T00:00:00.000Z');
    expect(await mirrorList<Thing>('posts')).toHaveLength(0);
    expect(await mirrorList<Thing>('posts', { includeDeleted: true })).toHaveLength(1);
  });

  it('restores a soft-deleted entity inside the recovery window', async () => {
    await mirrorPut('posts', thing('a', '2026-01-01T00:00:00.000Z'));
    await mirrorSoftDelete('posts', 'a', '2026-04-01T00:00:00.000Z');
    await mirrorRestore('posts', 'a');
    const restored = await mirrorList<Thing>('posts');
    expect(restored).toHaveLength(1);
    expect(restored[0]?.deletedAt).toBeNull();
  });

  it('replaces an entity with the same id', async () => {
    await mirrorPut('posts', thing('a', '2026-01-01T00:00:00.000Z'));
    await mirrorPut('posts', { ...thing('a', '2026-02-01T00:00:00.000Z'), label: 'CHANGED' });
    const all = await mirrorList<Thing>('posts');
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe('CHANGED');
  });

  it('applies a paging limit', async () => {
    for (let index = 0; index < 5; index += 1) {
      await mirrorPut('posts', thing(`id-${index}`, `2026-01-0${index + 1}T00:00:00.000Z`));
    }
    expect(await mirrorList<Thing>('posts', { limit: 2 })).toHaveLength(2);
  });
});

describe('outbox', () => {
  beforeEach(async () => {
    clearMemoryFallback();
    await clearStore('outbox');
  });

  it('enqueues once per kind and entity, merging payloads', async () => {
    await enqueueMutation('post.create', 'p1', { body: 'first' });
    await enqueueMutation('post.create', 'p1', { body: 'second' });
    const all = await allMutations();
    expect(all).toHaveLength(1);
    expect((all[0]?.payload as { body: string }).body).toBe('second');
    expect(await pendingCount()).toBe(1);
  });

  it('backs off exponentially and caps the delay', () => {
    expect(backoffFor(1)).toBe(2_000);
    expect(backoffFor(2)).toBe(4_000);
    expect(backoffFor(3)).toBe(8_000);
    expect(backoffFor(20)).toBe(15 * 60 * 1_000);
  });

  it('schedules the next attempt after a failure', async () => {
    const entry = await enqueueMutation('message.send', 'm1', { body: 'hi' });
    const failed = await markAttemptFailed(entry.id, 'offline');
    expect(failed?.attempts).toBe(1);
    expect(Date.parse(failed?.nextAttemptAt ?? '')).toBeGreaterThan(Date.now() - 1_000);
    expect(await dueMutations()).toHaveLength(0);
  });

  it('removes an entry once the backend accepts it', async () => {
    const entry = await enqueueMutation('post.create', 'p2', { body: 'x' });
    await markCompleted(entry.id);
    expect(await pendingCount()).toBe(0);
  });

  it('discards an entry the person chooses to drop', async () => {
    const entry = await enqueueMutation('post.create', 'p3', { body: 'x' });
    await discardMutation(entry.id);
    expect(await pendingCount()).toBe(0);
  });

  it('counts an entry as failed once it exhausts its attempts', async () => {
    const entry = await enqueueMutation('post.create', 'p4', { body: 'x' });
    let current = entry;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const next = await markAttemptFailed(current.id, 'offline');
      if (next !== undefined) current = next;
    }
    expect(current.attempts).toBe(MAX_ATTEMPTS);
    expect(current.attempts >= MAX_ATTEMPTS).toBe(true);
  });
});
