import { wakePushDelivery } from '@/lib/push/wake';
import { getSupabase } from '@/lib/supabase/client';
import { DataError, toDataError } from '@/lib/supabase/errors';
import type { FollowSuggestionRow, SocialProfileItemRow } from '@/lib/supabase/types';

export interface SocialProfileItem {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  verified: boolean;
  viewerFollows: boolean;
  followedAt: string;
}

export function isPrivateSocialListError(error: unknown): boolean {
  if (error instanceof DataError) {
    return error.code === '42501' || error.message.toLowerCase().includes('private');
  }
  return error instanceof Error && error.message.toLowerCase().includes('private');
}

/** A suggestion the way the rest of the app reads it. */
export interface FollowSuggestion {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  followers: number;
  mutualCount: number;
  sharedSkills: string[];
  /** Why this member is being suggested. Shown, because a reason is the point. */
  reason: 'mutual' | 'skills' | 'city' | 'active';
}

/**
 * Social graph primitives. The counters on `profiles` are maintained by a
 * database trigger, so the client never has to keep them in step.
 */
export async function follow(followerUid: string, followeeUid: string): Promise<void> {
  const { error } = await getSupabase()
    .from('follows')
    .insert({ follower_uid: followerUid, followee_uid: followeeUid });
  if (error && error.code !== '23505') throw toDataError(error);
  wakePushDelivery();
}

export async function unfollow(followerUid: string, followeeUid: string): Promise<void> {
  const { error } = await getSupabase()
    .from('follows')
    .delete()
    .eq('follower_uid', followerUid)
    .eq('followee_uid', followeeUid);
  if (error) throw toDataError(error);
}

export async function isFollowing(followerUid: string, followeeUid: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('follows')
    .select('follower_uid')
    .eq('follower_uid', followerUid)
    .eq('followee_uid', followeeUid)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  return data !== null;
}

export async function blockMember(blockerUid: string, blockedUid: string): Promise<void> {
  const { error } = await getSupabase()
    .from('blocks')
    .insert({ blocker_uid: blockerUid, blocked_uid: blockedUid });
  if (error && error.code !== '23505') throw toDataError(error);
}

export async function unblockMember(blockerUid: string, blockedUid: string): Promise<void> {
  const { error } = await getSupabase()
    .from('blocks')
    .delete()
    .eq('blocker_uid', blockerUid)
    .eq('blocked_uid', blockedUid);
  if (error) throw toDataError(error);
}

/**
 * Who to follow next, and the reason each one is worth following.
 *
 * The ranking is the database's, not the client's: it knows the whole graph, and
 * a suggestion made on one page has to agree with a suggestion made on another.
 */
export async function fetchFollowSuggestions(limit = 12): Promise<FollowSuggestion[]> {
  const { data, error } = await getSupabase()
    .rpc('follow_suggestions', { p_limit: limit })
    .returns<FollowSuggestionRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toSuggestion);
}

function toSuggestion(row: FollowSuggestionRow): FollowSuggestion {
  return {
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    location: row.location,
    followers: row.followers_count,
    mutualCount: row.mutual_count,
    sharedSkills: row.shared_skills ?? [],
    reason: row.reason,
  };
}

function toSocialProfile(row: SocialProfileItemRow): SocialProfileItem {
  return {
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    location: row.location,
    verified: row.verified === true,
    viewerFollows: row.viewer_follows === true,
    followedAt: row.followed_at,
  };
}

export async function fetchProfileFollowers(
  targetUid: string,
  limit = 30,
  offset = 0,
): Promise<SocialProfileItem[]> {
  const { data, error } = await getSupabase()
    .rpc('profile_followers', { p_uid: targetUid, p_limit: limit, p_offset: offset })
    .returns<SocialProfileItemRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toSocialProfile);
}

export async function fetchProfileFollowing(
  targetUid: string,
  limit = 30,
  offset = 0,
): Promise<SocialProfileItem[]> {
  const { data, error } = await getSupabase()
    .rpc('profile_following', { p_uid: targetUid, p_limit: limit, p_offset: offset })
    .returns<SocialProfileItemRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toSocialProfile);
}
