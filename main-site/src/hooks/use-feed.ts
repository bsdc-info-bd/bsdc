import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Post } from '@/lib/content/post-repository';
import {
  fetchCandidates,
  fetchFeedPreferences,
  fetchNewPostCount,
  hydratePosts,
  recordImpression,
  saveFeedPreferences,
} from '@/lib/feed/feed-repository';
import {
  DEFAULT_FEED_PREFERENCES,
  mergePages,
  rankFeed,
  type FeedAlgorithm,
  type FeedPreferences,
  type ScoredCandidate,
} from '@/lib/feed/ranking';
import { useAuthStore } from '@/store/auth-store';

/** Candidates are fetched generously because filtering removes a good share. */
const CANDIDATE_PAGE_SIZE = 60;
const NEW_POST_POLL_MS = 60_000;

interface FeedPage {
  ranked: ScoredCandidate[];
  posts: Post[];
  cursor: string | null;
}

export function useFeedPreferences(): {
  preferences: FeedPreferences;
  save: (next: FeedPreferences) => void;
  isSaving: boolean;
} {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['feed-preferences', uid],
    queryFn: () => fetchFeedPreferences(uid ?? ''),
    enabled: uid !== null,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: (next: FeedPreferences) => saveFeedPreferences(uid ?? '', next),
    onSuccess: (_result, next) => {
      queryClient.setQueryData(['feed-preferences', uid], next);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  return {
    preferences: data ?? DEFAULT_FEED_PREFERENCES,
    save: (next: FeedPreferences) => {
      mutation.mutate(next);
    },
    isSaving: mutation.isPending,
  };
}

export interface UseFeedResult {
  posts: Post[];
  ranked: ScoredCandidate[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isError: boolean;
  loadMore: () => void;
  refresh: () => void;
  newPostCount: number;
  observe: (postId: string) => (node: HTMLElement | null) => void;
}

/**
 * The feed: candidates from Postgres, ranking in the browser, impressions
 * reported once per post when it has actually been on screen.
 */
export function useFeed(algorithm: FeedAlgorithm): UseFeedResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { preferences } = useFeedPreferences();
  const queryClient = useQueryClient();
  const effective = useMemo<FeedPreferences>(
    () => ({ ...preferences, algorithm }),
    [preferences, algorithm],
  );

  const query = useInfiniteQuery({
    queryKey: ['feed', uid, algorithm, effective.languages.join(','), effective.showSensitive],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      const candidates = await fetchCandidates(CANDIDATE_PAGE_SIZE, pageParam);
      const ranked = rankFeed(candidates, effective, uid);
      const posts = await hydratePosts(ranked.map((item) => item.postId));
      const oldest = candidates.reduce<string | null>((acc, item) => {
        if (acc === null) return item.publishedAt;
        return item.publishedAt < acc ? item.publishedAt : acc;
      }, null);
      return {
        ranked,
        posts,
        cursor: candidates.length < CANDIDATE_PAGE_SIZE ? null : oldest,
      };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    staleTime: 60_000,
  });

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const ranked = useMemo(() => mergePages(pages.map((page) => page.ranked)), [pages]);
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return pages
      .flatMap((page) => page.posts)
      .filter((post) => (seen.has(post.id) ? false : (seen.add(post.id), true)));
  }, [pages]);

  const firstPublishedAt = posts[0]?.publishedAt ?? null;
  const { data: newPostCount = 0 } = useQuery({
    queryKey: ['feed-new-count', firstPublishedAt],
    queryFn: () => fetchNewPostCount(firstPublishedAt ?? new Date().toISOString()),
    enabled: firstPublishedAt !== null,
    refetchInterval: NEW_POST_POLL_MS,
    staleTime: NEW_POST_POLL_MS,
  });

  // Impressions: one per post per session, only after it is really visible.
  const reported = useRef(new Set<string>());
  const observer = useRef<IntersectionObserver | null>(null);
  const pending = useRef(new Map<Element, string>());

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const instance = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const postId = pending.current.get(entry.target);
          if (postId === undefined || reported.current.has(postId)) continue;
          reported.current.add(postId);
          instance.unobserve(entry.target);
          void recordImpression(postId).catch(() => undefined);
        }
      },
      { threshold: 0.5 },
    );
    observer.current = instance;
    return () => {
      instance.disconnect();
      observer.current = null;
    };
  }, [uid]);

  const observe = useCallback(
    (postId: string) => (node: HTMLElement | null) => {
      if (node === null || observer.current === null) return;
      if (reported.current.has(postId)) return;
      pending.current.set(node, postId);
      observer.current.observe(node);
    },
    [],
  );

  const refresh = useCallback(() => {
    reported.current.clear();
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    void queryClient.invalidateQueries({ queryKey: ['feed-new-count'] });
  }, [queryClient]);

  return {
    posts,
    ranked,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    isError: query.isError,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refresh,
    newPostCount,
    observe,
  };
}
