import { wakePushDelivery } from '@/lib/push/wake';
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { PollOptionRow, PostRow, TagRow } from '@/lib/supabase/types';
import type { DraftMedia, PostDraft, PostKind, PostStatus, Visibility } from './content-types';
import { extractMentions, normalizeTag, readingTimeMinutes, toExcerpt, uniqueSlug } from './text';

/** A post joined with everything a page needs to render it in one round trip. */
export interface PostAuthor {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
  position: number;
}

export interface PostMediaItem {
  mediaId: string;
  url: string;
  thumbUrl: string;
  altText: string;
  position: number;
  /**
   * The size the upload measured, in pixels. Null when a picture came from a
   * provider that was never asked. The feed layout is decided from these, so a
   * post can be arranged before any of its pictures have downloaded.
   */
  width: number | null;
  height: number | null;
}

export interface Post {
  id: string;
  slug: string;
  kind: PostKind;
  status: PostStatus;
  visibility: Visibility;
  title: string;
  body: string;
  excerpt: string;
  coverUrl: string;
  code: string;
  codeLanguage: string;
  language: 'bn' | 'en';
  readingTime: number;
  views: number;
  likes: number;
  comments: number;
  isSensitive: boolean;
  allowComments: boolean;
  publishedAt: string | null;
  editedAt: string | null;
  /** Set while the post sits in its author's deleted items. */
  deletedAt: string | null;
  createdAt: string;
  author: PostAuthor | null;
  tags: string[];
  media: PostMediaItem[];
  poll: PollOption[];
}

export interface JoinedPostRow extends PostRow {
  profiles?: {
    uid: string;
    username: string | null;
    display_name: string;
    avatar_url: string;
  } | null;
  post_tags?: { tag_slug: string }[] | null;
  poll_options?: PollOptionRow[] | null;
  post_media?:
    | {
        media_id: string;
        position: number;
        alt_text: string;
        media_assets: {
          url: string;
          thumb_url: string;
          width: number | null;
          height: number | null;
        } | null;
      }[]
    | null;
}

export const POST_SELECT = `
  *,
  profiles:author_uid (uid, username, display_name, avatar_url),
  post_tags (tag_slug),
  poll_options (id, post_id, position, label, votes),
  post_media (media_id, position, alt_text, media_assets (url, thumb_url, width, height))
`;

export function assertPostMediaLinked(media: readonly DraftMedia[]): void {
  if (media.some((item) => item.url.trim().length === 0 || item.mediaId.trim().length === 0)) {
    throw new Error('media.errors.recordFailed');
  }
}

