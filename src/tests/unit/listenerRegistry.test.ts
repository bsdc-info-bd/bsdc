/**
 * BSDC — src/tests/unit/listenerRegistry.test.ts
 * Purpose : Proves every realtime subscription is reference-counted and always released.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : LAW-08. A leaked Firestore listener is invisible in code review and expensive in
 *   production: it drains battery, bills reads and can surface content the person should no longer
 *   see. These tests pin the four ways a leak happens — double acquire, release before resolve,
 *   release after the entry is gone, and a subscribe that throws.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquireListener,
  activeListenerCount,
  listenerSnapshot,
  observeListeners,
  resetListeners,
} from '@/services/realtime/registry';

describe('listener registry', () => {
  beforeEach(() => {
    resetListeners();
  });

  it('subscribes on first acquire and shares one subscription afterwards', () => {
    let subscribed = 0;
    const releaseA = acquireListener('post:1', 'post', () => {
      subscribed += 1;
      return () => undefined;
    });
    const releaseB = acquireListener('post:1', 'post', () => {
      subscribed += 1;
      return () => undefined;
    });

    expect(listenerSnapshot()).toHaveLength(1);
    expect(listenerSnapshot()[0]?.refCount).toBe(2);

    releaseA();
    expect(listenerSnapshot()[0]?.refCount).toBe(1);
    expect(activeListenerCount()).toBe(1);

    releaseB();
    expect(listenerSnapshot()).toHaveLength(0);
    expect(subscribed).toBe(1);
  });

  it('releases deterministically when the release arrives before the promise resolves', async () => {
    let detached = false;
    const release = acquireListener('messages:c1', 'messages', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return () => {
        detached = true;
      };
    });
    release();
    expect(listenerSnapshot()).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(detached).toBe(true);
  });

  it('detaches immediately on release once a subscription is attached', () => {
    let detached = false;
    const release = acquireListener('presence:u1', 'presence', () => () => {
      detached = true;
    });
    expect(activeListenerCount()).toBe(1);
    release();
    expect(detached).toBe(true);
    expect(activeListenerCount()).toBe(0);
  });

  it('ignores a second release from the same holder', () => {
    let detachCount = 0;
    const release = acquireListener('post:2', 'post', () => () => {
      detachCount += 1;
    });
    release();
    release();
    expect(detachCount).toBe(1);
  });

  it('removes the entry when subscribing fails', async () => {
    const release = acquireListener('post:3', 'post', () => {
      throw new Error('permission denied');
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listenerSnapshot()).toHaveLength(0);
    release();
    expect(listenerSnapshot()).toHaveLength(0);
  });

  it('keeps separate keys independent', () => {
    acquireListener('a', 'post', () => () => undefined);
    acquireListener('b', 'post', () => () => undefined);
    expect(activeListenerCount()).toBe(2);
    expect(resetListeners()).toBe(2);
    expect(activeListenerCount()).toBe(0);
  });

  it('publishes snapshots to observers and stops on unsubscribe', () => {
    const seen: number[] = [];
    const stop = observeListeners((records) => seen.push(records.length));
    acquireListener('c', 'post', () => () => undefined);
    stop();
    acquireListener('d', 'post', () => () => undefined);
    expect(seen).toEqual([0, 1]);
  });
});
