import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { FeedCandidate } from '@/lib/feed/ranking';
import type { FeedCandidateRow } from '@/lib/supabase/types';

/**
 * A channel is a *filtered feed*, not a second feed: the same post rows, the
 * same cards, the same hydrator, filtered to the room the reader opened. The
 * database owns both the filter (which posts the room holds, and who may see
 * the room at all) and the attribution (which room each post was said to be
 * written in), so this module only moves the answers across the wire.
 */

export const CHANNEL_BLOCK_REASONS = [
  'channel/read-only',
  'channel/not-member',
  'channel/archived',
  'channel/not-found',
] as const;

export type ChannelBlockReason = (typeof CHANNEL_BLOCK_REASONS)[number];

export function isChannelBlockReason(value: string): value is ChannelBlockReason {
  return (CHANNEL_BLOCK_REASONS as readonly string[]).includes(value);
}

export interface PostableChannel {
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  slug: string;
  name: string;
  topic: string;
  isReadOnly: boolean;
  /**
   * The reason this channel refuses a post, or null when the caller may
   * write here. A null reason means writable — never a missing verdict.
   */
  blockReason: ChannelBlockReason | null;
}

interface ChannelRow {
  id: string;
  group_id: string;
  slug: string;
  name: string;
  topic: string;
  is_read_only: boolean;
  groups?: { slug: string; name: string } | null;
}

interface ChannelBlockRow {
  channel_id: string;
  block: string | null;
}

/**
 * Every channel the signed-in member may see, with the reason each one would
 * refuse their post. One round trip for the list, one for the verdicts: the
 * list decides what to show, the verdicts decide what stays enabled.
 */
export async function fetchPostableChannels(): Promise<PostableChannel[]> {
  const { data, error } = await getSupabase()
    .from('channels')
    .select('id, group_id, slug, name, topic, is_read_only, groups (slug, name)')
    .order('name', { ascending: true })
    .returns<ChannelRow[]>();
  if (error) throw toDataError(error);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: verdicts, error: verdictError } = await getSupabase()
    .rpc('channel_post_block_many', { p_channel_ids: rows.map((row) => row.id) })
    .returns<ChannelBlockRow[]>();
  if (verdictError) throw toDataError(verdictError);

  const reasons = new Map((verdicts ?? []).map((row) => [row.channel_id, row.block]));
  return rows.map((row) => {
    // An unknown reason string is normalised to null rather than leaking a
    // raw key into a label: the picker's copy is written against the four
    // known reasons, and anything else is treated as "writable" only in the
    // sense that the label will not claim a reason it cannot name.
    const block = reasons.get(row.id);
    return {
      id: row.id,
      groupId: row.group_id,
      groupSlug: row.groups?.slug ?? '',
      groupName: row.groups?.name ?? '',
      slug: row.slug,
      name: row.name,
      topic: row.topic,
      isReadOnly: row.is_read_only,
      blockReason: block && isChannelBlockReason(block) ? block : null,
    };
  });
}

/**
 * The posts of one channel, in the home feed's shape, so the one hydrator
 * the app already has serves both rooms.
 */
export async function fetchChannelCandidates(
  channelId: string,
  before: string | null = null,
  limit = 30,
): Promise<FeedCandidate[]> {
  const { data, error } = await getSupabase()
    .rpc('channel_feed', { p_channel_id: channelId, p_limit: limit, p_before: before })
    .returns<FeedCandidateRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toCandidate);
}

function toCandidate(row: FeedCandidateRow): FeedCandidate {
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

/** The published post count of every channel of a group, keyed by channel id. */
export async function fetchChannelPostCounts(groupId: string): Promise<Record<string, number>> {
  const { data, error } = await getSupabase()
    .rpc('channel_post_counts', { p_group_id: groupId })
    .returns<{ channel_id: string; post_count: number }[]>();
  if (error) throw toDataError(error);
  return Object.fromEntries((data ?? []).map((row) => [row.channel_id, row.post_count]));
}
