/**
 * BSDC — src/entities/notification/model.ts
 * Purpose : The notification entity: construction, unread maths, ordering and icon choice.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The vocabulary — the type list and the shape of one notification — lives in
 *   `core/config/notifications` so the notification service can use it without importing upwards.
 *   What stays here is behaviour: how one is built, how many are unread, how they are ordered.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

export { NOTIFICATION_TYPES, unreadCount } from '@/core/config/notifications';
export type {
  BsdcNotification,
  NewNotificationInput,
  NotificationType,
} from '@/core/config/notifications';

import type {
  BsdcNotification,
  NewNotificationInput,
  NotificationType,
} from '@/core/config/notifications';

/**
 * Builds a notification entity.
 * @param input notification values
 * @returns a complete notification entity
 */
export function newNotification(input: NewNotificationInput): BsdcNotification {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id ?? `${input.type}-${Date.now()}-${input.uid.slice(0, 6)}`,
    uid: input.uid,
    type: input.type,
    actorUid: input.actorUid ?? '',
    actorName: input.actorName ?? '',
    actorPhotoUrl: input.actorPhotoUrl ?? '',
    targetPath: input.targetPath ?? '',
    targetLabelBn: input.targetLabelBn ?? '',
    targetLabelEn: input.targetLabelEn ?? '',
    bodyBn: input.bodyBn ?? '',
    bodyEn: input.bodyEn ?? '',
    read: false,
    readAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Reports the navigation icon that represents a notification type.
 * @param type notification type
 * @returns an icon name from the navigation icon registry
 */
export function notificationIcon(
  type: NotificationType,
): 'bell' | 'message' | 'users' | 'compass' | 'settings' | 'briefcase' | 'store' | 'home' {
  switch (type) {
    case 'reaction':
    case 'comment':
    case 'reply':
    case 'mention':
      return 'compass';
    case 'message':
      return 'message';
    case 'groupInvite':
    case 'groupJoin':
      return 'users';
    case 'jobApplication':
      return 'briefcase';
    case 'order':
    case 'payment':
      return 'store';
    case 'moderation':
      return 'settings';
    case 'follow':
      return 'home';
    case 'system':
      return 'bell';
    default:
      return 'bell';
  }
}

/**
 * Sorts notifications newest first with unread items ahead of read ones.
 * @param notifications the list
 * @returns a sorted copy
 */
export function sortNotifications(
  notifications: readonly BsdcNotification[],
): readonly BsdcNotification[] {
  return [...notifications].sort((left, right) => {
    if (left.read !== right.read) return left.read ? 1 : -1;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}
