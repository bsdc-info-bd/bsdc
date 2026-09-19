/**
 * BSDC — src/entities/settings/repository.ts
 * Purpose : Per-account settings that follow a person between devices.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The durable copy lives in `users/{uid}/settings/{documentId}`, which the rules make
 *   readable and writable by that account alone and which accepts only the three document kinds
 *   this file defines — a broken client cannot invent a new setting the platform will honour.
 *   The value is stored as a JSON string capped at 8000 characters by the rules, so the shape is
 *   validated on the way out as well as on the way in.
 *   A copy is cached in localStorage, which is what the screen paints first: a settings page that
 *   shows defaults for a second and then flips is a settings page nobody trusts. The server always
 *   wins when it answers, and the cache is only ever a first paint, never a decision.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { userSettingPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { translateFirestoreError } from '@/services/firebase/firestore';
import { readJson, writeJson } from '@/shared/lib/storage';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';

/** The settings documents an account owns. */
export const SETTINGS_KINDS = ['notifications', 'privacy', 'appearance'] as const;
export type SettingsKind = (typeof SETTINGS_KINDS)[number];

/** Result of reading a setting. */
export interface SettingRead<T> {
  readonly value: T;
  /** Where the value came from: the server, this device's cache, or neither. */
  readonly source: 'remote' | 'local' | 'default';
}

/**
 * Cache key of a settings document.
 * @param uid account id
 * @param documentId settings document id
 * @returns the storage key
 */
function cacheKey(uid: string, documentId: string): string {
  return `settings:${uid}:${documentId}`;
}

/**
 * Reads a settings document: cache first for the paint, then the server.
 * @param uid account id
 * @param documentId settings document id
 * @param fallback value to use when neither the device nor the server has one
 * @returns the value and where it came from
 */
export async function loadSetting<T>(
  uid: string,
  documentId: string,
  fallback: T,
): Promise<SettingRead<T>> {
  const cached = readJson<T | null>(cacheKey(uid, documentId), null);
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDoc(doc(db, userSettingPath(uid, documentId)));
    if (snapshot.exists()) {
      const raw = (snapshot.data() as { readonly value?: unknown }).value;
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw) as T;
        writeJson(cacheKey(uid, documentId), parsed);
        return { value: parsed, source: 'remote' };
      }
    }
    return cached === null
      ? { value: fallback, source: 'default' }
      : { value: cached, source: 'local' };
  } catch (error) {
    translateFirestoreError(error, 'settings.read');
    return cached === null
      ? { value: fallback, source: 'default' }
      : { value: cached, source: 'local' };
  }
}

/**
 * Writes a settings document to the server and to the device cache.
 * @param uid account id
 * @param documentId settings document id
 * @param kind the kind of document, mirrored by the rules
 * @param value the value to store
 * @returns true when the server accepted the write
 */
export async function saveSetting<T>(
  uid: string,
  documentId: string,
  kind: SettingsKind,
  value: T,
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  writeJson(cacheKey(uid, documentId), value);
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    await setDoc(doc(db, userSettingPath(uid, documentId)), {
      kind,
      value: JSON.stringify(value),
      updatedAt,
    });
    return true;
  } catch (error) {
    translateFirestoreError(error, 'settings.write');
    return false;
  }
}

/**
 * Watches a settings document so a change on one device reaches the others.
 * @param uid account id
 * @param documentId settings document id
 * @param fallback value used when the document is absent
 * @param handler receives the current value
 * @returns a release function
 */
export function watchSetting<T>(
  uid: string,
  documentId: string,
  fallback: T,
  handler: (value: T) => void,
): Unsubscribe {
  return acquireListener(`settings:${uid}:${documentId}`, 'settings', async () => {
    const { doc, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(doc(db, userSettingPath(uid, documentId)), (snapshot) => {
      if (!snapshot.exists()) {
        handler(readJson<T>(cacheKey(uid, documentId), fallback));
        return;
      }
      const raw = (snapshot.data() as { readonly value?: unknown }).value;
      if (typeof raw !== 'string') return;
      try {
        const parsed = JSON.parse(raw) as T;
        writeJson(cacheKey(uid, documentId), parsed);
        handler(parsed);
      } catch {
        // A value we cannot parse is a value we will not apply. The rules cap the size, not the
        // shape, so a document written by an older build may not match the type we expect.
      }
    });
  });
}
