/**
 * BSDC — src/entities/post/model.ts
 * Purpose : The post entity: shape, defaults, derived text and edit rights.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Author identity is denormalised onto the post (name, handle, avatar, role, badge) so
 *   rendering a feed page costs one read, not one read per card. Denormalised fields are
 *   refreshed by a Cloud Function when a profile changes; the UI never trusts them for
 *   authorisation — it trusts claims and rules.
 *   Counters live in the post document and are incremented transactionally server-side; the
 *   client shows optimistic values only until the next server snapshot arrives.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import type { Role } from '@/core/config/permissions';
import type { ReactionType } from '@/core/config/reactions';
import { detectLanguage, excerpt, sanitizeText } from '@/shared/lib/text';
import { uid } from '@/shared/lib/uid';

/** Who can see a post. */
export type PostVisibility = 'public' | 'followers' | 'group' | 'private';

/** The languages a post body may be written in. */
export type PostLanguage = 'bn' | 'en' | 'mixed';

/** An attached asset. BSDC stores no video, so a medium is an image or a document. */
export interface PostMedia {
  readonly kind: 'image' | 'document';
  readonly url: string;
  readonly provider: 'cloudinary' | 'imgbb';
  readonly remoteId: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  /** Alternative text. Required for images; empty alt is only valid for decorative separators. */
  readonly alt: string;
  /** Tiny blurred data URL shown while the full asset loads. */
  readonly blurPreview: string;
  readonly dominantColor: string;
}

/** Aggregated counters for a post. */
export interface PostCounts {
  readonly comments: number;
  readonly reactions: number;
  readonly shares: number;
  readonly saves: number;
  readonly views: number;
}

/** A feed, group or profile post. */
export interface Post {
  readonly id: string;
  readonly authorUid: string;
  readonly authorUsername: string;
  readonly authorDisplayName: string;
  readonly authorDisplayNameBn: string;
  readonly authorPhotoUrl: string;
  readonly authorRole: Role;
  readonly authorVerified: boolean;
  readonly body: string;
  readonly language: PostLanguage;
  readonly visibility: PostVisibility;
  readonly groupId: string;
  readonly media: readonly PostMedia[];
  readonly tags: readonly string[];
  readonly linkUrl: string;
  readonly linkTitle: string;
  readonly counts: PostCounts;
  /** The viewer's own reaction, present only in viewer-scoped reads. */
  readonly myReaction: ReactionType | null;
  readonly saved: boolean;
  readonly pinned: boolean;
  readonly editedAt: string | null;
  /** Set when the post is scheduled; the post is invisible until `publishedAt` is written. */
  readonly scheduledFor: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Fields required to compose a post. */
export interface NewPostInput {
  readonly authorUid: string;
  readonly body: string;
  readonly visibility?: PostVisibility | undefined;
  readonly groupId?: string | undefined;
  readonly media?: readonly PostMedia[] | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly linkUrl?: string | undefined;
  readonly linkTitle?: string | undefined;
  readonly scheduledFor?: string | null | undefined;
  readonly author?:
    | {
        readonly username: string;
        readonly displayName: string;
        readonly displayNameBn: string;
        readonly photoUrl: string;
        readonly role: Role;
        readonly verified: boolean;
      }
    | undefined;
  readonly id?: string | undefined;
  readonly now?: Date | undefined;
}

const EMPTY_COUNTS: PostCounts = { comments: 0, reactions: 0, shares: 0, saves: 0, views: 0 };

/**
 * Builds a post entity from composer input.
 * @param input composer values
 * @returns a complete post entity
 */
export function newPost(input: NewPostInput): Post {
  const now = (input.now ?? new Date()).toISOString();
  const body = sanitizeText(input.body).slice(0, TEXT_LIMITS.shortPost);
  const scheduled = input.scheduledFor ?? null;
  return {
    id: input.id ?? uid(),
    authorUid: input.authorUid,
    authorUsername: input.author?.username ?? '',
    authorDisplayName: input.author?.displayName ?? '',
    authorDisplayNameBn: input.author?.displayNameBn ?? '',
    authorPhotoUrl: input.author?.photoUrl ?? '',
    authorRole: input.author?.role ?? 'member',
    authorVerified: input.author?.verified ?? false,
    body,
    language: detectLanguage(body),
    visibility: input.visibility ?? 'public',
    groupId: input.groupId ?? '',
    media: input.media ?? [],
    tags: input.tags ?? [],
    linkUrl: input.linkUrl ?? '',
    linkTitle: input.linkTitle ?? '',
    counts: EMPTY_COUNTS,
    myReaction: null,
    saved: false,
    pinned: false,
    editedAt: null,
    scheduledFor: scheduled,
    publishedAt: scheduled === null ? now : null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Reports whether a post is waiting for its scheduled time.
 * @param post the post
 * @param now evaluation instant
 * @returns true when the post is scheduled but not yet published
 */
export function isScheduled(post: Post, now: Date = new Date()): boolean {
  if (post.scheduledFor === null) return false;
  return Date.parse(post.scheduledFor) > now.getTime();
}

/**
 * Reports whether a post may currently be shown.
 * @param post the post
 * @param now evaluation instant
 * @returns true when the post is published and not deleted
 */
export function isVisible(post: Post, now: Date = new Date()): boolean {
  if (post.deletedAt !== null) return false;
  if (post.scheduledFor === null) return true;
  return Date.parse(post.scheduledFor) <= now.getTime();
}

/**
 * Builds a short plain-text summary for share cards and link previews.
 * @param post the post
 * @param maxLength maximum length
 * @returns the excerpt
 */
export function postExcerpt(post: Post, maxLength = 155): string {
  if (post.body.trim().length > 0) return excerpt(post.body, maxLength);
  if (post.media.length > 0)
    return `${post.media.length} image${post.media.length === 1 ? '' : 's'}`;
  return post.linkTitle.length > 0 ? post.linkTitle : 'BSDC';
}

/**
 * Reports whether a person may edit a post.
 * @param post the post
 * @param uid viewer account id
 * @param role viewer role
 * @returns true when the viewer is the author or a moderator
 */
export function canEditPost(post: Post, uid: string | null, role: Role): boolean {
  if (uid === null) return false;
  if (post.authorUid === uid) return true;
  return role === 'moderator' || role === 'admin' || role === 'root';
}

/**
 * Reports whether a post carries anything worth publishing.
 * @param post the post
 * @returns true when there is text, media or a link
 */
export function hasContent(post: Post): boolean {
  return post.body.trim().length > 0 || post.media.length > 0 || post.linkUrl.trim().length > 0;
}

/**
 * Returns the post body trimmed to the composer ceiling.
 * @param body raw body
 * @returns the trimmed body
 */
export function clampBody(body: string): string {
  return body.slice(0, TEXT_LIMITS.shortPost);
}
