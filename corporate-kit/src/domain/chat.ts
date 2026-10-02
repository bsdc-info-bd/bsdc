/**
 * Corporate chat helpers. Messages live in the bsdc-second realtime
 * database; who may read a channel is a row in Postgres. These functions
 * cover the parts that are pure: paths, ordering, unread counts and the
 * grouping the transcript renders.
 */

export type ChatMessage = {
  readonly id: string;
  readonly channelId: string;
  readonly authorUid: string;
  readonly authorName: string;
  readonly body: string;
  readonly sentAt: number;
};

export type ChannelSummary = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly minRole: string;
  readonly lastReadAt: number | null;
};

/** Realtime path for a channel's messages, within the corporate namespace. */
export function channelPath(channelId: string): string {
  return `corporate/channels/${channelId}/messages`;
}

/** Realtime path for a member's presence marker. */
export function presencePath(channelId: string, uid: string): string {
  return `corporate/channels/${channelId}/presence/${uid}`;
}

/** Messages newer than the member's last read marker. */
export function unreadCount(messages: readonly ChatMessage[], lastReadAt: number | null): number {
  if (lastReadAt === null) return messages.length;
  return messages.filter((message) => message.sentAt > lastReadAt).length;
}

export type MessageGroup = {
  readonly authorUid: string;
  readonly authorName: string;
  readonly startedAt: number;
  readonly messages: readonly ChatMessage[];
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Consecutive messages from one person within five minutes read as one turn
 * in a conversation, so the transcript shows the name once.
 */
export function groupMessages(messages: readonly ChatMessage[]): readonly MessageGroup[] {
  const ordered = [...messages].sort((a, b) => a.sentAt - b.sentAt);
  const groups: MessageGroup[] = [];
  for (const message of ordered) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.authorUid === message.authorUid &&
      message.sentAt - (last.messages[last.messages.length - 1]?.sentAt ?? 0) <= GROUP_WINDOW_MS
    ) {
      groups[groups.length - 1] = { ...last, messages: [...last.messages, message] };
      continue;
    }
    groups.push({
      authorUid: message.authorUid,
      authorName: message.authorName,
      startedAt: message.sentAt,
      messages: [message],
    });
  }
  return groups;
}

export const MESSAGE_MAX = 2000;

export type DraftCheck =
  { readonly ok: true; readonly body: string } | { readonly ok: false; readonly reason: string };

/** Trims a draft and explains why an unsendable one cannot be sent. */
export function checkDraft(raw: string): DraftCheck {
  const body = raw.replace(/\s+$/g, '').replace(/^\s+/g, '');
  if (body.length === 0) return { ok: false, reason: 'Write something first.' };
  if (body.length > MESSAGE_MAX) {
    return { ok: false, reason: `Messages are at most ${MESSAGE_MAX} characters.` };
  }
  return { ok: true, body };
}

/** Clock time for a message, in the 24-hour form the team uses. */
export function messageTime(sentAt: number, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(sentAt));
}
