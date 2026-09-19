/**
 * BSDC — src/entities/notification/repository.ts
 * Purpose : Notification persistence: paging, read state and the live unread badge.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The unread badge subscribes through the listener registry keyed by account, so the
 *   header badge, the bottom-nav badge and the notification page all share one subscription and
 *   cannot disagree. Marking as read is optimistic: the badge clears in the same frame, and the
 *   queue guarantees the server eventually hears about it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, notificationPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorPut } from '@/services/offline/mirror';
import {
  readThrough,
  writeThrough,
  type ReadThroughResult,
  type WriteThroughResult,
} from '@/services/offline/sync';
import { unreadCount, type BsdcNotification } from './model';

/** Notifications loaded per page. */
export const NOTIFICATION_PAGE_SIZE = 30;

/**
 * Lists the viewer's notifications.
 * @param uid viewer account id
 * @param limit page size
 * @returns the notifications with their provenance
 */
export async function listNotifications(
  uid: string,
  limit: number = NOTIFICATION_PAGE_SIZE,
): Promise<ReadThroughResult<BsdcNotification>> {
  return await readThrough<BsdcNotification>(
    'notifications',
    async () => {
      const {
        collection,
        query: buildQuery,
        where,
        orderBy,
        limit: cap,
        getDocs,
      } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDocs(
          buildQuery(
            collection(db, COLLECTIONS.users, uid, COLLECTIONS.notifications),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'desc'),
            cap(limit),
          ),
        );
        return fromQuery<BsdcNotification>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'notification.list');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'desc',
      where: [(notification: BsdcNotification) => notification.uid === uid],
    },
  );
}

/**
 * Marks one notification as read.
 * @param uid viewer account id
 * @param notificationId notification id
 * @returns the write outcome
 */
export async function markNotificationRead(
  uid: string,
  notificationId: string,
): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  const current = await mirrorGet<BsdcNotification>('notifications', notificationId);
  const next: BsdcNotification =
    current ??
    ({
      id: notificationId,
      uid,
      type: 'system',
      actorUid: '',
      actorName: '',
      actorPhotoUrl: '',
      targetPath: '',
      targetLabelBn: '',
      targetLabelEn: '',
      bodyBn: '',
      bodyEn: '',
      read: true,
      readAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } satisfies BsdcNotification);

  return await writeThrough(
    'notifications',
    { ...next, read: true, readAt: now, updatedAt: now },
    { kind: 'notification.read', entityId: notificationId, payload: { notificationId } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, notificationPath(uid, notificationId)), {
          read: true,
          readAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'notification.read');
      }
    },
  );
}

/**
 * Marks every unread notification as read.
 * @param uid viewer account id
 * @returns how many were marked and whether the backend accepted the change
 */
export async function markAllNotificationsRead(
  uid: string,
): Promise<{ readonly marked: number; readonly result: WriteThroughResult }> {
  const all = await mirrorList<BsdcNotification>('notifications', {
    where: [(notification: BsdcNotification) => notification.uid === uid && !notification.read],
  });
  const now = new Date().toISOString();
  for (const notification of all) {
    await mirrorPut('notifications', { ...notification, read: true, readAt: now, updatedAt: now });
  }

  const result = await writeThrough(
    'notifications',
    { id: `all:${uid}`, uid, read: true, readAt: now, updatedAt: now, deletedAt: null },
    { kind: 'notification.read', entityId: `all:${uid}`, payload: { all: true } },
    async () => {
      const {
        collection,
        query: buildQuery,
        where,
        getDocs,
        writeBatch,
      } = await import('firebase/firestore');
      const db = await firestoreDb();
      const snapshot = await getDocs(
        buildQuery(
          collection(db, COLLECTIONS.users, uid, COLLECTIONS.notifications),
          where('read', '==', false),
        ),
      );
      const batch = writeBatch(db);
      for (const document of snapshot.docs) {
        batch.update(document.ref, { read: true, readAt: now });
      }
      await batch.commit();
    },
  );

  return { marked: all.length, result };
}

/**
 * Counts unread notifications already on this device.
 * @param uid viewer account id
 * @returns the unread count
 */
export async function peekUnreadCount(uid: string): Promise<number> {
  const all = await mirrorList<BsdcNotification>('notifications', {
    where: [(notification: BsdcNotification) => notification.uid === uid],
  });
  return unreadCount(all);
}

/**
 * Watches the viewer's notifications and reports the unread count.
 * @param uid viewer account id
 * @param handler receives the unread count
 * @returns a release function
 */
export function watchUnreadCount(uid: string, handler: (count: number) => void): Unsubscribe {
  return acquireListener(`unread:${uid}`, 'notifications', async () => {
    const { collection, query: buildQuery, where, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      buildQuery(
        collection(db, COLLECTIONS.users, uid, COLLECTIONS.notifications),
        where('read', '==', false),
      ),
      (snapshot) => {
        handler(snapshot.size);
      },
    );
  });
}

/**
 * Watches the viewer's notification list live.
 * @param uid viewer account id
 * @param handler receives the notifications
 * @returns a release function
 */
export function watchNotifications(
  uid: string,
  handler: (notifications: readonly BsdcNotification[]) => void,
): Unsubscribe {
  return acquireListener(`notifications:${uid}`, 'notifications', async () => {
    const {
      collection,
      query: buildQuery,
      where,
      orderBy,
      limit,
      onSnapshot,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      buildQuery(
        collection(db, COLLECTIONS.users, uid, COLLECTIONS.notifications),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(NOTIFICATION_PAGE_SIZE),
      ),
      (snapshot) => {
        const notifications = fromQuery<BsdcNotification>(snapshot);
        void (async () => {
          const { mirrorMerge } = await import('@/services/offline/mirror');
          await mirrorMerge('notifications', notifications);
          handler(notifications);
        })();
      },
    );
  });
}
