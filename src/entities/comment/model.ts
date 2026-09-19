/**
 * BSDC — src/entities/comment/model.ts
 * Purpose : The comment entity: shape, defaults and threading rules.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Comments are one level deep by design: a reply attaches to the top-level comment and
 *   renders indented once. Deeper trees were tested against real Bangladeshi mobile screens and
 *   produced unreadable threads, so `parentId` exists but the UI never nests beyond one level.
 *   Author identity is denormalised for the same reason it is on posts: one read per thread.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import type { Role } from '@/core/config/permissions';
import type { ReactionType } from '@/core/config/reactions';
import { detectLanguage, sanitizeText } from '@/shared/lib/text';
import { uid } from '@/shared/lib/uid';

/** A comment on a post. */
export interface Comment {
  readonly id: string;
  readonly postId: string;
  readonly authorUid: string;
  readonly authorUsername: string;
  readonly authorDisplayName: string;
  readonly authorDisplayNameBn: string;
  readonly authorPhotoUrl: string;
  readonly authorRole: Role;
  readonly body: string;
  readonly language: 'bn' | 'en' | 'mixed';
  /** Top-level comment id for a reply; empty string for a top-level comment. */
  readonly parentId: string;
  readonly counts: { readonly reactions: number; readonly replies: number };
  readonly myReaction: ReactionType | null;
  readonly editedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Fields required to compose a comment. */
export interface NewCommentInput {
  readonly postId: string;
  readonly authorUid: string;
  readonly body: string;
  readonly parentId?: string | undefined;
  readonly author?:
    | {
        readonly username: string;
        readonly displayName: string;
        readonly displayNameBn: string;
        readonly photoUrl: string;
        readonly role: Role;
      }
    | undefined;
  readonly id?: string | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds a comment entity from composer input.
 * @param input composer values
 * @returns a complete comment entity
 */
export function newComment(input: NewCommentInput): Comment {
  const now = (input.now ?? new Date()).toISOString();
  const body = sanitizeText(input.body).slice(0, TEXT_LIMITS.comment);
  return {
    id: input.id ?? uid(),
    postId: input.postId,
    authorUid: input.authorUid,
    authorUsername: input.author?.username ?? '',
    authorDisplayName: input.author?.displayName ?? '',
    authorDisplayNameBn: input.author?.displayNameBn ?? '',
    authorPhotoUrl: input.author?.photoUrl ?? '',
    authorRole: input.author?.role ?? 'member',
    body,
    language: detectLanguage(body),
    parentId: input.parentId ?? '',
    counts: { reactions: 0, replies: 0 },
    myReaction: null,
    editedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Reports whether a comment is a reply.
 * @param comment the comment
 * @returns true when the comment hangs off another comment
 */
export function isReply(comment: Comment): boolean {
  return comment.parentId.length > 0;
}

/**
 * Groups comments into top-level comments with their replies attached, in chronological order.
 * @param comments flat comment list
 * @returns the threaded view
 */
export function threadComments(
  comments: readonly Comment[],
): readonly { readonly root: Comment; readonly replies: readonly Comment[] }[] {
  const roots = comments
    .filter((comment) => comment.parentId.length === 0)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  return roots.map((root) => ({
    root,
    replies: comments
      .filter((comment) => comment.parentId === root.id)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
  }));
}
