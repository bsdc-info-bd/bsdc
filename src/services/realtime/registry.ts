/**
 * BSDC — src/services/realtime/registry.ts
 * Purpose : The one registry every realtime subscription in BSDC is registered in.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   LAW-08 — a listener is reference-counted and always detached. Components do not call
 *   `onValue` or `onSnapshot` themselves: they acquire a key from this registry. Two components
 *   watching the same conversation share one socket subscription; the subscription is torn down
 *   when the last holder releases it, and it is torn down deterministically even when the
 *   release happens before the subscribe promise resolves (a very common React race).
 *   The registry also powers the diagnostics screen, which lists every live subscription, its
 *   key, its kind and how many holders it has. A leaked listener is therefore visible, not a
 *   mystery that shows up as a battery drain three months later.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Detach function returned by a subscription. */
export type Unsubscribe = () => void;

/** Lifecycle state of one registered subscription. */
export type ListenerStatus = 'pending' | 'active' | 'closing' | 'closed';

/** A registry entry as exposed to diagnostics. */
export interface ListenerRecord {
  readonly key: string;
  readonly kind: string;
  readonly refCount: number;
  readonly status: ListenerStatus;
  readonly createdAt: string;
  readonly lastAcquiredAt: string;
}

interface Entry {
  key: string;
  kind: string;
  refCount: number;
  status: ListenerStatus;
  createdAt: string;
  lastAcquiredAt: string;
  unsubscribe: Unsubscribe | null;
  /** Set when a release arrived before the subscribe promise settled. */
  closing: boolean;
}

const entries = new Map<string, Entry>();
const observers = new Set<(records: readonly ListenerRecord[]) => void>();

/**
 * Publishes registry changes to diagnostics subscribers.
 */
function notify(): void {
  if (observers.size === 0) return;
  const records = listenerSnapshot();
  for (const observer of observers) observer(records);
}

/**
 * Reads every registry entry.
 * @returns an immutable snapshot
 */
export function listenerSnapshot(): readonly ListenerRecord[] {
  return Array.from(entries.values()).map((entry) => ({
    key: entry.key,
    kind: entry.kind,
    refCount: entry.refCount,
    status: entry.status,
    createdAt: entry.createdAt,
    lastAcquiredAt: entry.lastAcquiredAt,
  }));
}

/**
 * Counts subscriptions that are attached to a transport right now.
 * @returns the number of active listeners
 */
export function activeListenerCount(): number {
  let count = 0;
  for (const entry of entries.values()) if (entry.status === 'active') count += 1;
  return count;
}

/**
 * Subscribes to registry changes (used by the diagnostics panel).
 * @param observer receives the full snapshot on every change
 * @returns an unsubscribe function
 */
export function observeListeners(
  observer: (records: readonly ListenerRecord[]) => void,
): Unsubscribe {
  observers.add(observer);
  observer(listenerSnapshot());
  return () => {
    observers.delete(observer);
  };
}

/**
 * Detaches a subscription and removes its entry.
 * @param entry the entry to detach
 */
function detach(entry: Entry): void {
  entry.status = 'closed';
  entry.unsubscribe?.();
  entry.unsubscribe = null;
  entries.delete(entry.key);
  notify();
}

/**
 * Acquires a realtime subscription for a key, subscribing on first use.
 * @param key stable identity of the subscription, e.g. `messages:conv-42`
 * @param kind human-readable category, e.g. `messages`
 * @param subscribe creates the subscription; may be asynchronous
 * @returns a release function that is safe to call more than once
 */
export function acquireListener(
  key: string,
  kind: string,
  subscribe: () => Unsubscribe | Promise<Unsubscribe>,
): Unsubscribe {
  const existing = entries.get(key);
  const entry: Entry =
    existing ??
    ((): Entry => {
      const created: Entry = {
        key,
        kind,
        refCount: 0,
        status: 'pending',
        createdAt: new Date().toISOString(),
        lastAcquiredAt: new Date().toISOString(),
        unsubscribe: null,
        closing: false,
      };
      entries.set(key, created);
      return created;
    })();

  const isFirstSubscriber = existing === undefined;
  entry.refCount += 1;
  entry.lastAcquiredAt = new Date().toISOString();

  if (isFirstSubscriber) {
    entry.status = 'pending';

    /**
     * Attaches the subscription, or detaches immediately when the entry was released while the
     * promise was in flight.
     * @param unsubscribe the detach function returned by the transport
     */
    const attach = (unsubscribe: Unsubscribe): void => {
      // The entry is gone: the last holder released before this promise settled, or the registry
      // was reset. The subscription is detached in the same breath it was created.
      if (!entries.has(key)) {
        unsubscribe();
        return;
      }
      entry.unsubscribe = unsubscribe;
      entry.status = 'active';
      if (entry.closing) detach(entry);
    };

    /**
     * Removes the entry after a failed subscribe, so a phantom never lingers.
     */
    const abandon = (): void => {
      if (entries.get(key) === entry) detach(entry);
    };

    try {
      const immediate = subscribe();
      // A synchronous transport attaches in the same tick; only an asynchronous one is deferred.
      if (typeof immediate === 'function') attach(immediate);
      else
        void Promise.resolve(immediate)
          .then((unsubscribe) => {
            attach(unsubscribe);
            notify();
          })
          .catch(abandon);
    } catch {
      abandon();
    }
  }

  let released = false;
  notify();

  return () => {
    if (released) return;
    released = true;
    const current = entries.get(key);
    if (current === undefined || current !== entry) return;
    current.refCount -= 1;
    if (current.refCount > 0) {
      notify();
      return;
    }
    if (current.unsubscribe !== null) {
      detach(current);
      return;
    }
    // Nothing is attached yet: leave the registry at once so a later acquire starts clean, and
    // let the in-flight promise detach the transport the moment it resolves.
    current.closing = true;
    entries.delete(key);
    notify();
  };
}

/**
 * Detaches every subscription. Used by tests and by the diagnostics reset action.
 * @returns the number of subscriptions that were attached
 */
export function resetListeners(): number {
  let count = 0;
  for (const entry of Array.from(entries.values())) {
    if (entry.status === 'active') count += 1;
    entry.closing = true;
    detach(entry);
  }
  return count;
}
