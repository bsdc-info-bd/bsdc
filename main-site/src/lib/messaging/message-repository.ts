import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  SavedMessageRow,
  ConversationInboxRow,
  ConversationMemberRow,
  ConversationMessageRow,
  ConversationPinRow,
  ConversationStateRow,
  MessageRow,
  MessageSearchRow,
  ToggleMessageReactionRow,
} from '@/lib/supabase/types';
import type {
  SavedMessage,
  ConversationMember,
  ConversationPin,
  ConversationState,
  ConversationSummary,
  Message,
  MessageAuthor,
  MessageKind,
  MessageSearchHit,
} from './message-types';

interface ProfileJoin {
  uid: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

function toAuthor(row: ProfileJoin | null): MessageAuthor | null {
  if (row === null) return null;
  return {
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

function toSummary(row: ConversationInboxRow): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    avatarUrl: row.avatar_url,
    lastMessageAt: row.last_message_at,
    preview: row.last_message_preview,
    unread: row.unread_count,
    muted: row.muted,
    other:
      row.other_uid === null
        ? null
        : {
            uid: row.other_uid,
            username: row.other_username ?? '',
            displayName: row.other_name ?? '',
            avatarUrl: row.other_avatar ?? '',
          },
  };
}

export async function fetchInbox(limit = 40): Promise<ConversationSummary[]> {
  const { data, error } = await getSupabase()
    .rpc('conversation_inbox', { p_limit: limit })
    .returns<ConversationInboxRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toSummary);
}

export async function fetchUnreadMessageCount(): Promise<number> {
  const { data, error } = await getSupabase().rpc('unread_message_count');
  if (error) throw toDataError(error);
  return typeof data === 'number' ? data : 0;
}

type JoinedMessageRow = MessageRow & { profiles: ProfileJoin | null };

const MESSAGE_SELECT = `
  id, conversation_id, sender_uid, kind, body, media_url, media_name,
  code_language, reply_to, edited_at, deleted_at, created_at,
  profiles:sender_uid (uid, username, display_name, avatar_url)
`;

function toMessage(row: JoinedMessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUid: row.sender_uid,
    kind: row.kind,
    body: row.body,
    mediaUrl: row.media_url,
    mediaName: row.media_name,
    codeLanguage: row.code_language,
    replyTo: row.reply_to,
    replyBody: null,
    replySender: null,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    author: toAuthor(row.profiles),
    reactions: {},
    myReactions: [],
    readBy: [],
    starred: false,
    pinned: false,
  };
}

/** One line as `conversation_messages` returns it, plus its author. */
export function toConversationMessage(
  row: ConversationMessageRow,
  author: MessageAuthor | null,
): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUid: row.sender_uid,
    kind: row.kind,
    body: row.body,
    mediaUrl: row.media_url,
    mediaName: row.media_name,
    codeLanguage: row.code_language,
    replyTo: row.reply_to,
    replyBody: row.reply_body,
    replySender: row.reply_sender,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    author,
    reactions: row.reactions ?? {},
    myReactions: row.my_reactions ?? [],
    readBy: row.read_by ?? [],
    starred: row.starred,
    pinned: row.pinned,
  };
}

/** The authors of the lines in one page, in a single profile read. */
async function authorsFor(uids: readonly string[]): Promise<Map<string, MessageAuthor>> {
  const wanted = [...new Set(uids.filter((uid) => uid.length > 0))];
  if (wanted.length === 0) return new Map();
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('uid, username, display_name, avatar_url')
    .in('uid', wanted)
    .returns<ProfileJoin[]>();
  if (error) throw toDataError(error);
  const authors = new Map<string, MessageAuthor>();
  for (const row of data ?? []) {
    const author = toAuthor(row);
    if (author !== null) authors.set(author.uid, author);
  }
  return authors;
}

/**
 * One page of a conversation with everything the thread renders: reactions,
 * the reader's own reactions, receipts, stars, pins and the quoted line. The
 * heavy lifting is done in Postgres so the whole thread is one round trip.
 */
