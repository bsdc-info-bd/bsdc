/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ensureSearchIndex,
  refreshSearchIndex,
  type SearchCategory,
  type SearchHit,
  type SearcherContext,
} from '@/lib/search';
import { useDebounce } from './useDebounce';
import { useLocalStorageState } from './useLocalStorageState';
import { useAuthStore } from '@/stores/authStore';
import { trackInteraction, topTags } from '@/lib/personalization';
import { logSearchEvent } from '@/lib/data';

export function useSearchIndexReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void ensureSearchIndex()
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setReady(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

export interface UseSearchResult {
  hits: SearchHit[];
  grouped: { users: SearchHit[]; posts: SearchHit[]; tags: SearchHit[]; groups: SearchHit[] };
  ready: boolean;
  trending: { tag: string; count: number }[];
  recent: string[];
  clearRecent: () => void;
  commitSearch: (q: string) => void;
  rebuild: () => void;
}

/** Debounced, personalized, ranked search with real suggestions. */
export function useSearch(query: string, category: SearchCategory = 'all'): UseSearchResult {
  const [ready, setReady] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [trending, setTrending] = useState<{ tag: string; count: number }[]>([]);
  const [recent, setRecent] = useLocalStorageState<string[]>('bsdc-recent-searches', []);
  const profile = useAuthStore((s) => s.profile);
  const debounced = useDebounce(query.trim(), 160);

  useEffect(() => {
    let cancelled = false;
    void ensureSearchIndex().then((idx) => {
      if (!cancelled) {
        setReady(true);
        setTrending(idx.trendingTags(6));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ctx = useMemo<SearcherContext | null>(() => {
    if (!profile) return null;
    return {
      viewerTags: profile.skills.map((s) => s.toLowerCase()),
      viewerSkills: profile.skills.map((s) => s.toLowerCase()),
      viewerFollowing: new Set<string>(),
      viewerGeo: profile.geo,
      viewerLocation: profile.location,
    };
  }, [profile]);

  // Keep following set fresh (used for the "author you follow" boost).
  const [following, setFollowing] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void import('@/lib/data').then(({ fetchFollowingIds }) =>
      fetchFollowingIds(profile.uid, 500)
        .then((ids) => !cancelled && setFollowing(new Set(ids)))
        .catch(() => undefined),
    );
    return () => {
      cancelled = true;
    };
  }, [profile]);
  useEffect(() => {
    if (ctx) ctx.viewerFollowing = following;
  }, [ctx, following]);

  // Personalization tag affinity merges with profile skills.
  const [affinityTags, setAffinityTags] = useState<string[]>([]);
  useEffect(() => {
    void topTags(10).then((tags) => setAffinityTags(tags.map((t) => t.tag))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (ctx && affinityTags.length > 0) {
      ctx.viewerTags = Array.from(new Set([...ctx.viewerTags, ...affinityTags]));
    }
  }, [ctx, affinityTags]);

  useEffect(() => {
    if (!debounced) {
      setHits([]);
      return;
    }
    let cancelled = false;
    void ensureSearchIndex().then((idx) => {
      if (cancelled) return;
      const results = idx.search(debounced, category, ctx, 30);
      setHits(results);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, category, ctx]);

  const grouped = useMemo(
    () => ({
      users: hits.filter((h) => h.kind === 'user'),
      posts: hits.filter((h) => h.kind === 'post'),
      tags: hits.filter((h) => h.kind === 'tag'),
      groups: hits.filter((h) => h.kind === 'group'),
    }),
    [hits],
  );

  const commitSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setRecent((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 8));
      trackInteraction({ kind: 'search', query: trimmed });
      void logSearchEvent(trimmed, hits.length);
    },
    [hits.length, setRecent],
  );

  const rebuild = useCallback(() => {
    void refreshSearchIndex();
  }, []);

  return { hits, grouped, ready, trending, recent, clearRecent: () => setRecent([]), commitSearch, rebuild };
}
