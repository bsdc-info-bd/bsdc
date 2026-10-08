import { POST_SELECT, toPost, type JoinedPostRow, type Post } from '@/lib/content/post-repository';
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  CommentRow,
  InteractionStateRow,
  NotificationRow,
  ToggleCommentReactionRow,
  ToggleReactionRow,
} from '@/lib/supabase/types';
import {
  EMPTY_INTERACTION,
  type AppNotification,
  type Comment,
  type CommentAuthor,
  type InteractionState,
  type Reaction,
  type ShareChannel,
} from './interaction-types';

interface AuthorJoin {
  uid: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

function toAuthor(row: AuthorJoin | null): CommentAuthor | null {
  if (row === null) return null;
  return {
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

// ----------------------------- reactions -----------------------------------

/** One round trip for a whole page of cards instead of one per card. */
export async function fetchInteractionState(
  postIds: readonly string[],
): Promise<Map<string, InteractionState>> {
  const state = new Map<string, InteractionState>();
  if (postIds.length === 0) return state;

  const { data, error } = await getSupabase()
    .rpc('post_interaction_state', { p_post_ids: [...postIds] })
    .returns<InteractionStateRow[]>();
  if (error) throw toDataError(error);

  for (const row of data ?? []) {
    state.set(row.post_id, { reaction: row.reaction, bookmarked: row.bookmarked });
  }
  for (const id of postIds) if (!state.has(id)) state.set(id, EMPTY_INTERACTION);
  return state;
}

export interface ReactionResult {
  reacted: boolean;
  reaction: Reaction;
  total: number;
}

export async function toggleReaction(postId: string, reaction: Reaction): Promise<ReactionResult> {
  const { data, error } = await getSupabase()
    .rpc('toggle_reaction', { p_post_id: postId, p_reaction: reaction })
    .returns<ToggleReactionRow[]>();
  if (error) throw toDataError(error);

  const row = data?.[0];
  if (row === undefined) return { reacted: false, reaction, total: 0 };
  return { reacted: row.reacted, reaction: row.reaction, total: row.total };
}

export async function toggleBookmark(postId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('toggle_bookmark', { p_post_id: postId });
  if (error) throw toDataError(error);
  return data === true;
}

export async function recordShare(postId: string, channel: ShareChannel): Promise<void> {
  const { error } = await getSupabase().rpc('record_share', {
    p_post_id: postId,
    p_channel: channel,
  });
  if (error) throw toDataError(error);
}

// ------------------------------ comments -----------------------------------

const COMMENT_SELECT = `
  id, post_id, author_uid, parent_id, root_id, depth, body, status,
  likes_count, replies_count, is_answer, edited_at, created_at, updated_at,
  profiles:author_uid (uid, username, display_name, avatar_url)
`;

type JoinedCommentRow = CommentRow & { profiles: AuthorJoin | null };

function toComment(row: JoinedCommentRow, liked: boolean): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    rootId: row.root_id,
    depth: row.depth,
    body: row.body,
    likes: row.likes_count,
    replies: row.replies_count,
    isAnswer: row.is_answer,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    author: toAuthor(row.profiles),
    liked,
  };
}

/**
 * The whole thread in two queries: the comments, then which of them this
 * member has already liked.
 */
export async function fetchComments(postId: string, viewerUid: string | null): Promise<Comment[]> {
  const { data, error } = await getSupabase()
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(500)
    .returns<JoinedCommentRow[]>();
  if (error) throw toDataError(error);

  const rows = data ?? [];
  if (viewerUid === null || rows.length === 0) {
    return rows.map((row) => toComment(row, false));
  }

  const { data: likes, error: likesError } = await getSupabase()
    .from('comment_reactions')
    .select('comment_id')
    .eq('uid', viewerUid)
    .in(
      'comment_id',
      rows.map((row) => row.id),
    );
  if (likesError) throw toDataError(likesError);

  const liked = new Set((likes ?? []).map((row) => row.comment_id));
  return rows.map((row) => toComment(row, liked.has(row.id)));
}

export async function createComment(
  postId: string,
  authorUid: string,
  body: string,
  parentId: string | null,
): Promise<Comment> {
  const { data, error } = await getSupabase()
    .from('comments')
    .insert({ post_id: postId, author_uid: authorUid, body: body.trim(), parent_id: parentId })
    .select(COMMENT_SELECT)
    .single<JoinedCommentRow>();
  if (error) throw toDataError(error);
  return toComment(data, false);
}

export async function updateComment(commentId: string, body: string): Promise<void> {
  const { error } = await getSupabase()
    .from('comments')
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw toDataError(error);
}

/** Moves a comment (or a reply) to the trash, where it stays thirty days. */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw toDataError(error);
}

/** Puts a comment back before its thirty days are up. */
export async function restoreComment(commentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('comments')
    .update({ deleted_at: null })
    .eq('id', commentId);
  if (error) throw toDataError(error);
}

/** Removes a comment and its replies for good, now. */
export async function deleteCommentForever(commentId: string): Promise<void> {
  const { error } = await getSupabase().from('comments').delete().eq('id', commentId);
  if (error) throw toDataError(error);
}

export async function toggleCommentReaction(
  commentId: string,
): Promise<{ reacted: boolean; total: number }> {
  const { data, error } = await getSupabase()
    .rpc('toggle_comment_reaction', { p_comment_id: commentId })
    .returns<ToggleCommentReactionRow[]>();
  if (error) throw toDataError(error);
  return data?.[0] ?? { reacted: false, total: 0 };
}

export async function markAnswer(commentId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('mark_answer', { p_comment_id: commentId });
  if (error) throw toDataError(error);
  return data === true;
}

// ---------------------------- notifications --------------------------------

type JoinedNotificationRow = NotificationRow & { actor: AuthorJoin | null };

export async function fetchNotifications(limit = 40): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select(
      'id, kind, body, post_id, comment_id, conversation_id, read_at, created_at, actor:actor_uid (uid, username, display_name, avatar_url)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<JoinedNotificationRow[]>();
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    body: row.body,
    postId: row.post_id,
    commentId: row.comment_id,
    conversationId: row.conversation_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    actor: toAuthor(row.actor),
  }));
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await getSupabase().rpc('unread_notification_count');
  if (error) throw toDataError(error);
  return typeof data === 'number' ? data : 0;
}

export async function markNotificationsRead(ids: string[] | null = null): Promise<number> {
  const { data, error } = await getSupabase().rpc('mark_notifications_read', { p_ids: ids });
  if (error) throw toDataError(error);
  return typeof data === 'number' ? data : 0;
}

// ------------------------------ bookmarks ----------------------------------

/** The member's saved posts, newest first. */
export async function fetchBookmarkedPosts(uid: string, limit = 50): Promise<Post[]> {
  const { data, error } = await getSupabase()
    .from('bookmarks')
    .select('post_id')
    .eq('uid', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toDataError(error);

  const ids = (data ?? []).map((row) => row.post_id);
  if (ids.length === 0) return [];

  const { data: posts, error: postsError } = await getSupabase()
    .from('posts')
    .select(POST_SELECT)
    .in('id', ids)
    .returns<JoinedPostRow[]>();
  if (postsError) throw toDataError(postsError);

  const order = new Map(ids.map((id, index) => [id, index]));
  return (posts ?? []).map(toPost).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
