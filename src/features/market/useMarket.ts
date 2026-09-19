/**
 * BSDC — src/features/market/useMarket.ts
 * Purpose : Browsing state for the public marketplace: search, category, price ceiling and sort.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The marketplace reads the same gig collection the freelancer hub writes, and filters on
 *   the client only after the read has landed — the read itself is server-side, so a filter never
 *   quietly shows somebody a different marketplace than everybody else sees.
 *   Sorting by price uses the entry price of the cheapest package, which is the number a person
 *   actually compares, not an average they have to work out.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/core/config/app';
import type { GigCategory } from '@/core/config/opportunities';
import { averageRating, startingPrice, type Gig } from '@/entities/gig/model';
import { listGigs } from '@/entities/gig/repository';

/** Sort orders the marketplace offers. */
export const MARKET_SORTS = ['recommended', 'newest', 'rating', 'price'] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

/** Result of the marketplace hook. */
export interface UseMarketResult {
  readonly gigs: readonly Gig[];
  readonly loading: boolean;
  readonly source: 'remote' | 'local';
  readonly query: string;
  readonly category: GigCategory | null;
  readonly sort: MarketSort;
  readonly ceiling: number | null;
  readonly setQuery: (value: string) => void;
  readonly setCategory: (value: GigCategory | null) => void;
  readonly setSort: (value: MarketSort) => void;
  readonly setCeiling: (value: number | null) => void;
  readonly reset: () => void;
  readonly reload: () => void;
}

/**
 * Loads and filters the marketplace.
 * @param locale interface language, used only for the search collation
 * @returns the gigs, the filters and the setters
 */
export function useMarket(locale: Locale): UseMarketResult {
  const [loaded, setLoaded] = useState<readonly Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'remote' | 'local'>('local');
  const [nonce, setNonce] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GigCategory | null>(null);
  const [sort, setSort] = useState<MarketSort>('recommended');
  const [ceiling, setCeiling] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listGigs({ limit: 120 }).then((result) => {
      if (!active) return;
      setLoaded(result.items);
      setSource(result.source);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [nonce]);

  const filtered = useMemo(() => {
    const collation = locale === 'bn' ? 'bn-BD' : 'en-GB';
    const needle = query.trim().toLocaleLowerCase(collation);
    const rows = loaded.filter((gig) => {
      if (category !== null && gig.category !== category) return false;
      if (ceiling !== null && startingPrice(gig) > ceiling) return false;
      if (needle.length === 0) return true;
      return (
        gig.title.toLocaleLowerCase(collation).includes(needle) ||
        gig.description.toLocaleLowerCase(collation).includes(needle) ||
        gig.freelancerName.toLocaleLowerCase(collation).includes(needle) ||
        gig.skills.some((skill) => skill.toLocaleLowerCase(collation).includes(needle))
      );
    });

    const sorted = [...rows];
    if (sort === 'newest') {
      sorted.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    } else if (sort === 'rating') {
      sorted.sort((left, right) => {
        const difference = averageRating(right) - averageRating(left);
        return difference !== 0 ? difference : right.completedOrders - left.completedOrders;
      });
    } else if (sort === 'price') {
      sorted.sort((left, right) => startingPrice(left) - startingPrice(right));
    } else {
      // Recommended: rating first, then proof of delivery, then recency. A brand-new gig with no
      // orders yet is shown, but after the ones people have already paid for.
      sorted.sort((left, right) => {
        const rating = averageRating(right) - averageRating(left);
        if (Math.abs(rating) > 0.01) return rating;
        if (left.completedOrders !== right.completedOrders) {
          return right.completedOrders - left.completedOrders;
        }
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      });
    }
    return sorted;
  }, [loaded, query, category, sort, ceiling, locale]);

  return {
    gigs: filtered,
    loading,
    source,
    query,
    category,
    sort,
    ceiling,
    setQuery,
    setCategory,
    setSort,
    setCeiling,
    reset: () => {
      setQuery('');
      setCategory(null);
      setSort('recommended');
      setCeiling(null);
    },
    reload: () => setNonce((value) => value + 1),
  };
}