export function toPost(row: JoinedPostRow): Post {
  const author = row.profiles
    ? {
        uid: row.profiles.uid,
        username: row.profiles.username ?? '',
        displayName: row.profiles.display_name,
        avatarUrl: row.profiles.avatar_url,
      }
    : null;

  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    visibility: row.visibility,
    title: row.title,
    body: row.body,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    code: row.code,
    codeLanguage: row.code_language,
    language: row.language === 'en' ? 'en' : 'bn',
    readingTime: row.reading_time,
    views: row.views_count,
    likes: row.likes_count,
    comments: row.comments_count,
    isSensitive: row.is_sensitive,
    allowComments: row.allow_comments,
    publishedAt: row.published_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    author,
    tags: (row.post_tags ?? []).map((tag) => tag.tag_slug),
    media: (row.post_media ?? [])
      .map((item) => ({
        mediaId: item.media_id,
        url: item.media_assets?.url ?? '',
        thumbUrl: item.media_assets?.thumb_url ?? '',
        altText: item.alt_text,
        position: item.position,
        width: item.media_assets?.width ?? null,
        height: item.media_assets?.height ?? null,
      }))
      // A deleted/unreadable metadata row must not become an empty src="" image
      // (which makes the browser request the post page as if it were a photo).
      .filter((item) => item.url.trim().length > 0)
      .sort((a, b) => a.position - b.position),
    poll: (row.poll_options ?? [])
      .map((option) => ({
        id: option.id,
        label: option.label,
        votes: option.votes,
        position: option.position,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

export async function fetchPostBySlug(slug: string): Promise<Post | null> {
  const { data, error } = await getSupabase()
    .from('posts')
    .select(POST_SELECT)
    .eq('slug', slug.toLowerCase())
    .maybeSingle<JoinedPostRow>();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  return data ? toPost(data) : null;
}

export async function fetchPostById(id: string): Promise<Post | null> {
  const { data, error } = await getSupabase()
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle<JoinedPostRow>();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  return data ? toPost(data) : null;
}

export async function fetchPostsByAuthor(
  authorUid: string,
  options: { includeDrafts?: boolean; limit?: number } = {},
): Promise<Post[]> {
  let query = getSupabase()
    .from('posts')
    .select(POST_SELECT)
    .eq('author_uid', authorUid)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 20);

  if (options.includeDrafts !== true) query = query.eq('status', 'published');

  const { data, error } = await query.returns<JoinedPostRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toPost);
}

export async function fetchPostsByTag(tagSlug: string, limit = 20): Promise<Post[]> {
  const supabase = getSupabase();
  const { data: links, error: linkError } = await supabase
    .from('post_tags')
    .select('post_id')
    .eq('tag_slug', tagSlug.toLowerCase())
    .limit(limit);
  if (linkError) throw toDataError(linkError);

  const ids = (links ?? []).map((link) => link.post_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .in('id', ids)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .returns<JoinedPostRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toPost);
}

export async function fetchTag(slug: string): Promise<TagRow | null> {
  const { data, error } = await getSupabase()
    .from('tags')
    .select('*')
    .eq('slug', slug.toLowerCase())
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  return data;
}

export async function fetchTags(limit = 40): Promise<TagRow[]> {
  const { data, error } = await getSupabase()
    .from('tags')
    .select('*')
    .order('posts_count', { ascending: false })
    .limit(limit);
  if (error) throw toDataError(error);
  return data ?? [];
}

/**
 * The poll options a post already carries, and the ballots on each one.
 *
 * Reading them before a save is what separates "the body changed" from "the
 * poll changed". Without it every edit rewrote the poll, and the rewrite
 * deleted the votes.
 */
export interface StoredPollOption {
  position: number;
  label: string;
  votes: number;
}

/**
 * Raised when an edit would change the options of a poll somebody has voted on.
 *
 * A poll that has votes is a record of what people answered. Its options are
 * frozen: the database refuses to delete a voted option (0121), and this stops
 * the save before the post row is touched, so the member reads a sentence
 * instead of half a save.
 */
export const POLL_LOCKED_MESSAGE = 'poll/options-locked';

export type PollWrite =
  | { write: false; labels: readonly string[] }
  | { write: true; labels: readonly string[] };

/**
 * Whether this save has to touch the poll at all.
 *
 * Three answers, and the first two are the ones that matter:
 *
 *  - **Unchanged.** Saving a post to fix a typo in its body used to delete and
 *    re-insert every option, which (a) destroyed the votes and (b) left a window
 *    where a reader saw a poll with no options. An unchanged poll is not written.
 *  - **Changed, nobody voted.** Replace it. A poll with no answers is a draft of
 *    a poll, and its author may still reword it.
 *  - **Changed, somebody voted.** Refuse. The sentence the member reads explains
 *    that the poll keeps its options; the alternative is silent data loss.
 */
export function decidePollWrite(
  stored: readonly StoredPollOption[],
  options: readonly string[],
): PollWrite {
  const labels = options.map((option) => option.trim()).filter(Boolean);
  const existing = [...stored].sort((a, b) => a.position - b.position);
  const unchanged =
    existing.length === labels.length && existing.every((option, i) => option.label === labels[i]);
  if (unchanged) return { write: false, labels };

  if (existing.some((option) => option.votes > 0)) {
    throw toDataError(new Error(POLL_LOCKED_MESSAGE));
  }

  return { write: true, labels };
}

/** The stored options of the post being edited, or none for a new post. */
async function readStoredPoll(postId: string | null): Promise<StoredPollOption[]> {
  if (!postId) return [];
  const { data, error } = await getSupabase()
    .from('poll_options')
    .select('position, label, votes')
    .eq('post_id', postId);
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    position: row.position,
    label: row.label,
    votes: row.votes,
  }));
}

export interface SaveResult {
  id: string;
  slug: string;
}

/**
 * Thrown from savePost when the author has no `profiles` row to publish
 * against. The composer's answer is onboarding, not a storage error.
 */
export const PROFILE_MISSING_MESSAGE = 'profile/missing';

/**
 * Creates or updates a post and all of its side tables. Publishing sets
 * `published_at`, which the database requires for any published row.
 */
