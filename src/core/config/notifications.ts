/**
 * BSDC — src/core/config/notifications.ts
 * Purpose : The vocabulary of notifications: which kinds exist, and the shape of one.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These types live in `core` rather than in the entity because the notification service —
 *   which decides whether anything is sent at all — sits below `entities` in the layer order
 *   (ADR-003) and must not import upwards. Putting the vocabulary at the bottom is what lets a
 *   preference decision and an entity share one vocabulary without a forbidden import.
 *   A notification is written by a Cloud Function and fanned out through the Realtime Database; the
 *   durable copy lives at `users/{uid}/notifications/{id}`. Clients never create one — the only
 *   client writes are `read` and `readAt`, which is exactly what the rules allow.
 *   Every notification carries the route it opens and a bilingual label for the thing it is about,
 *   so rendering one never needs a second read to find out what was reacted to.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Every notification the platform can send. */
export const NOTIFICATION_TYPES = [
  'reaction',
  'comment',
  'reply',
  'mention',
  'follow',
  'message',
  'groupInvite',
  'groupJoin',
  'jobApplication',
  'order',
  'payment',
  'moderation',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A notification. */
export interface BsdcNotification {
  readonly id: string;
  readonly uid: string;
  readonly type: NotificationType;
  readonly actorUid: string;
  readonly actorName: string;
  readonly actorPhotoUrl: string;
  /** In-app route the notification opens. */
  readonly targetPath: string;
  /** Short label describing the target, e.g. the post excerpt. */
  readonly targetLabelBn: string;
  readonly targetLabelEn: string;
  readonly bodyBn: string;
  readonly bodyEn: string;
  readonly read: boolean;
  readonly readAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Fields required to record a notification. */
export interface NewNotificationInput {
  readonly uid: string;
  readonly type: NotificationType;
  readonly actorUid?: string | undefined;
  readonly actorName?: string | undefined;
  readonly actorPhotoUrl?: string | undefined;
  readonly targetPath?: string | undefined;
  readonly targetLabelBn?: string | undefined;
  readonly targetLabelEn?: string | undefined;
  readonly bodyBn?: string | undefined;
  readonly bodyEn?: string | undefined;
  readonly id?: string | undefined;
  readonly now?: Date | undefined;
}

/**
 * Counts the notifications a person has not read yet.
 * @param notifications the notifications to count
 * @returns how many are unread
 */
export function unreadCount(notifications: readonly BsdcNotification[]): number {
  return notifications.filter((notification) => !notification.read).length;
}
