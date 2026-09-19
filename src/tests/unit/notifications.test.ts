/**
 * BSDC — src/tests/unit/notifications.test.ts
 * Purpose : Proves notification preferences, grouping, urgency and the manual-broadcast law.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Three promises are tested here because they are the ones a person feels. Nothing is
 *   pushed to a device unless that person asked for that type on that channel. A quiet night holds
 *   the noise but never holds a moderation decision or a security notice. And a broadcast is
 *   drafted by a human and sent by a human — there is no code path that sends one on its own, which
 *   is asserted by looking for the absence of the capability rather than the presence of a comment.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_QUIET_HOURS,
  channelsFor,
  defaultPreferences,
  isQuietHour,
  mayPush,
  preferenceTypes,
  serialisePreferences,
} from '@/services/notifications/preferences';
import {
  digestLine,
  groupKey,
  groupNotifications,
  hasSeen,
  isCollapsible,
  markSeen,
  resetSeen,
  splitByUrgency,
} from '@/services/notifications/engine';
import {
  BROADCAST_LIMITS,
  automationRule,
  newBroadcast,
  validateBroadcast,
} from '@/services/notifications/oneSignal';
import { newNotification, unreadCount } from '@/entities/notification/model';
import type { BsdcNotification, NotificationType } from '@/core/config/notifications';

const NOW = new Date('2026-06-01T06:00:00.000Z');

/**
 * Fields a test may override. The set is deliberately wider than the construction input: a test
 * has to be able to hand back a notification that is already read or already taken down, and
 * neither of those is something a client is allowed to create.
 */
interface NotificationOverrides {
  readonly id?: string | undefined;
  readonly uid?: string | undefined;
  readonly type?: NotificationType | undefined;
  readonly actorUid?: string | undefined;
  readonly actorName?: string | undefined;
  readonly actorPhotoUrl?: string | undefined;
  readonly targetPath?: string | undefined;
  readonly targetLabelBn?: string | undefined;
  readonly targetLabelEn?: string | undefined;
  readonly bodyBn?: string | undefined;
  readonly bodyEn?: string | undefined;
  readonly read?: boolean | undefined;
  readonly readAt?: string | null | undefined;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly deletedAt?: string | null | undefined;
}

/**
 * Builds a notification the way the platform would, with the fields a test needs to vary.
 * @param overrides fields to change
 * @returns a complete notification
 */
function notification(overrides: NotificationOverrides = {}): BsdcNotification {
  const base = newNotification({
    uid: overrides.uid ?? 'viewer',
    type: overrides.type ?? 'comment',
    actorUid: overrides.actorUid ?? 'a1',
    actorName: overrides.actorName ?? 'Tanvir',
    actorPhotoUrl: overrides.actorPhotoUrl ?? '',
    targetPath: overrides.targetPath ?? '/post/p1',
    targetLabelBn: overrides.targetLabelBn ?? 'একটি পোস্ট',
    targetLabelEn: overrides.targetLabelEn ?? 'A post',
    bodyBn: overrides.bodyBn ?? 'একটি মন্তব্য',
    bodyEn: overrides.bodyEn ?? 'A comment',
    ...(overrides.id === undefined ? {} : { id: overrides.id }),
    now: overrides.createdAt === undefined ? NOW : new Date(overrides.createdAt),
  });
  return {
    ...base,
    ...(overrides.read === undefined ? {} : { read: overrides.read }),
    ...(overrides.readAt === undefined ? {} : { readAt: overrides.readAt }),
    ...(overrides.createdAt === undefined ? {} : { createdAt: overrides.createdAt }),
    ...(overrides.updatedAt === undefined ? {} : { updatedAt: overrides.updatedAt }),
    ...(overrides.deletedAt === undefined ? {} : { deletedAt: overrides.deletedAt }),
  };
}

afterEach(() => {
  resetSeen();
});

