import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';

/**
 * Social graph primitives. The counters on `profiles` are maintained by a
 * database trigger, so the client never has to keep them in step.
 */
export async function follow(followerUid: string, followeeUid: string): Promise<void> {
  const { error } = await getSupabase()
    .from('follows')
    .insert({ follower_uid: followerUid, followee_uid: followeeUid });
  if (error && error.code !== '23505') throw toDataError(error);
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
