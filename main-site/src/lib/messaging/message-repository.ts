import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { ConversationInboxRow, ConversationMemberRow, MessageRow } from '@/lib/supabase/types';
import type {
  ConversationMember,
  ConversationSummary,
  Message,
  MessageAuthor,
  MessageKind,
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
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    author: toAuthor(row.profiles),
  };
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