describe('preferences', () => {
  it('delivers every type in-app, and keeps the noisy ones off a device by default', () => {
    const defaults = defaultPreferences();
    for (const type of preferenceTypes()) {
      expect(defaults[type].inApp).toBe(true);
    }
    for (const quiet of ['reaction', 'follow', 'groupJoin'] as const) {
      expect(defaults[quiet].push).toBe(false);
    }
    // Someone replying to you, or a decision about your account, does reach the device.
    expect(defaults.reply.push).toBe(true);
    expect(defaults.moderation.push).toBe(true);
  });

  it('falls back to the safe default for a type the stored object does not mention', () => {
    const stored: Partial<
      Record<NotificationType, { inApp: boolean; push: boolean; email: boolean }>
    > = {
      reaction: { inApp: true, push: true, email: true },
    };
    expect(channelsFor(stored, 'groupJoin').push).toBe(false);
    expect(channelsFor(null, 'groupJoin').inApp).toBe(true);
  });

  it('honours a stored preference when one exists', () => {
    const stored = { comment: { inApp: true, push: true, email: false } };
    expect(channelsFor(stored, 'comment').push).toBe(true);
  });

  it('holds a quiet window that crosses midnight', () => {
    const quiet = { enabled: true, startHour: 22, endHour: 7 };
    expect(isQuietHour(quiet, 23)).toBe(true);
    expect(isQuietHour(quiet, 2)).toBe(true);
    expect(isQuietHour(quiet, 9)).toBe(false);
  });

  it('holds nothing when quiet hours are switched off', () => {
    expect(isQuietHour(DEFAULT_QUIET_HOURS, 23)).toBe(false);
  });

  it('never holds a moderation decision or a security notice', () => {
    const quiet = { enabled: true, startHour: 22, endHour: 7 };
    const prefs: Partial<
      Record<NotificationType, { inApp: boolean; push: boolean; email: boolean }>
    > = {
      moderation: { inApp: true, push: true, email: false },
      system: { inApp: true, push: true, email: false },
      comment: { inApp: true, push: true, email: false },
    };
    expect(mayPush(prefs, 'moderation', quiet, 23)).toBe(true);
    expect(mayPush(prefs, 'system', quiet, 23)).toBe(true);
    expect(mayPush(prefs, 'comment', quiet, 23)).toBe(false);
  });

  it('refuses a push when the person did not ask for one', () => {
    const prefs: Partial<
      Record<NotificationType, { inApp: boolean; push: boolean; email: boolean }>
    > = {
      comment: { inApp: true, push: false, email: false },
    };
    expect(mayPush(prefs, 'comment', DEFAULT_QUIET_HOURS, 12)).toBe(false);
  });

  it('drops unknown types when writing, so a bad payload cannot widen what we may send', () => {
    const written = serialisePreferences({
      comment: { inApp: true, push: true, email: false },
      invented: { inApp: true, push: true, email: true },
    } as unknown as Parameters<typeof serialisePreferences>[0]);
    expect(Object.keys(written)).toContain('comment');
    expect(Object.keys(written)).not.toContain('invented');
  });
});

