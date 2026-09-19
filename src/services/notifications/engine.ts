/**
 * BSDC — src/services/notifications/engine.ts
 * Purpose : The fan-in: grouping, deduplication and digests on top of raw notifications.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Five people reacting to one post is one story, not five. The engine collapses repeated
 *   notifications about the same target into a single line — "Rahim and 4 others reacted" — and
 *   keeps the actor list so the line can name the person who started it. Deduplication then drops
 *   a notification this device has already rendered, which is what stops a reconnect from
 *   replaying the last hour of the community's enthusiasm.
 *   Grouping is a presentation concern decided here, not on the server: the durable record stays
 *   one document per event, so a person can always expand a line and see exactly what happened.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { BsdcNotification, NotificationType } from '@/core/config/notifications';
import { unreadCount } from '@/core/config/notifications';

/** One grouped line in the notification centre. */
export interface NotificationGroup {
  /** Grouping key: the target route, or a synthetic key for target-less types. */
  readonly key: string;
  readonly type: NotificationType;
  readonly targetPath: string;
  /** Distinct actors, most recent first. */
  readonly actors: readonly {
    readonly uid: string;
    readonly name: string;
    readonly photoUrl: string;
  }[];
  /** Every notification folded into this group, newest first. */
  readonly items: readonly BsdcNotification[];
  readonly latestAt: string;
  readonly unread: number;
  readonly labelBn: string;
  readonly labelEn: string;
}

/** Types where several actors on one target read as a single event. */
const COLLAPSIBLE: readonly NotificationType[] = [
  'reaction',
  'comment',
  'reply',
  'follow',
  'groupJoin',
];

/**
 * Reports whether a type collapses several actors into one line.
 * @param type the notification type
 * @returns true when the type is collapsible
 */
export function isCollapsible(type: NotificationType): boolean {
  return COLLAPSIBLE.includes(type);
}

/**
 * Builds the grouping key of a notification.
 * @param notification the notification
 * @returns the key
 */
export function groupKey(notification: BsdcNotification): string {
  if (isCollapsible(notification.type) && notification.targetPath.length > 0) {
    return `${notification.type}:${notification.targetPath}`;
  }
  return `${notification.type}:${notification.id}`;
}

/**
 * Groups notifications into lines, newest first, unread groups ahead of fully-read ones.
 * @param notifications the notifications
 * @returns the groups
 */
export function groupNotifications(
  notifications: readonly BsdcNotification[],
): readonly NotificationGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, BsdcNotification[]>();
  for (const notification of notifications) {
    if (notification.deletedAt !== null) continue;
    const key = groupKey(notification);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)?.push(notification);
  }

  const groups: NotificationGroup[] = [];
  for (const key of order) {
    const items = (byKey.get(key) ?? [])
      .slice()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const first = items[0];
    if (first === undefined) continue;
    const actors: { readonly uid: string; readonly name: string; readonly photoUrl: string }[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.actorUid.length === 0 || seen.has(item.actorUid)) continue;
      seen.add(item.actorUid);
      actors.push({ uid: item.actorUid, name: item.actorName, photoUrl: item.actorPhotoUrl });
    }
    groups.push({
      key,
      type: first.type,
      targetPath: first.targetPath,
      actors,
      items,
      latestAt: first.createdAt,
      unread: unreadCount(items),
      labelBn: first.targetLabelBn,
      labelEn: first.targetLabelEn,
    });
  }

  return groups.sort((left, right) => {
    const leftRead = left.unread === 0;
    const rightRead = right.unread === 0;
    if (leftRead !== rightRead) return leftRead ? 1 : -1;
    return Date.parse(right.latestAt) - Date.parse(left.latestAt);
  });
}

/**
 * Renders the actor line of a group: one name, two names, or "Name and N others".
 * @param group the group
 * @param locale viewer locale
 * @param templates the translated fragments, so the copy stays in the dictionary
 * @returns the actor line
 */
export function actorLine(
  group: NotificationGroup,
  locale: 'bn' | 'en',
  templates: { readonly one: string; readonly two: string; readonly many: string },
): string {
  const names = group.actors.map((actor) => actor.name).filter((name) => name.length > 0);
  const [first, second] = names;
  if (first === undefined) return '';
  if (names.length === 1) return first;
  if (names.length === 2 && second !== undefined) {
    return templates.two.replace('{first}', first).replace('{second}', second);
  }
  return templates.many
    .replace('{first}', first)
    .replace('{count}', locale === 'bn' ? String(names.length - 1) : String(names.length - 1));
}

/** A deduplication ledger kept for the lifetime of a session. */
const seen = new Set<string>();

/**
 * Reports whether a notification has already been rendered on this device this session.
 * @param notification the notification
 * @returns true when it is a repeat
 */
export function hasSeen(notification: BsdcNotification): boolean {
  return seen.has(notification.id);
}

/**
 * Marks notifications as seen, so a reconnect does not re-announce them.
 * @param notifications the notifications
 * @returns the ones that had not been seen before
 */
export function markSeen(notifications: readonly BsdcNotification[]): readonly BsdcNotification[] {
  const fresh: BsdcNotification[] = [];
  for (const notification of notifications) {
    if (seen.has(notification.id)) continue;
    seen.add(notification.id);
    fresh.push(notification);
  }
  return fresh;
}

/**
 * Forgets the dedupe ledger. Called on sign-out so a second account on the same device starts
 * from a clean slate.
 * @returns the number of entries cleared
 */
export function resetSeen(): number {
  const count = seen.size;
  seen.clear();
  return count;
}

/**
 * Splits notifications into the ones that should be announced right now and the ones that belong
 * in a digest: quiet-hour noise is held, moderation and security are never held.
 * @param notifications the notifications
 * @param quiet true when the viewer is inside their quiet window
 * @returns the immediate notifications and the deferred ones
 */
export function splitByUrgency(
  notifications: readonly BsdcNotification[],
  quiet: boolean,
): {
  readonly immediate: readonly BsdcNotification[];
  readonly deferred: readonly BsdcNotification[];
} {
  const immediate: BsdcNotification[] = [];
  const deferred: BsdcNotification[] = [];
  for (const notification of notifications) {
    const urgent =
      notification.type === 'moderation' ||
      notification.type === 'system' ||
      notification.type === 'message';
    if (!quiet || urgent) immediate.push(notification);
    else deferred.push(notification);
  }
  return { immediate, deferred };
}

/**
 * Builds one digest line from held notifications, so the morning brings a sentence and not a storm.
 * @param notifications the deferred notifications
 * @param templates the translated fragments
 * @returns the digest line, or an empty string when there is nothing to say
 */
export function digestLine(
  notifications: readonly BsdcNotification[],
  templates: {
    readonly single: string;
    readonly many: string;
    readonly singleOther: string;
    readonly manyOther: string;
  },
): string {
  if (notifications.length === 0) return '';
  if (notifications.length === 1) {
    const first = notifications[0];
    if (first === undefined) return '';
    return templates.single.replace('{actor}', first.actorName);
  }
  const first = notifications[0];
  return templates.many
    .replace('{actor}', first?.actorName ?? '')
    .replace('{count}', String(notifications.length - 1));
}
