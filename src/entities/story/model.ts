/**
 * BSDC — src/entities/story/model.ts
 * Purpose : The Real Story entity: a 24-hour frame of someone's day, and nothing more.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A story is the one thing on the platform that is allowed to disappear. It expires
 *   twenty-four hours after it is published (RETENTION.storyHours) and is then purged, not
 *   archived: the promise of a story is that it does not follow you. Video is refused everywhere
 *   on BSDC, so a story is a still image with a caption and nothing else.
 *   `expiresAt` is written by the client at creation time and is the field the reader trusts, so
 *   a story is gone at the same instant for everyone regardless of who asks.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { RETENTION, TEXT_LIMITS } from '@/core/config/limits';
import { uid } from '@/shared/lib/uid';

/** Who may see a story. */
export type StoryVisibility = 'public' | 'followers';

/** A story. */
export interface Story {
  readonly id: string;
  readonly authorUid: string;
  readonly authorName: string;
  readonly authorNameBn: string;
  readonly authorUsername: string;
  readonly authorPhotoUrl: string;
  readonly mediaUrl: string;
  /** Tiny inline preview shown while the full image loads. */
  readonly blurDataUrl: string;
  readonly caption: string;
  readonly visibility: StoryVisibility;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** ISO instant the story stops being visible. Never extended. */
  readonly expiresAt: string;
  readonly viewCount: number;
  readonly deletedAt: string | null;
}

/** Values needed to publish a story. */
export interface NewStoryInput {
  readonly authorUid: string;
  readonly authorName: string;
  readonly authorNameBn: string;
  readonly authorUsername: string;
  readonly authorPhotoUrl: string;
  readonly mediaUrl: string;
  readonly caption: string;
  readonly visibility?: StoryVisibility | undefined;
  readonly blurDataUrl?: string | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds a story entity with its expiry already resolved.
 * @param input story values
 * @returns a complete story entity
 */
export function newStory(input: NewStoryInput): Story {
  const now = input.now ?? new Date();
  const expires = new Date(now.getTime() + RETENTION.storyHours * 3_600_000);
  return {
    id: uid(20),
    authorUid: input.authorUid,
    authorName: input.authorName,
    authorNameBn: input.authorNameBn,
    authorUsername: input.authorUsername,
    authorPhotoUrl: input.authorPhotoUrl,
    mediaUrl: input.mediaUrl,
    blurDataUrl: input.blurDataUrl ?? '',
    caption: input.caption.slice(0, TEXT_LIMITS.storyCaption),
    visibility: input.visibility ?? 'public',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    viewCount: 0,
    deletedAt: null,
  };
}

/**
 * Reports whether a story has passed its expiry.
 * @param story the story
 * @param now optional instant, injected by tests
 * @returns true when the story must no longer be shown
 */
export function isExpired(story: Story, now: Date = new Date()): boolean {
  if (story.deletedAt !== null) return true;
  return Date.parse(story.expiresAt) <= now.getTime();
}

/**
 * Whole hours left before a story expires, floored at zero.
 * @param story the story
 * @param now optional instant
 * @returns hours remaining
 */
export function hoursRemaining(story: Story, now: Date = new Date()): number {
  const remaining = Date.parse(story.expiresAt) - now.getTime();
  if (remaining <= 0) return 0;
  return Math.floor(remaining / 3_600_000);
}

/**
 * Progress through a story's life, 0 at publication and 1 at expiry.
 * @param story the story
 * @param now optional instant
 * @returns a fraction between 0 and 1
 */
export function storyProgress(story: Story, now: Date = new Date()): number {
  const start = Date.parse(story.createdAt);
  const end = Date.parse(story.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

/**
 * Splits a list into the stories that are still live and the ones that are not.
 * @param stories the stories
 * @param now optional instant
 * @returns the live stories and the expired ones
 */
export function partitionByExpiry(
  stories: readonly Story[],
  now: Date = new Date(),
): { readonly live: readonly Story[]; readonly expired: readonly Story[] } {
  const live: Story[] = [];
  const expired: Story[] = [];
  for (const story of stories) {
    if (isExpired(story, now)) expired.push(story);
    else live.push(story);
  }
  return { live, expired };
}

/**
 * Groups stories by author in the order the authors first appear, so a rail shows one ring per
 * person no matter how many frames they posted.
 * @param stories the stories, newest first
 * @param now optional instant
 * @returns one entry per author, frames newest first
 */
export function groupByAuthor(
  stories: readonly Story[],
  now: Date = new Date(),
): readonly { readonly authorUid: string; readonly frames: readonly Story[] }[] {
  const order: string[] = [];
  const byAuthor = new Map<string, Story[]>();
  for (const story of stories) {
    if (isExpired(story, now)) continue;
    if (!byAuthor.has(story.authorUid)) {
      byAuthor.set(story.authorUid, []);
      order.push(story.authorUid);
    }
    byAuthor.get(story.authorUid)?.push(story);
  }
  return order.map((authorUid) => ({
    authorUid,
    frames: (byAuthor.get(authorUid) ?? [])
      .slice()
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
  }));
}
