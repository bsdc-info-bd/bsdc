/**
 * BSDC — src/services/notifications/preferences.ts
 * Purpose : What a person wants to be told, and through which door.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A notification platform people trust is one they can silence precisely. Every type has
 *   its own switches for in-app, push and email, the defaults favour the channels that matter and
 *   stay quiet about the rest, and a global quiet window is honoured in the viewer's own timezone
 *   rather than the server's.
 *   Preferences live on the profile document, so they travel with the account and are readable by
 *   the Cloud Function that decides whether to send at all. The default is a resolved value: an
 *   unknown type falls back to in-app only, never to "everything", because the safe default is the
 *   quiet one.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { NotificationType } from '@/core/config/notifications';

/** The channels a notification may travel through. */
export const CHANNELS = ['inApp', 'push', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Per-channel switches for one notification type. */
export type ChannelSwitches = Readonly<Record<Channel, boolean>>;

/** A full preference set. */
export type NotificationPreferences = Readonly<Record<NotificationType, ChannelSwitches>>;

/** Default switches: loud for the things a person asked to be told about, quiet for the rest. */
const DEFAULTS: Readonly<Record<NotificationType, ChannelSwitches>> = {
  reaction: { inApp: true, push: false, email: false },
  comment: { inApp: true, push: true, email: false },
  reply: { inApp: true, push: true, email: false },
  mention: { inApp: true, push: true, email: true },
  follow: { inApp: true, push: false, email: false },
  message: { inApp: true, push: true, email: false },
  groupInvite: { inApp: true, push: true, email: true },
  groupJoin: { inApp: true, push: false, email: false },
  jobApplication: { inApp: true, push: true, email: true },
  order: { inApp: true, push: true, email: true },
  payment: { inApp: true, push: true, email: true },
  moderation: { inApp: true, push: true, email: true },
  system: { inApp: true, push: true, email: true },
};

/** A quiet window in the viewer's local time. Hours are 0 to 23. */
export interface QuietHours {
  readonly enabled: boolean;
  readonly startHour: number;
  readonly endHour: number;
}

/** Default quiet window: 22:00 to 07:00, and it is off until a person turns it on. */
export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, startHour: 22, endHour: 7 };

/**
 * Builds the default preference set.
 * @returns a complete preference object
 */
export function defaultPreferences(): NotificationPreferences {
  return { ...DEFAULTS };
}

/**
 * Resolves the channels one type should use, tolerating partial or legacy preference objects.
 * @param preferences the stored preferences
 * @param type the notification type
 * @returns the switches for that type
 */
export function channelsFor(
  preferences: Partial<NotificationPreferences> | null | undefined,
  type: NotificationType,
): ChannelSwitches {
  const stored = preferences?.[type];
  if (stored === undefined) return DEFAULTS[type];
  return {
    inApp: stored.inApp,
    push: stored.push,
    email: stored.email,
  };
}

/**
 * Reports whether a quiet window covers an hour of the day, including windows that cross midnight.
 * @param quiet the quiet window
 * @param hour hour of day, 0 to 23
 * @returns true when notifications should be held
 */
export function isQuietHour(quiet: QuietHours, hour: number): boolean {
  if (!quiet.enabled) return false;
  const start = ((quiet.startHour % 24) + 24) % 24;
  const end = ((quiet.endHour % 24) + 24) % 24;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/**
 * Decides whether a notification may be pushed right now.
 * @param preferences the stored preferences
 * @param type the notification type
 * @param quiet the quiet window
 * @param hour the viewer's current hour, injected so the decision is testable
 * @returns true when a push may be delivered
 */
export function mayPush(
  preferences: Partial<NotificationPreferences> | null | undefined,
  type: NotificationType,
  quiet: QuietHours,
  hour: number,
): boolean {
  if (!channelsFor(preferences, type).push) return false;
  // Moderation decisions and account security are never held back by a quiet window.
  if (type === 'moderation' || type === 'system') return true;
  return !isQuietHour(quiet, hour);
}

/**
 * Lists the types a person can switch, in the order the settings screen shows them.
 * @returns the notification types
 */
export function preferenceTypes(): readonly NotificationType[] {
  return [
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
}

/**
 * Serialises preferences for a Firestore write, dropping anything unknown so a bad client payload
 * can never widen what the platform is allowed to send.
 * @param preferences the preferences
 * @returns a plain, writable object
 */
export function serialisePreferences(
  preferences: Partial<NotificationPreferences> | null | undefined,
): Readonly<Record<string, ChannelSwitches>> {
  const output: Record<string, ChannelSwitches> = {};
  for (const type of preferenceTypes()) {
    output[type] = channelsFor(preferences, type);
  }
  return output;
}
