import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { SearchResultRow, SearchSuggestionRow, TrendingSearchRow } from '@/lib/supabase/types';
import type { SearchKind, SearchResult, SearchSuggestion } from './search-types';

function toResult(row: SearchResultRow): SearchResult {
  return {
    kind: row.kind,
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    rank: row.rank,
    createdAt: row.created_at,
  };
}

/**
 * One query across posts, people, groups, courses, jobs and projects. The
 * function runs as the caller, so row level security — not this code —
 * decides what a member is allowed to find.
 */
export async function search(
  query: string,
  kinds: SearchKind[] = [],
  limit = 40,
): Promise<SearchResult[]> {
  const { data, error } = await getSupabase()
    .rpc('global_search', {
      p_query: query,
      p_kinds: kinds.length > 0 ? kinds : null,
      p_limit: limit,
    })
    .returns<SearchResultRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toResult);
}

export async function fetchSuggestions(prefix: string, limit = 8): Promise<SearchSuggestion[]> {
  const { data, error } = await getSupabase()
    .rpc('search_suggestions', { p_prefix: prefix, p_limit: limit })
    .returns<SearchSuggestionRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({ kind: row.kind, slug: row.slug, title: row.title }));
}

export async function fetchTrending(limit = 8): Promise<{ term: string; uses: number }[]> {
  const { data, error } = await getSupabase()
    .rpc('trending_searches', { p_limit: limit })
    .returns<TrendingSearchRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({ term: row.term, uses: row.uses }));
}

/**
 * Records the words, never the member. Failure here is deliberately silent:
 * analytics must never break a search a member is waiting on.
 */
export async function logSearch(term: string, results: number): Promise<void> {
  const { error } = await getSupabase().rpc('log_search', {
    p_term: term,
    p_results: results,
  });
  if (error) return;
}
