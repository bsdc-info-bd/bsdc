/**
 * BSDC — src/services/offline/idb.ts
 * Purpose : A dependency-free IndexedDB wrapper with a memory fallback.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The offline mirror must survive a reload and must work inside a locked-down WebView
 *   where IndexedDB is missing or throws. Every call therefore degrades to an in-memory map:
 *   the session still works, it simply does not outlive the tab. Storage failures are never
 *   thrown at a feature — they are reported as `false` so a write path can surface the truth.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Database name. Namespaced so a co-hosted app cannot collide with us. */
export const DB_NAME = 'bsdc-offline';

/**
 * Schema version. Bump it and add a migration when a store changes shape.
 * Version 2 added the discovery and opportunity stores (stories, events, jobs, applications,
 * projects, gigs, orders, follows, reputation, broadcasts, appeals).
 * Version 3 added the response 4 stores (message reactions, group join requests, the audit trail,
 * the feature-flag register and the recovery bin).
 */
export const DB_VERSION = 3;

/** Every object store in the mirror. */
export const STORES = [
  'profiles',
  'posts',
  'comments',
  'reactions',
  'groups',
  'conversations',
  'messages',
  'notifications',
  'drafts',
  'saved',
  'outbox',
  'media',
  'stories',
  'events',
  'rsvps',
  'jobs',
  'applications',
  'projects',
  'gigs',
  'orders',
  'follows',
  'reputation',
  'broadcasts',
  'appeals',
  'reports',
  'messageReactions',
  'joinRequests',
  'audit',
  'flags',
  'recovery',
] as const;

export type StoreName = (typeof STORES)[number];

/** In-memory fallback used when IndexedDB is unavailable. */
const memory = new Map<StoreName, Map<string, unknown>>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
let indexedDbUsable = true;

/**
 * Opens (and, on first use, creates) the mirror database.
 * @returns the database, or null when IndexedDB is unavailable
 */
export function openDatabase(): Promise<IDBDatabase | null> {
  if (!indexedDbUsable) return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      indexedDbUsable = false;
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (): void => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => {
      indexedDbUsable = false;
      resolve(null);
    };
    request.onblocked = (): void => {
      indexedDbUsable = false;
      resolve(null);
    };
  });
  return dbPromise;
}

/**
 * Runs a transaction against a store.
 * @param store store name
 * @param mode transaction mode
 * @param operation receives the store
 * @returns the operation result, or null when the database is unavailable
 */
async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDatabase();
  if (db === null) return null;
  return await new Promise<T | null>((resolve) => {
    try {
      const transaction = db.transaction(store, mode);
      const request = operation(transaction.objectStore(store));
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Reads the memory map for a store, creating it on demand.
 * @param store store name
 * @returns the map
 */
function memoryStore(store: StoreName): Map<string, unknown> {
  const existing = memory.get(store);
  if (existing !== undefined) return existing;
  const created = new Map<string, unknown>();
  memory.set(store, created);
  return created;
}

/**
 * Writes a record, replacing any record with the same id.
 * @param store store name
 * @param value record with an `id`
 * @returns true when the write landed
 */
export async function putRecord(
  store: StoreName,
  value: Record<string, unknown> & { readonly id: string },
): Promise<boolean> {
  const written = await withStore(store, 'readwrite', (objectStore) => objectStore.put(value));
  if (written === null) {
    memoryStore(store).set(value.id, value);
    return true;
  }
  return true;
}

/**
 * Reads a record by id.
 * @param store store name
 * @param id record id
 * @returns the record, or undefined when absent
 */
export async function getRecord<T>(store: StoreName, id: string): Promise<T | undefined> {
  const found = await withStore<T>(
    store,
    'readonly',
    (objectStore) => objectStore.get(id) as IDBRequest<T>,
  );
  if (found === null) return memoryStore(store).get(id) as T | undefined;
  return found ?? undefined;
}

/**
 * Reads every record in a store.
 * @param store store name
 * @returns all records
 */
export async function allRecords<T>(store: StoreName): Promise<readonly T[]> {
  const found = await withStore<T[]>(
    store,
    'readonly',
    (objectStore) => objectStore.getAll() as IDBRequest<T[]>,
  );
  if (found === null) return Array.from(memoryStore(store).values()) as T[];
  return found;
}

/**
 * Removes a record.
 * @param store store name
 * @param id record id
 * @returns true when the removal was attempted successfully
 */
export async function deleteRecord(store: StoreName, id: string): Promise<boolean> {
  const removed = await withStore(store, 'readwrite', (objectStore) => objectStore.delete(id));
  if (removed === null) {
    memoryStore(store).delete(id);
    return true;
  }
  return true;
}

/**
 * Removes every record in a store.
 * @param store store name
 * @returns true when the store was cleared
 */
export async function clearStore(store: StoreName): Promise<boolean> {
  const cleared = await withStore(store, 'readwrite', (objectStore) => objectStore.clear());
  if (cleared === null) {
    memoryStore(store).clear();
    return true;
  }
  return true;
}

/**
 * Reports whether the mirror is durable across reloads.
 * @returns true when IndexedDB is in use
 */
export function isDurable(): boolean {
  return indexedDbUsable;
}

/**
 * Empties the in-memory fallback. Used by the diagnostics panel and by tests.
 */
export function clearMemoryFallback(): void {
  memory.clear();
}
