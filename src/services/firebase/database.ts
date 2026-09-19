/**
 * BSDC — src/services/firebase/database.ts
 * Purpose : Accessors for the Realtime Database, BSDC's ephemeral plane (ADR-018).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The Realtime Database carries state that is worthless tomorrow: presence, typing,
 *           delivery receipts, notification fan-out and live counters. Nothing here is a source
 *           of truth, and every write is disposable. Rules mirror this: paths are scoped to the
 *           account that owns them or to a conversation the account belongs to.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

import type {
  Database,
  DatabaseReference,
  Unsubscribe as RtdbUnsubscribe,
} from 'firebase/database';

type RtdbUnsubscribeAlias = RtdbUnsubscribe;

/**
 * Builds a database reference for a path.
 * @param path database path
 * @returns a reference
 */
export async function rtdbRef(path: string): Promise<DatabaseReference> {
  const { ref } = await import('firebase/database');
  const { realtimeDb } = await import('./app');
  const db: Database = await realtimeDb();
  return ref(db, path);
}

/**
 * Reads a value once.
 * @param path database path
 * @returns the value, or null when nothing is stored there
 */
export async function rtdbGet(path: string): Promise<unknown> {
  const { get } = await import('firebase/database');
  const snapshot = await get(await rtdbRef(path));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Writes a value to a path.
 * @param path database path
 * @param value value to write
 */
export async function rtdbSet(path: string, value: unknown): Promise<void> {
  const { set } = await import('firebase/database');
  await set(await rtdbRef(path), value);
}

/**
 * Updates the children of a path without replacing siblings.
 * @param path database path
 * @param value partial value to merge
 */
export async function rtdbUpdate(path: string, value: Record<string, unknown>): Promise<void> {
  const { update } = await import('firebase/database');
  await update(await rtdbRef(path), value);
}

/**
 * Removes a path.
 * @param path database path
 */
export async function rtdbRemove(path: string): Promise<void> {
  const { remove } = await import('firebase/database');
  await remove(await rtdbRef(path));
}

/**
 * Subscribes to value changes at a path.
 * @param path database path
 * @param handler receives the value, or null when the node is absent
 * @returns an unsubscribe function
 */
export async function rtdbOnValue(
  path: string,
  handler: (value: unknown) => void,
): Promise<RtdbUnsubscribeAlias> {
  const { onValue } = await import('firebase/database');
  return onValue(await rtdbRef(path), (snapshot) => {
    handler(snapshot.exists() ? snapshot.val() : null);
  });
}

/**
 * Subscribes to child additions under a path.
 * @param path database path
 * @param handler receives the child key and value
 * @returns an unsubscribe function
 */
export async function rtdbOnChildAdded(
  path: string,
  handler: (key: string, value: unknown) => void,
): Promise<RtdbUnsubscribeAlias> {
  const { onChildAdded } = await import('firebase/database');
  return onChildAdded(await rtdbRef(path), (snapshot) => {
    const key = snapshot.key ?? '';
    handler(key, snapshot.exists() ? snapshot.val() : null);
  });
}

/**
 * Returns the server-time offset sentinel for the Realtime Database.
 * @returns the sentinel value
 */
export async function rtdbServerTimestamp(): Promise<unknown> {
  const { serverTimestamp } = await import('firebase/database');
  return serverTimestamp();
}

/**
 * Subscribes to the SDK's connection state.
 * @param handler receives true when connected
 * @returns an unsubscribe function
 */
export async function rtdbOnConnected(
  handler: (connected: boolean) => void,
): Promise<RtdbUnsubscribeAlias> {
  const { onValue, ref: makeRef } = await import('firebase/database');
  const { realtimeDb } = await import('./app');
  const db: Database = await realtimeDb();
  return onValue(makeRef(db, '.info/connected'), (snapshot) => {
    handler(snapshot.val() === true);
  });
}