export async function fetchConversationMessages(
  conversationId: string,
  before: string | null = null,
  limit = 60,
): Promise<Message[]> {
  const { data, error } = await getSupabase()
    .rpc('conversation_messages', {
      p_conversation_id: conversationId,
      p_before: before,
      p_limit: limit,
    })
    .returns<ConversationMessageRow[]>();
  if (error) throw toDataError(error);
  const rows = data ?? [];
  const authors = await authorsFor(rows.map((row) => row.sender_uid ?? ''));
  return rows
    .map((row) => toConversationMessage(row, authors.get(row.sender_uid ?? '') ?? null))
    .reverse();
}

/** The viewer's settings and read marker for one conversation. */
export async function fetchConversationState(
  conversationId: string,
): Promise<ConversationState | null> {
  const { data, error } = await getSupabase()
    .rpc('conversation_state', { p_conversation_id: conversationId })
    .returns<ConversationStateRow[]>();
  if (error) throw toDataError(error);
  const row = data?.[0];
  if (row === undefined) return null;
  return {
    muted: row.muted,
    isPinned: row.is_pinned,
    isArchived: row.is_archived,
    draftBody: row.draft_body,
    lastReadAt: row.last_read_at,
  };
}

/**
 * The viewer's own member rows: pinned, archived and muted, keyed by
 * conversation. One read, so the inbox can sort and filter without touching
 * anybody else's row.
 */
export async function fetchMyConversationSettings(): Promise<
  Map<string, { pinned: boolean; archived: boolean; muted: boolean }>
> {
  const { data, error } = await getSupabase()
    .from('conversation_members')
    .select('conversation_id, is_pinned, is_archived, muted_until')
    .returns<
      Pick<ConversationMemberRow, 'conversation_id' | 'is_pinned' | 'is_archived' | 'muted_until'>[]
    >();
  if (error) throw toDataError(error);
  const map = new Map<string, { pinned: boolean; archived: boolean; muted: boolean }>();
  for (const row of data ?? []) {
    map.set(row.conversation_id, {
      pinned: row.is_pinned,
      archived: row.is_archived,
      muted: row.muted_until !== null && Date.parse(row.muted_until) > Date.now(),
    });
  }
  return map;
}

/** The conversation's pinned lines, most recent pin first. */
export async function fetchPinnedMessages(conversationId: string): Promise<ConversationPin[]> {
  const { data, error } = await getSupabase()
    .rpc('conversation_pins', { p_conversation_id: conversationId })
    .returns<ConversationPinRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    messageId: row.message_id,
    body: row.body,
    senderUid: row.sender_uid,
    mediaName: row.media_name,
    kind: row.kind,
    pinnedAt: row.pinned_at,
    pinnedBy: row.pinned_by,
  }));
}

export async function searchMessages(
  query: string,
  conversationId: string | null = null,
  limit = 40,
): Promise<MessageSearchHit[]> {
  const { data, error } = await getSupabase()
    .rpc('search_messages', {
      p_query: query,
      p_conversation_id: conversationId,
      p_limit: limit,
    })
    .returns<MessageSearchRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    senderUid: row.sender_uid,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/** Everything the viewer has saved, newest save first. */
export async function fetchSavedMessages(limit = 50): Promise<SavedMessage[]> {
  const { data, error } = await getSupabase()
    .rpc('saved_messages', { p_limit: limit })
    .returns<SavedMessageRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    body: row.body,
    mediaName: row.media_name,
    kind: row.kind,
    createdAt: row.created_at,
  }));
}

export interface ReactionResult {
  reacted: boolean;
  reaction: string;
  total: number;
}

/** Adds the reaction if it is absent, removes it if it is there. */
export async function toggleMessageReaction(
  messageId: string,
  reaction: string,
): Promise<ReactionResult> {
  const { data, error } = await getSupabase()
    .rpc('toggle_message_reaction', { p_message_id: messageId, p_reaction: reaction })
    .returns<ToggleMessageReactionRow[]>();
  if (error) throw toDataError(error);
  const row = data?.[0];
  return {
    reacted: row?.reacted ?? false,
    reaction: row?.reaction ?? reaction,
    total: row?.total ?? 0,
  };
}

/** Marks one line read, which also moves the conversation's read marker. */
export async function markMessageRead(messageId: string): Promise<void> {
  const { error } = await getSupabase().rpc('mark_message_read', { p_message_id: messageId });
  if (error) throw toDataError(error);
}

export async function toggleMessagePin(messageId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('toggle_message_pin', {
    p_message_id: messageId,
  });
  if (error) throw toDataError(error);
  return data === true;
}

