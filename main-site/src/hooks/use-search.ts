import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  groupByKind,
  isSearchable,
  parseQuery,
  type SearchGroup,
  type SearchKind,
  type SearchResult,
  type SearchSuggestion,
} from '@/lib/search/search-types';

const repository = () => import('@/lib/search/search-repository');

/** Keeps a value still for a moment so each keystroke is not a round trip. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return settled;
}

export interface SearchState {
  results: SearchResult[];
  groups: SearchGroup[];
  kinds: SearchKind[];
  text: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
}

/**
 * Global search. "in:jobs" style filters are parsed in the browser and sent
 * as a kind list, so the database never has to guess what a colon meant.
 */
export function useSearch(input: string, kindFilter: SearchKind | null = null): SearchState {
  const debounced = useDebounced(input, 250);
  const parsed = useMemo(() => parseQuery(debounced), [debounced]);
  const kinds = kindFilter !== null ? [kindFilter] : parsed.kinds;
  const enabled = isSearchable(parsed.text);

  const query = useQuery({
    queryKey: ['search', parsed.text, kinds.join(',')],
    queryFn: async () => {
      const module = await repository();
      const results = await module.search(parsed.text, kinds);
      void module.logSearch(parsed.text, results.length);
      return results;
    },
    enabled,
    staleTime: 30_000,
  });

  const results = query.data ?? [];

  return {
    results,
    groups: groupByKind(results),
    kinds,
    text: parsed.text,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    isEmpty: enabled && query.isSuccess && results.length === 0,
  };
}

/** Title-only suggestions for the command palette. */
export function useSearchSuggestions(input: string): {
  suggestions: SearchSuggestion[];
  isLoading: boolean;
} {
  const debounced = useDebounced(input, 180);
  const enabled = isSearchable(debounced);

  const query = useQuery({
    queryKey: ['search-suggestions', debounced],
    queryFn: async () => (await repository()).fetchSuggestions(debounced),
    enabled,
    staleTime: 60_000,
  });

  return { suggestions: query.data ?? [], isLoading: enabled && query.isLoading };
}

/** What the community has been looking for lately — terms only, no people. */
export function useTrendingSearches(): { terms: { term: string; uses: number }[] } {
  const query = useQuery({
    queryKey: ['trending-searches'],
    queryFn: async () => (await repository()).fetchTrending(),
    staleTime: 600_000,
  });

  return { terms: query.data ?? [] };
}
