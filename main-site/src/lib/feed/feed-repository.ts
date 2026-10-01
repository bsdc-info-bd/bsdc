import { POST_SELECT, toPost, type JoinedPostRow, type Post } from '@/lib/content/post-repository';
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import {
  DEFAULT_FEED_PREFERENCES,
  type FeedAlgorithm,
  type FeedCandidate,
  type FeedPreferences,
} from './ranking';

interface CandidateRow {
  post_id: string;
  author_uid: string;
  published_at: string | null;
  likes_count: number;
  comments_count: number;
  views_count: number;
  language: string;
  is_sensitive: boolean;
  kind: string;
  author_followed: boolean;
  affinity: number;
  already_seen: boolean;
  tags: string[];
}

function toCandidate(row: CandidateRow): FeedCandidate {
  return {
    postId: row.post_id,
    authorUid: row.author_uid,
    publishedAt: row.published_at ?? new Date(0).toISOString(),
    likes: row.likes_count,
    comments: row.comments_count,
    views: row.views_count,
    language: row.language,
    isSensitive: row.is_sensitive,
    kind: row.kind,
    authorFollowed: row.author_followed,
    affinity: row.affinity,
    alreadySeen: row.already_seen,
    tags: row.tags,
  };
}

/** Stage one: the database returns only what this viewer is allowed to read. */
export async function fetchCandidates(
  limit: number,
  before: string | null,
): Promise<FeedCandidate[]> {
  const { data, error } = await getSupabase()
    .rpc('feed_candidates', { p_limit: limit, p_before: before })
    .returns<CandidateRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toCandidate);
}

/**
 * Loads the full posts for an already ranked list of ids and restores that
 * order, because PostgREST returns rows in whatever order it likes.
 */
export async function hydratePosts(ids: readonly string[]): Promise<Post[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase()
    .from('posts')
    .select(POST_SELECT)
    .in('id', ids)
    .returns<JoinedPostRow[]>();
  if (error) throw toDataError(error);

  const posts = (data ?? []).map(toPost);
  const order = new Map(ids.map((id, index) => [id, index]));
  return posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function fetchNewPostCount(since: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('feed_new_count', { p_since: since });
  if (error) throw toDataError(error);
  return typeof data === 'number' ? data : 0;
}

/** Impressions also feed topic affinity, so reading teaches the ranking. */
export async function recordImpression(postId: string): Promise<void> {
  const { error } = await getSupabase().rpc('record_feed_impression', { p_post_id: postId });
  if (error) throw toDataError(error);
}

export async function fetchFeedPreferences(uid: string): Promise<FeedPreferences> {
  const { data, error } = await getSupabase()
    .from('feed_preferences')
    .select('*')
    .eq('uid', uid)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  if (!data) return DEFAULT_FEED_PREFERENCES;

  return {
    algorithm: data.algorithm as FeedAlgorithm,
    languages: data.languages,
    mutedTags: data.muted_tags,
    showSensitive: data.show_sensitive,
    hideSeen: data.hide_seen,
  };
}

export async function saveFeedPreferences(
  uid: string,
  preferences: FeedPreferences,
): Promise<void> {
  const { error } = await getSupabase()
    .from('feed_preferences')
    .upsert(
      {
        uid,
        algorithm: preferences.algorithm,
        languages: [...preferences.languages],
        muted_tags: [...preferences.mutedTags],
        show_sensitive: preferences.showSensitive,
        hide_seen: preferences.hideSeen,
      },
      { onConflict: 'uid' },
    );
  if (error) throw toDataError(error);
}
