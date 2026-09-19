/**
 * BSDC — src/entities/saved/repository.ts
 * Purpose : Reads and writes the bookmark list, offline-first (PART 05.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The list lives under `users/{uid}/saved`, which the rules make readable and writable by
 *   that account alone — there is no way to read somebody else's bookmarks, so the list can carry
 *   things a person has not made public yet.
 *   Every write goes through the outbox, so saving something in a lift with no signal still saves
 *   it. Removing a bookmark is a delete, not a soft delete: a bookmark is a pointer, and a bin full
 *   of pointers to nothing helps nobody.
 *   Removing one writes a tombstone into the mirror rather than a live row, so a delete made with
 *   no signal still disappears from the list immediately and the outbox carries the remote delete.
 *   Firestore is imported lazily inside each function so the Firestore SDK stays out of the shell
 *   bundle (PART 25).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { savedCollectionPath, savedItemPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { mirrorList, mirrorPurge, mirrorPut } from '@/services/offline/mirror';
import { readThrough, writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { newSavedItem, type NewSavedInput, type SavedItem } from './model';

/** How many bookmarks one account may hold. The list is a shortcut, not a filing cabinet. */
export const SAVED_LIMIT = 500;

/**
 * Adds or removes a bookmark.
 * @param uid saving account id
 * @param input what is being saved
 * @param saved desired state
 * @returns the write outcome
 */
export async function setSavedItem(
  uid: string,
  input: NewSavedInput,
  saved: boolean,
): Promise<WriteThroughResult> {
  const item = newSavedItem(uid, input);
  const now = new Date().toISOString();

  if (saved) {
    return await writeThrough(
      'saved',
      item,
      { kind: 'saved.toggle', entityId: item.id, payload: { itemId: item.id, saved: true } },
      async () => {
        const { doc, setDoc } = await import('firebase/firestore');
        const db = await firestoreDb();
        try {
          await setDoc(doc(db, savedItemPath(uid, item.id)), {
            kind: item.kind,
            entityId: item.entityId,
            title: item.title,
            titleLang: item.titleLang,
            subtitle: item.subtitle,
            href: item.href,
            savedAt: item.savedAt,
            updatedAt: now,
          });
        } catch (error) {
          throw translateFirestoreError(error, 'saved.toggle');
        }
      },
    );
  }

  {
    return await writeThrough(
      'saved',
      { ...item, deletedAt: now, updatedAt: now },
      { kind: 'saved.toggle', entityId: item.id, payload: { itemId: item.id, saved: false } },
      async () => {
        const { doc, deleteDoc } = await import('firebase/firestore');
        const db = await firestoreDb();
        try {
          await deleteDoc(doc(db, savedItemPath(uid, item.id)));
        } catch (error) {
          throw translateFirestoreError(error, 'saved.toggle');
        }
      },
    );
  }
}

/**
 * Lists an account's bookmarks, newest first.
 * @param uid account id
 * @returns the bookmarks and their provenance
 */
export async function listSavedItems(uid: string): Promise<{
  readonly items: readonly SavedItem[];
  readonly source: 'remote' | 'local';
}> {
  const result = await readThrough<SavedItem>(
    'saved',
    async () => {
      const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDocs(
          query(
            collection(db, savedCollectionPath(uid)),
            orderBy('savedAt', 'desc'),
            limit(SAVED_LIMIT),
          ),
        );
        return fromQuery<SavedItem>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'saved.list');
      }
    },
    {
      orderBy: 'savedAt',
      direction: 'desc',
      limit: SAVED_LIMIT,
      where: [(item: SavedItem) => item.uid === uid],
    },
  );
  return { items: result.items, source: result.source };
}

/**
 * Reads the bookmark list from the device mirror alone.
 * @param uid account id
 * @returns the bookmarks held on this device
 */
export async function peekSavedItems(uid: string): Promise<readonly SavedItem[]> {
  return await mirrorList<SavedItem>('saved', {
    orderBy: 'savedAt',
    direction: 'desc',
    limit: SAVED_LIMIT,
    where: [(item: SavedItem) => item.uid === uid],
  });
}

/**
 * Watches the bookmark list and keeps the device mirror warm.
 * @param uid account id
 * @param handler receives the current list
 * @returns a release function
 */
export function watchSavedItems(
  uid: string,
  handler: (items: readonly SavedItem[]) => void,
): Unsubscribe {
  return acquireListener(`saved:${uid}`, 'saved', async () => {
    const { collection, query, orderBy, limit, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      query(
        collection(db, savedCollectionPath(uid)),
        orderBy('savedAt', 'desc'),
        limit(SAVED_LIMIT),
      ),
      (snapshot) => {
        const items = fromQuery<SavedItem>(snapshot);
        void (async () => {
          for (const item of items) await mirrorPut('saved', item);
          handler(await peekSavedItems(uid));
        })();
      },
    );
  });
}

/**
 * Empties the bookmark list: on this device, and on the server.
 * @param uid account id
 * @returns how many rows were cleared from the device mirror
 */
export async function clearSavedItems(uid: string): Promise<number> {
  const local = await peekSavedItems(uid);
  for (const item of local) await mirrorPurge('saved', item.id);

  const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
  const db = await firestoreDb();
  const snapshot = await getDocs(
    query(collection(db, savedCollectionPath(uid)), orderBy('savedAt', 'desc'), limit(SAVED_LIMIT)),
  );
  const { deleteDoc } = await import('firebase/firestore');
  for (const entry of snapshot.docs) {
    await deleteDoc(entry.ref);
  }
  return local.length;
}
