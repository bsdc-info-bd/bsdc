import type { DbConversationKind, DbMemberRole, DbMessageKind } from '@/lib/supabase/types';

export type ConversationKind = DbConversationKind;
export type MessageKind = DbMessageKind;
export type MemberRole = DbMemberRole;

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  avatarUrl: string;
  lastMessageAt: string | null;
  preview: string;
  unread: number;
  muted: boolean;
  /** For a direct chat: the other participant, used for name and avatar. */
  other: { uid: string; username: string; displayName: string; avatarUrl: string } | null;
}

export interface MessageAuthor {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderUid: string | null;
  kind: MessageKind;
  body: string;
  mediaUrl: string;
  mediaName: string;
  codeLanguage: string;
  replyTo: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: MessageAuthor | null;
}

export interface ConversationMember {
  uid: string;
  role: MemberRole;
  lastReadAt: string;
  leftAt: string | null;
  profile: MessageAuthor | null;
}

/** A run of consecutive messages from one sender, rendered as one bubble group. */
export interface MessageGroup {
  senderUid: string | null;
  author: MessageAuthor | null;
  messages: Message[];
  startedAt: string;
}

const GROUP_WINDOW_MS = 5 * 60_000;

/**
 * Groups consecutive messages from the same sender sent within five minutes.
 * A deleted message still occupies its slot so the conversation keeps its
 * shape — the body is replaced at render time, not dropped here.
 */
export function groupMessages(messages: readonly Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const message of messages) {
    const last = groups.at(-1);
    const withinWindow =
      last !== undefined &&
      last.senderUid === message.senderUid &&
      Date.parse(message.createdAt) -
        Date.parse(last.messages[last.messages.length - 1]?.createdAt ?? message.createdAt) <
        GROUP_WINDOW_MS;

    if (withinWindow && last !== undefined) {
      last.messages.push(message);
    } else {
      groups.push({
        senderUid: message.senderUid,
        author: message.author,
        messages: [message],
        startedAt: message.createdAt,
      });
    }
  }

  return groups;
}

/**
 * How many members have read up to this message. Read state is derived from
 * each member's last_read_at rather than stored per message, which keeps the
 * write path to a single row per member.
 */
export function readCount(
  message: Message,
  members: readonly ConversationMember[],
  viewerUid: string,
): number {
  const sentAt = Date.parse(message.createdAt);
  return members.filter(
    (member) =>
      member.uid !== viewerUid &&
      member.uid !== message.senderUid &&
      Date.parse(member.lastReadAt) >= sentAt,
  ).length;
}

/** The name to show for a conversation in the inbox and the header. */
export function conversationName(conversation: ConversationSummary, fallback: string): string {
  if (conversation.kind === 'group') {
    return conversation.title.length > 0 ? conversation.title : fallback;
  }
  return conversation.other?.displayName ?? fallback;
}

/** Everyone typing right now, excluding the viewer and stale signals. */
export function activeTypers(
  signals: Readonly<Record<string, number>>,
  viewerUid: string,
  now: number,
  windowMs = 6_000,
): string[] {
  return Object.entries(signals)
    .filter(([uid, at]) => uid !== viewerUid && now - at < windowMs)
    .map(([uid]) => uid)
    .sort();
}
