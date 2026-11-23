import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { galleryQueryKey, useGallery } from './use-gallery';
import {
  GALLERY_PAGE_SIZE,
  type GalleryCursor,
  type GalleryFilter,
  type GalleryImage,
} from '@/lib/media/gallery';
import type * as MediaRepositoryModule from '@/lib/data/media-repository';
import { DataError } from '@/lib/supabase/errors';

/**
 * The paging rules of the picker, with nothing of the picker in the way.
 *
 * A member with two thousand pictures never asks for two thousand tiles, a filter
 * change never resumes from a position in the list it left, and the end of the
 * library is recognised rather than waited for. Those three are the whole job of this
 * hook, and each of them is a bug that would be felt as "my gallery is empty" or as a
 * spinner that never stops.
 */

const listGallery =
  vi.fn<
    (input: {
      limit?: number;
      purpose?: string;
      query?: string;
      cursor?: GalleryCursor | null;
    }) => Promise<{ items: GalleryImage[]; nextCursor: GalleryCursor | null }>
  >();

vi.mock('@/lib/data/media-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof MediaRepositoryModule>();
  return {
    ...actual,
    listGallery: (...args: Parameters<typeof listGallery>) => listGallery(...args),
  };
});

function image(id: string, createdAt: string): GalleryImage {
  return {
    id,
    url: `https://i.ibb.co/${id}/${id}.webp`,
    thumbUrl: '',
    purpose: 'post-image',
    width: 1600,
    height: 900,
    bytes: 40_000,
    mimeType: 'image/webp',
    createdAt,
    expiresAt: null,
    inUse: false,
    uses: 0,
    surfaces: [],
    altText: '',
  };
}

function page(
  ids: readonly string[],
  from = 0,
): {
  items: GalleryImage[];
  nextCursor: GalleryCursor | null;
} {
  const items = ids.map((id, index) =>
    image(id, new Date(Date.UTC(2026, 0, 10 - from - index)).toISOString()),
  );
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last === undefined ? null : { before: last.createdAt, beforeId: last.id },
  };
}

/**
 * A real `DataError`, built the way the repository builds one — from the shape
 * PostgREST answers with.
 *
 * A stand-in class would not be a `DataError` at all, and the hook would rightly
 * treat it as an unknown failure: the mapping under test lives inside that class.
 */
function signInRequired(): DataError {
  return new DataError({
    code: 'PGRST301',
    message: 'JWT expired, please refresh your session',
    details: '',
    hint: '',
  });
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  listGallery.mockResolvedValue(page([]));
});

describe('a library a page at a time', () => {
  it('asks for one page of the member’s own pictures when the dialog opens', async () => {
    listGallery.mockResolvedValueOnce(page(['a', 'b']));
    const { result } = renderHook(() => useGallery({ enabled: true, purpose: 'all', query: '' }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(listGallery).toHaveBeenCalledTimes(1);
    expect(listGallery.mock.calls[0]?.[0]).toEqual({
      limit: GALLERY_PAGE_SIZE,
      purpose: 'all',
      query: '',
      cursor: null,
    });
  });

  it('sends no request at all while the dialog is shut', async () => {
    renderHook(() => useGallery({ enabled: false, purpose: 'all', query: '' }), { wrapper });

    // A gallery mounted behind a closed sheet, in every composer on the site, would
    // otherwise be one request per composer before anybody asked for one.
    await Promise.resolve();
    expect(listGallery).not.toHaveBeenCalled();
  });

  it('drops the row two pages share, and keeps the one the member already saw', async () => {
    listGallery.mockResolvedValueOnce(page(['a', 'b'])).mockResolvedValueOnce(page(['b', 'c'], 2));
    const { result } = renderHook(() => useGallery({ enabled: true, purpose: 'all', query: '' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(result.current.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('resumes from the pair the last row carried, not from a count of rows', async () => {
    listGallery.mockResolvedValue(page(['a', 'b']));
    const { result } = renderHook(() => useGallery({ enabled: true, purpose: 'all', query: '' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.loadMore());

    await waitFor(() => expect(listGallery).toHaveBeenCalledTimes(2));
    // Both halves or nothing: the timestamp of the oldest row the member was shown
    // plus that row's id to break a tie. `my_gallery` refuses a half cursor with
    // 22023, because resuming from a timestamp alone repeats or skips whatever was
    // written in the same second.
    const oldest = result.current.items[result.current.items.length - 1];
    expect(listGallery.mock.calls[1]?.[0]?.cursor).toEqual({
      before: oldest?.createdAt,
      beforeId: 'b',
    });
  });

  it('knows the library ended when a page came back short', async () => {
    // `hasNextPage` alone would keep a sentinel watching forever when the last page
    // is exactly full, which is the ordinary case for a member with 60 pictures.
    listGallery.mockResolvedValueOnce(page(['a']));
    const { result } = renderHook(
      () => useGallery({ enabled: true, purpose: 'all', query: '', pageSize: 2 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps the pictures on screen while a new filter loads', async () => {
    let releaseSecond: (value: {
      items: GalleryImage[];
      nextCursor: GalleryCursor | null;
    }) => void = () => undefined;
    listGallery.mockResolvedValueOnce(page(['a', 'b'])).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSecond = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ purpose }: { purpose: GalleryFilter }) =>
        useGallery({ enabled: true, purpose, query: '' }),
      { wrapper, initialProps: { purpose: 'all' as GalleryFilter } },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    rerender({ purpose: 'avatar' });
    await waitFor(() => expect(result.current.stale).toBe(true));
    // The grid still holds the old tiles: a filter that blanks it looks like the
    // member lost their pictures.
    expect(result.current.items.map((item) => item.id)).toEqual(['a', 'b']);

    await act(async () => {
      releaseSecond(page(['c']));
      // The resolve is what lets the query's own state update land before the
      // assertion after it reads the grid.
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['c']));
  });

  it('says which failure it is, because a library and a login are different news', async () => {
    listGallery.mockRejectedValueOnce(signInRequired());
    const { result } = renderHook(() => useGallery({ enabled: true, purpose: 'all', query: '' }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errorKey).toBe('media.errors.signInRequired');
  });

  it('falls back to the gallery’s own words for anything else', async () => {
    listGallery.mockRejectedValueOnce(new Error('the network is down'));
    const { result } = renderHook(() => useGallery({ enabled: true, purpose: 'all', query: '' }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errorKey).toBe('media.gallery.errors.failed');
    // An error on a later page must not replace a library that is already on screen.
    expect(result.current.items).toHaveLength(0);
  });

  it('re-reads after an upload, so the picture just added is in the list', async () => {
    listGallery.mockResolvedValue(page(['a']));
    const { result } = renderHook(() => useGallery({ enabled: true, purpose: 'all', query: '' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });
    await waitFor(() => expect(listGallery).toHaveBeenCalledTimes(2));
  });

  it('keys each filter and search apart, which is what makes a page resumable', () => {
    expect(galleryQueryKey('all', '')).toEqual(['media', 'gallery', 'all', '']);
    expect(galleryQueryKey('post-image', 'bridge')).toEqual([
      'media',
      'gallery',
      'post-image',
      'bridge',
    ]);
  });
});