export async function toggleMessageStar(messageId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('toggle_message_star', {
    p_message_id: messageId,
  });
  if (error) throw toDataError(error);
  return data === true;
}

/** Pin, archive and the shared draft live on the member's own row. */
export async function updateConversationSettings(
  conversationId: string,
  uid: string,
  patch: Partial<Pick<ConversationMemberRow, 'is_pinned' | 'is_archived' | 'draft_body'>>,
): Promise<void> {
  const { error } = await getSupabase()
    .from('conversation_members')
    .update(patch)
    .eq('conversation_id', conversationId)
    .eq('uid', uid);
  if (error) throw toDataError(error);
}

/** Newest first from the database, returned oldest first for rendering. */
export async function fetchMessages(
  conversationId: string,
  before: string | null,
  limit = 50,
): Promise<Message[]> {
  let query = getSupabase()
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before !== null) query = query.lt('created_at', before);

  const { data, error } = await query.returns<JoinedMessageRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toMessage).reverse();
}

export interface SendMessageInput {
  conversationId: string;
  body: string;
  kind?: MessageKind;
  mediaUrl?: string;
  mediaName?: string;
  codeLanguage?: string;
  replyTo?: string | null;
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const { data, error } = await getSupabase()
    .rpc('send_message', {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_kind: input.kind ?? 'text',
      p_media_url: input.mediaUrl ?? '',
      p_media_name: input.mediaName ?? '',
      p_code_language: input.codeLanguage ?? '',
      p_reply_to: input.replyTo ?? null,
    })
    .returns<MessageRow>();
  if (error) throw toDataError(error);
  return toMessage({ ...data, profiles: null });
}

export async function editMessage(messageId: string, body: string): Promise<void> {
  const { error } = await getSupabase()
    .from('messages')
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw toDataError(error);
}

/** Messages are tombstoned, never erased, so replies keep their context. */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('messages')
    .update({ body: '', deleted_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw toDataError(error);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await getSupabase().rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw toDataError(error);
}

export async function leaveConversation(conversationId: string): Promise<void> {
  const { error } = await getSupabase().rpc('leave_conversation', {
    p_conversation_id: conversationId,
  });
  if (error) throw toDataError(error);
}

export async function openDirectConversation(otherUid: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('open_direct_conversation', {
    p_other_uid: otherUid,
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

/**
 * Turns a username (with or without the @) or a raw uid into the member's
 * uid, so the start-a-conversation form can accept whatever people paste.
 */
export async function resolveMemberUid(handle: string): Promise<string> {
  const value = handle.trim().replace(/^@/, '');
  if (value.length === 0) throw new Error('member not found');
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('uid')
    .or(`username.eq.${value},uid.eq.${value}`)
    .limit(1)
    .returns<Array<Pick<ProfileJoin, 'uid'>>>();
  if (error) throw toDataError(error);
  const uid = data?.[0]?.uid;
  if (uid === undefined) throw new Error('member not found');
  return uid;
}

export async function createGroupConversation(
  title: string,
  members: readonly string[],
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_group_conversation', {
    p_title: title,
    p_members: [...members],
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

type JoinedMemberRow = ConversationMemberRow & { profiles: ProfileJoin | null };

export async function fetchMembers(conversationId: string): Promise<ConversationMember[]> {
  const { data, error } = await getSupabase()
    .from('conversation_members')
    .select(
      'conversation_id, uid, role, joined_at, last_read_at, muted_until, left_at, profiles:uid (uid, username, display_name, avatar_url)',
    )
    .eq('conversation_id', conversationId)
    .returns<JoinedMemberRow[]>();
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    uid: row.uid,
    role: row.role,
    lastReadAt: row.last_read_at,
    leftAt: row.left_at,
    profile: toAuthor(row.profiles),
  }));
}

export async function setConversationMuted(
  conversationId: string,
  uid: string,
  muted: boolean,
): Promise<void> {
  const until = muted ? new Date(Date.now() + 365 * 24 * 3_600_000).toISOString() : null;
  const { error } = await getSupabase()
    .from('conversation_members')
    .update({ muted_until: until })
    .eq('conversation_id', conversationId)
    .eq('uid', uid);
  if (error) throw toDataError(error);
}
