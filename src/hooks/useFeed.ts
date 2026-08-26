/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import {
  fetchActiveUsers,
  fetchBookmarkedPosts,
  fetchFollowerIds,
  fetchFollowingIds,
  fetchRecentPosts,
  getUserByUsername,
  visibleToViewer,
} from '@/lib/data';
import {
  platformAverageEngagement,
  rankFeed,
  trendingScores,
  type FeedContext,
} from '@/lib/feed-algorithm';
import type { Post, PostSort } from '@/types/post';
import type { UserProfile } from '@/types/user';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { topTags, typeAffinity } from '@/lib/personalization';

export interface FeedResult {
  posts: Post[];
  loading: boolean;
  error: string;
  refresh: () => void;
}

export function useFeed(sort: PostSort, filterType?: string, authorUsername?: string, tagFilter?: string): FeedResult {
  const profile = useAuthStore((s) => s.profile);
  const activeFeed = useUIStore((s) => s.activeFeed);
  const effectiveSort = sort || activeFeed;
  const [posts, setPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Map<string, UserProfile>>(new Map());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [secondDegree, setSecondDegree] = useState<Set<string>>(new Set());
  const [personalTags, setPersonalTags] = useState<string[]>([]);
  const [engagedTypes, setEngagedTypes] = useState<Partial<Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [recentPosts, activeUsers, myFollowing, affinityTags, typeAff] = await Promise.all([
          fetchRecentPosts(200),
          fetchActiveUsers(100),
          profile ? fetchFollowingIds(profile.uid, 500) : Promise.resolve([] as string[]),
          topTags(12).catch(() => [] as { tag: string; score: number }[]),
          typeAffinity().catch(() => ({}) as Partial<Record<string, number>>),
        ]);
        if (cancelled) return;
        setPosts(recentPosts);
        setAuthors(new Map(activeUsers.map((u) => [u.uid, u])));
        setFollowingIds(new Set(myFollowing));
        setPersonalTags(affinityTags.map((a) => a.tag));
        setEngagedTypes(typeAff);
        if (myFollowing.length > 0) {
          const second = new Set<string>();
          for (const uid of myFollowing.slice(0, 30)) {
            const theirFollowing = await fetchFollowerIds(uid, 20);
            theirFollowing.forEach((id) => second.add(id));
          }
          if (!cancelled) setSecondDegree(second);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the feed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, tick]);

  const filtered = useMemo(() => {
    let list = posts;
    if (authorUsername) {
      list = list.filter((p) => p.authorUsername === authorUsername);
    }
    if (filterType) {
      list = list.filter((p) => p.type === filterType);
    }
    if (tagFilter) {
      const t = tagFilter.toLowerCase();
      list = list.filter((p) => p.tags.includes(t));
    }
    return list.filter((p) => visibleToViewer(p, profile, followingIds));
  }, [posts, profile, followingIds, filterType, authorUsername, tagFilter]);

  const context = useMemo<FeedContext>(
    () => ({
      viewer: profile,
      followingIds,
      // Affinity tags come from the user's REAL on-device interaction history.
      followedTags: Array.from(new Set([...personalTags, ...(profile?.skills || [])])),
      groupIds: new Set(),
      secondDegreeIds: secondDegree,
      engagedTypes,
      platformAvgEngagement: platformAverageEngagement(posts),
    }),
    [profile, followingIds, secondDegree, posts, personalTags, engagedTypes],
  );

  const ranked = useMemo(() => {
    if (effectiveSort === 'latest') return [...filtered].sort((a, b) => (b.publishedAt || b.createdAt) - (a.publishedAt || a.createdAt));
    if (effectiveSort === 'trending') return trendingScores(filtered, 24 * 60 * 60 * 1000).map((s) => s.post);
    if (effectiveSort === 'following') {
      return filtered
        .filter((p) => followingIds.has(p.authorId) || (profile && p.authorId === profile.uid))
        .sort((a, b) => (b.publishedAt || b.createdAt) - (a.publishedAt || a.createdAt));
    }
    return rankFeed(filtered, context, authors).map((s) => s.post);
  }, [filtered, effectiveSort, context, authors, followingIds, profile]);

  return {
    posts: ranked,
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}

export function useBookmarks(uid: string | null): { posts: Post[]; loading: boolean } {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) {
      setPosts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchBookmarkedPosts(uid)
      .then((p) => !cancelled && setPosts(p))
      .catch(() => !cancelled && setPosts([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [uid]);
  return { posts, loading };
}

export function useUserByUsername(username: string | undefined): { user: UserProfile | null; loading: boolean } {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!username) {
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getUserByUsername(username)
      .then((u) => !cancelled && setUser(u))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [username]);
  return { user, loading };
}
