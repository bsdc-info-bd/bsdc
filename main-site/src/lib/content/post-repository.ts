import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { PollOptionRow, PostRow, TagRow } from '@/lib/supabase/types';
import type { PostDraft, PostKind, PostStatus, Visibility } from './content-types';
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
        media_assets: { url: string; thumb_url: string } | null;
      }[]
    | null;
}

export const POST_SELECT = `
  *,
  profiles:author_uid (uid, username, display_name, avatar_url),
  post_tags (tag_slug),
  poll_options (id, post_id, position, label, votes),
  post_media (media_id, position, alt_text, media_assets (url, thumb_url))
`;

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
      }))
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

async function syncTags(postId: string, tags: readonly string[]): Promise<void> {
  const supabase = getSupabase();
  const slugs = [...new Set(tags.map(normalizeTag).filter((tag) => tag.length >= 2))];

  const { error: clearError } = await supabase.from('post_tags').delete().eq('post_id', postId);
  if (clearError) throw toDataError(clearError);
  if (slugs.length === 0) return;

  // Only tags that exist in the curated vocabulary are attached; unknown
  // words are dropped rather than silently creating new taxonomy.
  const { data: known, error: knownError } = await supabase
    .from('tags')
    .select('slug')
    .in('slug', slugs);
  if (knownError) throw toDataError(knownError);

  const rows = (known ?? []).map((tag) => ({ post_id: postId, tag_slug: tag.slug }));
  if (rows.length === 0) return;

  const { error } = await supabase.from('post_tags').insert(rows);
  if (error) throw toDataError(error);
}

async function syncMedia(postId: string, draft: PostDraft): Promise<void> {
  const supabase = getSupabase();
  const { error: clearError } = await supabase.from('post_media').delete().eq('post_id', postId);
  if (clearError) throw toDataError(clearError);

  const rows = draft.media
    .filter((item) => item.mediaId.length > 0)
    .map((item, index) => ({
      post_id: postId,
      media_id: item.mediaId,
      position: index,
      alt_text: item.altText,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from('post_media').insert(rows);
  if (error) throw toDataError(error);
}

async function syncMentions(postId: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const handles = extractMentions(body);

  const { error: clearError } = await supabase.from('post_mentions').delete().eq('post_id', postId);
  if (clearError) throw toDataError(clearError);
  if (handles.length === 0) return;

  const { data: people, error: peopleError } = await supabase
    .from('profiles')
    .select('uid')
    .in('username', handles);
  if (peopleError) throw toDataError(peopleError);

  const rows = (people ?? []).map((person) => ({
    post_id: postId,
    mentioned_uid: person.uid,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase.from('post_mentions').insert(rows);
  if (error) throw toDataError(error);
}

async function syncPoll(postId: string, options: readonly string[]): Promise<void> {
  const supabase = getSupabase();
  const labels = options.map((option) => option.trim()).filter(Boolean);

  const { error: clearError } = await supabase.from('poll_options').delete().eq('post_id', postId);
  if (clearError) throw toDataError(clearError);
  if (labels.length === 0) return;

  const { error } = await supabase
    .from('poll_options')
    .insert(labels.map((label, index) => ({ post_id: postId, position: index, label })));
  if (error) throw toDataError(error);
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
export async function savePost(
  authorUid: string,
  draft: PostDraft,
  status: Extract<PostStatus, 'draft' | 'published'>,
): Promise<SaveResult> {
  const supabase = getSupabase();
  const body = draft.body.trim();
  const title = draft.title.trim();
  const fallbackSlug = draft.kind === 'snippet' ? 'snippet' : draft.kind;
  const slug = uniqueSlug(title.length > 0 ? title : toExcerpt(body, 48), fallbackSlug);

  const payload = {
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
    published_at: status === 'published' ? new Date().toISOString() : null,
  };

  let postId = draft.id;
  let postSlug = slug;

  if (postId) {
    const { data, error } = await supabase
      .from('posts')
      .update(payload)
      .eq('id', postId)
      .select('id, slug')
      .maybeSingle();
    if (error) throw toDataError(error);
    if (!data) throw toDataError(new Error('profile/not-found'));
    postSlug = data.slug;
  } else {
    // The database checks the author's profile exists through the
    // posts_author_uid_fkey constraint, which is the only foreign key on this
    // table. Reading its answer keeps this free — no extra round trip — and
    // cannot race with a profile deleted mid-save the way a pre-check could.
    const { data, error } = await supabase
      .from('posts')
      .insert({ ...payload, author_uid: authorUid, slug })
      .select('id, slug')
      .maybeSingle();
    if (error) {
      if (error.code === '23503') throw toDataError(new Error(PROFILE_MISSING_MESSAGE));
      throw toDataError(error);
    }
    if (!data) throw toDataError(new Error('data/insert-failed'));
    postId = data.id;
    postSlug = data.slug;
  }

  await syncTags(postId, draft.tags);
  await syncMedia(postId, draft);
  await syncMentions(postId, body);
  if (draft.kind === 'poll') await syncPoll(postId, draft.pollOptions);

  return { id: postId, slug: postSlug };
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
