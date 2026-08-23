/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { collection, limit, onSnapshot, orderBy, query, updateDoc, doc, writeBatch, getDocs } from 'firebase/firestore';
import { COL, fsDb, normalizeUser, pushNotification } from './firestore';
import type { AppNotification, NotificationType } from '@/types/domain';
import { SUPERADMIN_EMAIL } from '@/config/constants';
import type { UserProfile } from '@/types/user';

export function onNotifications(
  uid: string,
  cb: (items: AppNotification[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = query(collection(fsDb(), COL.notifications, uid, 'items'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AppNotification, 'id'>),
      }));
      cb(items);
    },
    (e) => onError?.(e),
  );
}

export async function markNotificationRead(uid: string, notifId: string): Promise<void> {
  await updateDoc(doc(fsDb(), COL.notifications, uid, 'items', notifId), { read: true });
}

export async function markAllNotificationsRead(uid: string): Promise<void> {
  const q = query(collection(fsDb(), COL.notifications, uid, 'items'), orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  const batch = writeBatch(fsDb());
  snap.docs.filter((d) => !(d.data().read as boolean)).forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  title: string;
  body?: string;
  link?: string;
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  if (input.actorId === input.userId) return; // never self-notify
  await pushNotification(input.userId, {
    userId: input.userId,
    type: input.type,
    actorId: input.actorId,
    actorName: input.actorName,
    actorAvatar: input.actorAvatar,
    title: input.title,
    body: input.body || '',
    link: input.link || '/',
    read: false,
  });
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  await Promise.all(userIds.filter((uid) => uid !== input.actorId).map((uid) => notifyUser({ ...input, userId: uid })));
}

/** Broadcast an announcement to every user account (admin action). */
export async function broadcastToAllUsers(actor: UserProfile, title: string, body: string, link = '/'): Promise<number> {
  const snap = await getDocs(collection(fsDb(), COL.users));
  const users = snap.docs.map((d) => normalizeUser(d.data(), d.id)).filter((u) => u.role !== 'banned');
  const chunks: UserProfile[][] = [];
  for (let i = 0; i < users.length; i += 400) chunks.push(users.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = writeBatch(fsDb());
    for (const u of chunk) {
      batch.set(doc(fsDb(), COL.notifications, u.uid, 'items', `${Date.now()}_${u.uid.slice(0, 6)}`), {
        userId: u.uid,
        type: 'admin_announcement',
        actorId: actor.uid,
        actorName: actor.displayName,
        actorAvatar: actor.avatar,
        title,
        body,
        link,
        read: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }
  return users.length;
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && email!.toLowerCase() === SUPERADMIN_EMAIL;
}
