/**
 * BSDC — src/features/search/useSearch.ts
 * Purpose : Search state for a screen: debounced query, results, provenance and loading.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The hook owns three promises a screen should not have to keep: that a fast typist
 *   triggers one request and not one per keystroke, that a stale response can never overwrite a
 *   newer one, and that the screen always knows whether what it is showing came from the platform
 *   or only from this device — because claiming to have searched the whole platform when only this
 *   device answered is the kind of small lie that costs a person an afternoon.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, useState } from 'react';
import { SEARCH_MIN_QUERY, type SearchKind } from '@/core/config/search';
import { search, type SearchOptions } from '@/entities/search/repository';
import { emptyResultSet, isQueryUsable, type SearchResultSet } from '@/entities/search/model';
import { useDebounce } from '@/shared/hooks';

/** Search state returned by the hook. */
export interface SearchState {
  readonly result: SearchResultSet;
  readonly loading: boolean;
  /** True when the query is too short to run, so the UI can wait without saying "no results". */
  readonly tooShort: boolean;
}

/**
 * Runs a debounced search for a query owned by the caller.
 * @param query the raw query
 * @param kinds kinds to include; empty means every kind
 * @param options extra options, including the device-only switch
 * @returns the search state
 */
export function useSearch(
  query: string,
  kinds: readonly SearchKind[] = [],
  options: Omit<SearchOptions, 'kinds'> = {},
): SearchState {
  const [result, setResult] = useState<SearchResultSet>(() => emptyResultSet(''));
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 250);
  const generation = useRef(0);
  const deviceOnly = options.deviceOnly === true;
  const limit = options.limit;

  const kindsKey = kinds.join(',');

  useEffect(() => {
    if (!isQueryUsable(debounced, SEARCH_MIN_QUERY)) {
      generation.current += 1;
      setResult(emptyResultSet(debounced, deviceOnly ? 'local' : 'local'));
      setLoading(false);
      return;
    }
    const mine = generation.current + 1;
    generation.current = mine;
    setLoading(true);
    void search(debounced, {
      kinds: kindsKey.length > 0 ? (kindsKey.split(',') as SearchKind[]) : [],
      ...(deviceOnly ? { deviceOnly: true } : {}),
      ...(limit !== undefined ? { limit } : {}),
    })
      .then((next) => {
        if (generation.current !== mine) return;
        setResult(next);
      })
      .catch(() => {
        if (generation.current !== mine) return;
        setResult(emptyResultSet(debounced, 'local'));
      })
      .finally(() => {
        if (generation.current === mine) setLoading(false);
      });
  }, [debounced, kindsKey, deviceOnly, limit]);

  return {
    result,
    loading,
    tooShort: query.trim().length > 0 && !isQueryUsable(query, SEARCH_MIN_QUERY),
  };
}
