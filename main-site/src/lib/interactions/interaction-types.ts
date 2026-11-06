import type { DbNotificationKind, DbReaction } from '@/lib/supabase/types';

export type Reaction = DbReaction;

/** The order they appear in the reaction picker. */
export const REACTIONS: Reaction[] = ['like', 'insightful', 'celebrate', 'support', 'curious'];

export type ShareChannel =
  | 'copy'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'whatsapp'
  | 'telegram'
  | 'native';

export interface InteractionState {
  reaction: Reaction | null;
  bookmarked: boolean;
}

export const EMPTY_INTERACTION: InteractionState = { reaction: null, bookmarked: false };

export interface CommentAuthor {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  rootId: string | null;
  depth: number;
  body: string;
  likes: number;
  replies: number;
  isAnswer: boolean;
  createdAt: string;
  editedAt: string | null;
  author: CommentAuthor | null;
  liked: boolean;
}

/** A comment plus the comments that answer it, ready to render. */
export interface CommentNode extends Comment {
  children: CommentNode[];
}

export type NotificationKind = DbNotificationKind;

/**
 * One line in the inbox.
 *
 * A line is not a notification: `my_inbox` coalesces, so a thread with nine
 * messages is one line that says nine. `id` is therefore the newest
 * notification the line stands for — the row that is marked read and the row a
 * push would have been about — and `occurrences` is how many are behind it.
 *
 * `targetUrl` comes from the database rather than being assembled here, because
 * the push worker decides where a notification leads from the same function.
 * Two places disagreeing about that is a bug no member can report.
 */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  body: string;
  postId: string | null;
  commentId: string | null;
  /** Set on a `message` notification: the thread it opens. */
  conversationId: string | null;
  /** Where opening the line goes. Always a path on this site. */
  targetUrl: string;
  readAt: string | null;
  createdAt: string;
  /** Newest first: the moment the line is timestamped by. */
  lastAt: string;
  /** How many notifications this one line stands for. */
  occurrences: number;
  unreadCount: number;
  isUnread: boolean;
  actor: CommentAuthor | null;
}

/**
 * Builds the reply tree from a flat list. Orphans — a reply whose parent was
 * removed or filtered by a block — are promoted to the top level instead of
 * vanishing with their subtree.
 */
export function buildCommentTree(comments: readonly Comment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const comment of comments) nodes.set(comment.id, { ...comment, children: [] });

  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  const byOldest = (a: CommentNode, b: CommentNode): number =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt);

  const sortTree = (list: CommentNode[]): void => {
    list.sort(byOldest);
    for (const node of list) sortTree(node.children);
  };
  sortTree(roots);

  // An accepted answer always leads the thread.
  roots.sort((a, b) => Number(b.isAnswer) - Number(a.isAnswer));
  return roots;
}

export function countComments(nodes: readonly CommentNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countComments(node.children), 0);
}
