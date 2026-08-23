/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import { SearchIndex, type SearchCategory, type SearchHit } from '@/lib/search';
import { fetchActiveUsers, fetchGroups, fetchRecentPosts, logSearchEvent } from '@/lib/data';
import { useDebounce } from './useDebounce';
import { useLocalStorageState } from './useLocalStorageState';

let globalIndex: SearchIndex | null = null;

/** Builds/refreshes the shared FlexSearch index over posts, users, groups and tags. */
export async function ensureSearchIndex(): Promise<SearchIndex> {
  if (globalIndex) return globalIndex;
  const index = new SearchIndex();
  const [posts, users, groups] = await Promise.all([
    fetchRecentPosts(300).catch(() => []),
    fetchActiveUsers(300).catch(() => []),
    fetchGroups(100).catch(() => []),
  ]);
  index.indexPosts(posts);
  index.indexUsers(users);
  index.indexGroups(groups);
  globalIndex = index;
  return index;
}

export function useSearchIndexReady(): boolean {
  const [ready, setReady] = useState(globalIndex !== null);
  useEffect(() => {
    if (globalIndex) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void ensureSearchIndex().then(() => !cancelled && setReady(true)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

export function useSearch(query: string, category: SearchCategory = 'all') {
  const ready = useSearchIndexReady();
  const debounced = useDebounce(query, 200);
  const [recent, setRecent] = useLocalStorageState<string[]>('bsdc-recent-searches', []);

  const hits = useMemo<SearchHit[]>(() => {
    if (!ready || !globalIndex) return [];
    return globalIndex.search(debounced, category, 30);
  }, [debounced, category, ready]);

  function commitSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecent((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 8));
    void logSearchEvent(trimmed, hits.length);
  }

  return { hits, ready, recent, clearRecent: () => setRecent([]), commitSearch };
}
