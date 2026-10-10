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
  /** The body of the line this message answers, so a reply can quote it. */
  replyBody: string | null;
  replySender: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: MessageAuthor | null;
  /** Emoji → how many members chose it. */
  reactions: Record<string, number>;
  /** The reactions this member chose. */
  myReactions: string[];
  /** Members other than the sender who have read this line. */
  readBy: string[];
  /** Saved by the viewer, privately. */
  starred: boolean;
  /** Pinned in the conversation, for everyone. */
  pinned: boolean;
  /**
   * Set only on a line the viewer just sent and the server has not confirmed:
   * `pending` while in flight, `failed` when it did not land. Server rows
   * never carry it.
   */
  clientState?: 'pending' | 'failed';
}

/** The per-member state of one conversation. */
export interface ConversationState {
  muted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  draftBody: string;
  lastReadAt: string;
}

/** A pinned line, as the conversation's pin list returns it. */
export interface ConversationPin {
  messageId: string;
  body: string;
  senderUid: string | null;
  mediaName: string;
  kind: MessageKind;
  pinnedAt: string;
  pinnedBy: string;
}

/** A line the viewer saved, from anywhere the viewer can read. */
export interface SavedMessage {
  messageId: string;
  conversationId: string;
  body: string;
  mediaName: string;
  kind: MessageKind;
  createdAt: string;
}

/** A hit from in-thread search. */
export interface MessageSearchHit {
  messageId: string;
  conversationId: string;
  senderUid: string | null;
  body: string;
  createdAt: string;
}

/** Which conversations the inbox is showing. */
export type InboxFilter = 'all' | 'unread' | 'direct' | 'groups' | 'pinned' | 'archived';

/** Pinned first, then the most recent activity, then stable by id. */
export function sortConversations(
  summaries: readonly ConversationSummary[],
  pinned: ReadonlySet<string> = new Set(),
): ConversationSummary[] {
  return [...summaries].sort((a, b) => {
    const aPinned = pinned.has(a.id) ? 1 : 0;
    const bPinned = pinned.has(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aAt = a.lastMessageAt ?? '';
    const bAt = b.lastMessageAt ?? '';
    if (aAt !== bAt) return aAt < bAt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}

/** Whether one conversation belongs in the current filter. */
export function matchesFilter(
  summary: ConversationSummary,
  filter: InboxFilter,
  query = '',
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length > 0) {
    const haystack = `${summary.title} ${summary.other?.displayName ?? ''} ${
      summary.other?.username ?? ''
    } ${summary.preview}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  switch (filter) {
    case 'unread':
      return summary.unread > 0;
    case 'direct':
      return summary.kind === 'direct';
    case 'groups':
      return summary.kind === 'group';
    default:
      return true;
  }
}

/**
 * Folds one live message into the list the thread is showing: an insert lands
 * in time order, an update or delete replaces the row in place. Returns the
 * same array when nothing changed, so React can skip a render.
 */
export function upsertMessage(list: readonly Message[], incoming: Message): Message[] {
  const at = list.findIndex((message) => message.id === incoming.id);
  if (at < 0) {
    let index = list.length;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const candidate = list[i];
      if (candidate !== undefined && candidate.createdAt <= incoming.createdAt) {
        index = i + 1;
        break;
      }
      index = i;
    }
    return [...list.slice(0, index), incoming, ...list.slice(index)];
  }
  const current = list[at];
  if (current !== undefined && sameMessage(current, incoming)) return list as Message[];
  const next = [...list];
  next[at] = incoming;
  return next;
}

/** Cheap equality for the fields that are rendered. */
export function sameMessage(a: Message, b: Message): boolean {
  return (
    a.body === b.body &&
    a.editedAt === b.editedAt &&
    a.deletedAt === b.deletedAt &&
    a.readBy.length === b.readBy.length &&
    a.starred === b.starred &&
    a.pinned === b.pinned &&
    JSON.stringify(a.reactions) === JSON.stringify(b.reactions) &&
    a.myReactions.join(',') === b.myReactions.join(',')
  );
}

/** An empty message for a row that only carries a key. */
export function blankMessage(row: {
  id: string;
  conversation_id: string;
  created_at: string;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUid: null,
    kind: 'text',
    body: '',
    mediaUrl: '',
    mediaName: '',
    codeLanguage: '',
    replyTo: null,
    replyBody: null,
    replySender: null,
    editedAt: null,
    deletedAt: null,
    createdAt: row.created_at,
    author: null,
    reactions: {},
    myReactions: [],
    readBy: [],
    starred: false,
    pinned: false,
  };
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