/**
 * Saves a post — the row, its tags, its pictures, its mentions and its poll — in
 * one call, in one transaction.
 *
 * This used to be up to nine requests: the post row, then each of the four
 * attachments. If the fourth failed the post was already published without the
 * picture, without the tags and without the mention notification, and the member
 * was shown an error for a post that existed. `public.save_post` (0123) is the
 * same write in one statement, so a save either happened or did not.
 *
 * The author is the signed-in member (`bsdc.current_uid()` inside the function),
 * never a parameter a client could choose.
 *
 * The poll decision is still made here, before anything is written, so a poll
 * whose ballot exists is refused with a sentence rather than by a constraint —
 * and the database refuses it too, as the backstop for every other client.
 */
export async function savePost(
  draft: PostDraft,
  status: Extract<PostStatus, 'draft' | 'published'>,
): Promise<SaveResult> {
  // Fail before creating or updating the post. A UI preview is not an attached
  // image until both its hosted URL and its media_assets foreign key exist.
  assertPostMediaLinked(draft.media);
  const supabase = getSupabase();
  // Decided before the post is written, so a poll whose votes are frozen stops
  // the save instead of leaving the post updated and the poll half-rewritten.
  const pollPlan =
    draft.kind === 'poll'
      ? decidePollWrite(await readStoredPoll(draft.id), draft.pollOptions)
      : null;
  const body = draft.body.trim();
  const title = draft.title.trim();
  const fallbackSlug = draft.kind === 'snippet' ? 'snippet' : draft.kind;
  const slug = uniqueSlug(title.length > 0 ? title : toExcerpt(body, 48), fallbackSlug);

  const { data, error } = await supabase.rpc('save_post', {
    p_id: draft.id ?? null,
    p_slug: slug,
    p_post: {
      kind: draft.kind,
      status,
      visibility: draft.visibility,
      title,
      body,
      excerpt: toExcerpt(body.length > 0 ? body : title),
      cover_url: draft.coverUrl,
      language: draft.language,
      code: draft.code,
      code_language: draft.kind === 'snippet' ? draft.codeLanguage : '',
      reading_time: readingTimeMinutes(`${title} ${body} ${draft.code}`),
      is_sensitive: draft.isSensitive,
      allow_comments: draft.allowComments,
    },
    // The arrays are the whole post's worth, not a patch: the save replaces what
    // the post carried, exactly as the four syncs did.
    p_tags: [...new Set(draft.tags.map(normalizeTag).filter((tag) => tag.length >= 2))],
    p_media: draft.media
      .filter((item) => item.mediaId.length > 0)
      .map((item, index) => ({
        media_id: item.mediaId,
        position: index,
        alt_text: item.altText,
      })),
    p_mentions: extractMentions(body),
    p_poll: pollPlan?.write ? [...pollPlan.labels] : null,
  });

  if (error) {
    // The author's profile is the only foreign key a save can trip on this table,
    // and the member reads a sentence that sends them to onboarding.
    if (error.code === '23503') throw toDataError(new Error(PROFILE_MISSING_MESSAGE));
    throw toDataError(error);
  }

  const saved = data as { id: string; slug: string } | null;
  if (!saved?.id) throw toDataError(new Error('data/insert-failed'));

  if (status === 'published') wakePushDelivery();

  return { id: saved.id, slug: saved.slug };
}

/**
 * Deletes a post into the trash: the row leaves every reader's view and stays
 * recoverable for thirty days, which is what the delete button promises.
 */
export async function deletePost(postId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw toDataError(error);
}

/** Puts a post back before its thirty days are up. */
export async function restorePost(postId: string): Promise<void> {
  const { error } = await getSupabase().from('posts').update({ deleted_at: null }).eq('id', postId);
  if (error) throw toDataError(error);
}

/**
 * Removes the post and everything under it for good, now. The author may
 * always do this; waiting out the thirty days is a choice, not a requirement.
 */
export async function deletePostForever(postId: string): Promise<void> {
  const { error } = await getSupabase().from('posts').delete().eq('id', postId);
  if (error) throw toDataError(error);
}

export async function castPollVote(postId: string, optionId: string): Promise<void> {
  const { error } = await getSupabase().rpc('cast_poll_vote', {
    p_post_id: postId,
    p_option_id: optionId,
  });
  if (error) throw toDataError(error);
}

export async function fetchMyPollVote(postId: string, uid: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('poll_votes')
    .select('option_id')
    .eq('post_id', postId)
    .eq('voter_uid', uid)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  return data?.option_id ?? null;
}

/** View counting is fire-and-forget: it must never block a reader. */
export async function registerPostView(postId: string): Promise<void> {
  await getSupabase().rpc('increment_post_view', { p_post_id: postId });
}
