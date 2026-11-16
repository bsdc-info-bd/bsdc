import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  emptyReason,
  mergePages,
  rankFeedWithReport,
  type FeedAlgorithm,
  type FeedEmptyReason,
  type FeedPreferences,
  type FilterReport,
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
  /** Stage two's counts for the first page, which is what explains an empty feed. */
  report: FilterReport | null;
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
  /** Why the feed is empty, so the member is told the truth rather than a shrug. */
  emptyReason: FeedEmptyReason;
  /** True when the member's feed filters hid every other author's posts, leaving only their own. */
  onlyOwnByPreferences: boolean;
  /** Reads the posts this member has already seen, which the feed hides by default. */
  showSeen: () => void;
  includeSeen: boolean;
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
  // A member who has read everything is offered the posts back rather than an
  // empty room; asking for them is a choice made in the UI, not a default.
  const [includeSeen, setIncludeSeen] = useState(false);
  const reported = useRef(new Set<string>());

  useEffect(() => {
    setIncludeSeen(false);
    reported.current.clear();
  }, [uid]);

  const effective = useMemo<FeedPreferences>(
    () => ({ ...preferences, algorithm, hideSeen: includeSeen ? false : preferences.hideSeen }),
    [preferences, algorithm, includeSeen],
  );
  const mutedKey = useMemo(
    () =>
      [...effective.mutedTags]
        .map((tag) => tag.toLowerCase())
        .sort()
        .join(','),
    [effective.mutedTags],
  );

  const query = useInfiniteQuery({
    queryKey: [
      'feed',
      uid,
      algorithm,
      effective.languages.join(','),
      mutedKey,
      effective.showSensitive,
      effective.hideSeen,
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      const candidates = await fetchCandidates(CANDIDATE_PAGE_SIZE, pageParam);
      let { ranked, report } = rankFeedWithReport(candidates, effective, uid);

      // Own posts always bypass hideSeen in stage 2. Without checking whether
      // any OTHER member's post survived, an active author who read the feed
      // would become trapped seeing only their own posts and zero community
      // posts, because ranked.length > 0 prevented the hideSeen retry.
      const onlyOwnPostsSurvived =
        uid !== null &&
        ranked.length > 0 &&
        ranked.every((item) => item.authorUid === uid) &&
        report.removed.seen > 0;

      if (
        (ranked.length === 0 || onlyOwnPostsSurvived) &&
        candidates.length > 0 &&
        effective.hideSeen
      ) {
        const retry = rankFeedWithReport(candidates, { ...effective, hideSeen: false }, uid);
        ranked = retry.ranked;
        report = retry.report;
      }

      const posts = await hydratePosts(ranked.map((item) => item.postId));
      const oldest = candidates.reduce<string | null>((acc, item) => {
        if (acc === null) return item.publishedAt;
        return item.publishedAt < acc ? item.publishedAt : acc;
      }, null);
      return {
        ranked,
        posts,
        report: pageParam === null ? report : null,
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

  const firstReport = pages[0]?.report ?? null;
  const reason = useMemo<FeedEmptyReason>(
    () => (firstReport === null ? 'nothing' : emptyReason(firstReport, ranked.length)),
    [firstReport, ranked.length],
  );
  const onlyOwnByPreferences = useMemo(() => {
    if (uid === null || posts.length === 0 || firstReport === null) return false;
    if (!posts.every((post) => post.author?.uid === uid)) return false;
    const removedOther =
      firstReport.removed.language +
      firstReport.removed.muted +
      firstReport.removed.following +
      firstReport.removed.sensitive;
    return removedOther > 0;
  }, [uid, posts, firstReport]);

  const firstPublishedAt = posts[0]?.publishedAt ?? null;
  const { data: newPostCount = 0 } = useQuery({
    queryKey: ['feed-new-count', uid, firstPublishedAt],
    queryFn: () => fetchNewPostCount(firstPublishedAt ?? new Date().toISOString()),
    enabled: firstPublishedAt !== null,
    refetchInterval: NEW_POST_POLL_MS,
    staleTime: NEW_POST_POLL_MS,
  });

  // Impressions: one per post per session, only after it is really visible.
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
    emptyReason: query.isError ? 'nothing' : reason,
    onlyOwnByPreferences,
    includeSeen,
    showSeen: () => {
      setIncludeSeen(true);
    },
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refresh,
    newPostCount,
    observe,
  };
}