describe('grouping', () => {
  it('folds several reactors on one post into a single line', () => {
    const groups = groupNotifications([
      notification({ id: 'n1', actorUid: 'a1', actorName: 'Tanvir', type: 'reaction' }),
      notification({ id: 'n2', actorUid: 'a2', actorName: 'Ayesha', type: 'reaction' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.actors).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('keeps one line per message, even on the same thread', () => {
    const groups = groupNotifications([
      notification({ id: 'm1', type: 'message', actorUid: 'a1' }),
      notification({ id: 'm2', type: 'message', actorUid: 'a1' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('names the collapsible types', () => {
    expect(isCollapsible('reaction')).toBe(true);
    expect(isCollapsible('message')).toBe(false);
    expect(isCollapsible('moderation')).toBe(false);
  });

  it('gives a target-less notification its own key', () => {
    const orphan = notification({ id: 'o1', type: 'follow', targetPath: '' });
    expect(groupKey(orphan)).toBe('follow:o1');
  });

  it('ignores notifications that were removed', () => {
    const groups = groupNotifications([
      notification({ id: 'n1', deletedAt: '2026-06-02T00:00:00.000Z' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('counts the unread inside a group', () => {
    const groups = groupNotifications([
      notification({ id: 'n1', read: false, type: 'reaction' }),
      notification({ id: 'n2', read: true, type: 'reaction' }),
    ]);
    expect(groups[0]?.unread).toBe(1);
  });
});

describe('urgency and the dedupe ledger', () => {
  it('holds ordinary noise during a quiet window and keeps messages and moderation', () => {
    const { immediate, deferred } = splitByUrgency(
      [
        notification({ id: 'n1', type: 'reaction' }),
        notification({ id: 'n2', type: 'message' }),
        notification({ id: 'n3', type: 'moderation' }),
      ],
      true,
    );
    expect(immediate.map((entry) => entry.id)).toEqual(['n2', 'n3']);
    expect(deferred.map((entry) => entry.id)).toEqual(['n1']);
  });

  it('holds nothing at all outside a quiet window', () => {
    const { deferred } = splitByUrgency([notification({ id: 'n1', type: 'reaction' })], false);
    expect(deferred).toHaveLength(0);
  });

  it('announces a notification once per device session', () => {
    const first = notification({ id: 'n1' });
    expect(markSeen([first])).toHaveLength(1);
    expect(markSeen([first])).toHaveLength(0);
    expect(hasSeen(first)).toBe(true);
  });

  it('clears the ledger on sign-out', () => {
    markSeen([notification({ id: 'n1' }), notification({ id: 'n2' })]);
    expect(resetSeen()).toBe(2);
  });

  it('builds one sentence out of a held pile', () => {
    const templates = {
      single: '{actor} reacted to your post',
      many: '{actor} and {count} others reacted to your post',
      singleOther: '{actor} and others reacted to your post',
      manyOther: '{actor} and {count} others reacted to your post',
    };
    expect(digestLine([], templates)).toBe('');
    const one = digestLine([notification({ id: 'n1', actorName: 'Tanvir' })], templates);
    expect(one).toBe('Tanvir reacted to your post');
    const many = digestLine(
      [
        notification({ id: 'n1', actorName: 'Tanvir' }),
        notification({ id: 'n2', actorName: 'Ayesha' }),
      ],
      templates,
    );
    expect(many).toContain('Tanvir');
    expect(many).toContain('1');
  });
});

describe('unread counting', () => {
  it('counts only what has not been read', () => {
    expect(
      unreadCount([
        notification({ id: 'n1', read: false }),
        notification({ id: 'n2', read: true }),
      ]),
    ).toBe(1);
  });
});

describe('LAW-09: broadcasts are sent by a person', () => {
  const input = {
    authorUid: 'admin1',
    authorName: 'Rizwan Rahim Chowdhury',
    title: 'BSDC meetup this Friday',
    body: 'Doors open at six in the evening at the SUST auditorium.',
    audience: 'members' as const,
    channel: 'push' as const,
  };

  it('creates every broadcast as a draft', () => {
    expect(newBroadcast(input).status).toBe('draft');
  });

  it('refuses a broadcast with nothing to say', () => {
    expect(validateBroadcast({ ...input, body: 'short' })).toBe('BSDC-PUSH-004');
    expect(validateBroadcast({ ...input, title: 'x' })).toBe('BSDC-PUSH-004');
    expect(validateBroadcast(input)).toBeNull();
  });

  it('enforces the same length limits the composer shows', () => {
    const atLimit = 'x'.repeat(BROADCAST_LIMITS.bodyMax);
    expect(validateBroadcast({ ...input, body: atLimit })).toBeNull();
  });

  it('states the rule in words rather than in a comment', () => {
    expect(automationRule()).toContain('person');
  });

  it('offers no scheduling, trigger or automation surface at all', () => {
    const surface = Object.getOwnPropertyNames(newBroadcast(input));
    for (const forbidden of [
      'schedule',
      'scheduledFor',
      'cron',
      'trigger',
      'automation',
      'recurring',
    ]) {
      expect(surface).not.toContain(forbidden);
    }
  });
});

describe('notification types stay in step', () => {
  it('lists every type the entity knows in the settings screen', () => {
    const types: readonly NotificationType[] = [
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
    ];
    expect(preferenceTypes()).toEqual(types);
  });
});
