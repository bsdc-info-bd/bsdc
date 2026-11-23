import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useDebounced } from '@/hooks/use-search';
import { listGallery } from '@/lib/data/media-repository';
import { DataError } from '@/lib/supabase/errors';
import type { GalleryCursor, GalleryFilter, GalleryImage } from '@/lib/media/gallery';
import { GALLERY_PAGE_SIZE } from '@/lib/media/gallery';
import type { GalleryFilter as _GalleryFilter } from '@/lib/storage/media-contract';

/**
 * The pages of a member's library that are currently loaded.
 *
 * Held as pages rather than one array because paging has to stay resumable: a
 * gallery that flattens its own history loses the position it paged from and can
 * only start again, which is how a library ends up showing the same first sixty
 * pictures however far the member scrolls.
 */
export interface GalleryFeed {
  /** Loaded tiles, newest first, with a page boundary's duplicate removed. */
  readonly items: GalleryImage[];
  /** The same tiles by id, for a surface that already holds picked ids. */
  readonly byId: ReadonlyMap<string, GalleryImage>;
  readonly loading: boolean;
  /** True while a filter change is refilling the grid with its previous page. */
  readonly stale: boolean;
  readonly failed: boolean;
  readonly errorKey: string;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  loadMore(): void;
  /** After an upload, so the picture a member just added is in the list they see. */
  refresh(): void;
}

export function galleryQueryKey(purpose: GalleryFilter, query: string): QueryKey {
  return ['media', 'gallery', purpose, query];
}

function errorKeyOf(error: unknown): string {
  if (error instanceof DataError) {
    if (error.messageKey === 'data.errors.signInRequired') return 'media.errors.signInRequired';
    return 'media.errors.failed';
  }
  if (error instanceof Error && error.message.startsWith('media.')) return error.message;
  return 'media.gallery.errors.failed';
}

/**
 * A page at a time, so two thousand pictures cost two thousand tiles and not a
 * request that fails.
 *
 * Three things this does that a plain fetch would not, each of them the reason the
 * hook exists:
 *
 *   * **Debounce.** Every keystroke is a query that pages from the top. Without it,
 *     typing "rick" asks for four pages, and the fourth one's answer arrives after
 *     the eighth's.
 *   * **`keepPreviousData`.** A filter change that blanks the grid looks like the
 *     member lost their pictures. Keeping the old page on screen while the new one
 *     loads is the difference between a filter and a flicker.
 *   * **Per-page cursors.** A keyset cursor is a position in one sorted list of
 *     matches; react-query keeps each page's own, so a filter change cannot resume
 *     from a stale position.
 *
 * `enabled` is the caller's answer to "is this dialog open". A gallery mounted
 * behind a closed sheet, in every composer on the site, would be a request per
 * composer before the member asked for one.
 */
export function useGallery(input: {
  enabled: boolean;
  purpose: GalleryFilter;
  query: string;
  pageSize?: number;
}): GalleryFeed {
  const pageSize = input.pageSize ?? GALLERY_PAGE_SIZE;
  const debounced = useDebounced(input.query.trim(), 250);
  const purpose: _GalleryFilter = input.purpose;

  const query = useInfiniteQuery({
    queryKey: galleryQueryKey(purpose, debounced),
    enabled: input.enabled,
    initialPageParam: null as GalleryCursor | null,
    queryFn: async ({ pageParam }) =>
      listGallery({ limit: pageSize, purpose, query: debounced, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const items = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const seen = new Set<string>();
    const out: GalleryImage[] = [];
    for (const page of pages) {
      for (const image of page.items) {
        // A picture can appear in two pages when a row is written between them.
        // First answer wins, because the earlier page is the one the member saw.
        if (image.id.length === 0 || seen.has(image.id)) continue;
        seen.add(image.id);
        out.push(image);
      }
    }
    return out;
  }, [query.data]);

  const byId = useMemo(() => new Map(items.map((image) => [image.id, image])), [items]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query]);

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const pages = query.data?.pages ?? [];
  // A page that came back short is the end of the library, which is the same
  // signal the composer's history uses. `hasNextPage` alone would keep a sentinel
  // watching forever when the last page is exactly full.
  const lastPage = pages[pages.length - 1];
  const reachedEnd = lastPage !== undefined && lastPage.items.length < pageSize;

  return {
    items,
    byId,
    loading: query.isPending && input.enabled,
    stale: query.isPlaceholderData,
    failed: query.isError && pages.length === 0,
    errorKey: query.isError ? errorKeyOf(query.error) : '',
    hasMore: query.hasNextPage === true && !reachedEnd,
    loadingMore: query.isFetchingNextPage,
    loadMore,
    refresh,
  };
}
