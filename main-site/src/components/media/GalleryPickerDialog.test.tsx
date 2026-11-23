import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GalleryPickerDialog } from './GalleryPickerDialog';
import type { PickedMedia } from '@/lib/media/gallery';
import type { GalleryImage } from '@/lib/media/gallery';
import type * as I18nModule from 'react-i18next';

/**
 * The picker itself, with a library that answers like the real one.
 *
 * What is under test is the part only this component can get wrong: what a tap means
 * on a surface that takes one picture versus one that takes six, which tiles are
 * offered at all once the room runs out, what a tile says about itself, and whether
 * what the member touched is what the surface gets back — in order, with the
 * description that was written for the picture the first time, and with the filing that
 * a filter depends on.
 *
 * The hook underneath is stood in for by a filter over `LIBRARY`, which is why the
 * assertions below can say things like "the avatar chip leaves one tile": they are
 * about the dialog and its read of the same rows, not about a spy counting calls.
 */

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    // Keys come back as keys, so an assertion reads the same as the locale file.
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

function image(id: string, patch: Partial<GalleryImage> = {}): GalleryImage {
  return {
    id,
    url: `https://i.ibb.co/${id}/${id}.webp`,
    thumbUrl: `https://i.ibb.co/${id}/${id}-thumb.webp`,
    purpose: 'post-image',
    width: 1600,
    height: 900,
    bytes: 40_960,
    mimeType: 'image/webp',
    createdAt: '2026-03-04T10:00:00.000Z',
    expiresAt: null,
    inUse: false,
    uses: 0,
    surfaces: [],
    altText: `The ${id} picture`,
    ...patch,
  };
}

const LIBRARY: GalleryImage[] = [
  image('one', { altText: 'The bridge at dawn' }),
  image('two', { purpose: 'chat-image', createdAt: '2026-01-02T10:00:00.000Z' }),
  image('three', {
    purpose: 'avatar',
    altText: '',
    inUse: true,
    uses: 2,
    surfaces: ['post', 'chat'],
    createdAt: '2026-01-02T06:00:00.000Z',
  }),
  image('four', { purpose: 'avatar', inUse: true, uses: 1, surfaces: ['mystery'] }),
];

const hookState: {
  failed: boolean;
  errorKey: string;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
} = {
  failed: false,
  errorKey: '',
  hasMore: false,
  refresh: () => undefined,
  loadMore: () => undefined,
};

vi.mock('./use-gallery', () => ({
  useGallery: (input: { enabled: boolean; purpose: string; query: string }) => {
    const term = input.query.trim();
    const items = LIBRARY.filter(
      (row) =>
        (input.purpose === 'all' || row.purpose === input.purpose) &&
        (term.length === 0 || row.altText.toLowerCase().includes(term.toLowerCase())),
    );
    return {
      items,
      byId: new Map(items.map((row) => [row.id, row])),
      loading: false,
      stale: false,
      failed: hookState.failed && items.length === 0,
      errorKey: hookState.errorKey,
      hasMore: hookState.hasMore,
      loadingMore: false,
      loadMore: () => hookState.loadMore(),
      refresh: () => hookState.refresh(),
    };
  },
  galleryQueryKey: () => ['media', 'gallery'],
}));

/** The dialog watches a sentinel for the end of its pages; jsdom has no observer. */
class Observer {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Typed rather than bare `vi.fn()`: an untyped mock returns `any`, and what these
// tests are for is the shape of the array a surface is handed back.
const onPick = vi.fn<(picked: PickedMedia[]) => void>();
const onClose = vi.fn<() => void>();
const onDevice = vi.fn<(files: File[]) => void>();
const onUploaded = vi.fn<() => void>();

interface OpenProps {
  purpose?: 'post-image' | 'comment-image' | 'cover' | 'avatar';
  max?: number;
  attached?: readonly string[];
  device?: boolean;
}

function open(props: OpenProps = {}) {
  const { purpose = 'post-image', max = 6, attached = [], device = true } = props;
  return render(
    <GalleryPickerDialog
      open
      onClose={onClose}
      purpose={purpose}
      max={max}
      attached={attached}
      onPick={onPick}
      {...(device ? { onDevice, onUploaded } : {})}
    />,
  );
}

function tiles(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tile]'));
}

function tile(name: string): HTMLButtonElement {
  const found = screen.getByRole('button', { name });
  return found as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.failed = false;
  hookState.errorKey = '';
  hookState.hasMore = false;
  hookState.refresh = () => undefined;
  hookState.loadMore = () => undefined;
  globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
});

describe('the library, opened', () => {
  it('groups the tiles into the days they were uploaded, and reads in order', () => {
    open();
    const dialog = screen.getByRole('dialog');
    // A date above each run of tiles is what separates a library from a wall of
    // thumbnails. The exact words come from `Intl` in the member's own language, so
    // what is pinned here is the structure those dates make, not their spelling —
    // three rows on two days, and the newest day's run kept together.
    // Three runs, not two days: the newest row and the oldest row were uploaded on
    // the same date, with another day between them, and a run is a run — merging them
    // into one heading would put a January picture under March.
    expect(within(dialog).getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(tiles().map((node) => node.getAttribute('aria-label'))).toEqual([
      'The bridge at dawn',
      'The two picture',
      // A row with no description on it is still a tile worth picking: it says
      // "picture" out loud rather than reading as an empty button.
      'media.gallery.tileNoAlt',
      'The four picture',
    ]);
  });

  it('walks the grid with the arrow keys, from the tile that was pressed', () => {
    open();
    const [first, second] = tiles();
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(second);
    expect(second).toHaveAttribute('tabindex', '0');
    // A grid whose tab stop never moves means every arrow press starts from the top,
    // which is how a keyboard user ends up on the wrong picture.
    fireEvent.keyDown(second!, { key: 'Home' });
    expect(document.activeElement).toBe(first);
  });

  it('says where a picture is being used, and admits what it cannot name', () => {
    open();
    const notes = Array.from(document.querySelectorAll('[data-tile] span[aria-hidden="true"]'))
      .map((node) => node.textContent ?? '')
      .filter((text) => text.length > 0 && !/^\d+$/.test(text));

    // A tile used twice on two named surfaces says both; a tile used once on a
    // surface the client has never heard of says only that it is in use, rather than
    // inventing a place; and a spare picture states its size, the only thing worth
    // saying about it.
    expect(notes).toContain('media.gallery.inUseMany');
    expect(notes).toContain('media.gallery.inUse');
    expect(notes.join(' ')).not.toContain('media.gallery.surfaceMystery');
  });

  it('marks a picture the surface is already holding', () => {
    // Compared by address, so an `http` address on the surface and the `https` one in
    // the library are the same photograph. Refusing to add it twice is the surface's
    // own job — it is the only thing that knows what it holds — and its queue does
    // that, which is tested in `use-attachments`.
    open({ attached: ['http://i.ibb.co/one/one.webp'] });
    expect(screen.getAllByText('media.gallery.alreadyAttached')).toHaveLength(1);
  });
});

describe('a surface that takes one picture', () => {
  it('commits on the tap, because asking again after it is one more tap for nothing', () => {
    open({ max: 1 });
    fireEvent.click(tile('The bridge at dawn'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]?.[0]).toMatchObject({
      mediaId: 'one',
      url: 'https://i.ibb.co/one/one.webp',
      thumbUrl: 'https://i.ibb.co/one/one-thumb.webp',
      altText: 'The bridge at dawn',
      width: 1600,
      height: 900,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('files the reused picture under the purpose the surface uploads as', () => {
    // The purpose is what the library groups by, so a picture picked for a comment is
    // found under "comments" afterwards. A reuse that arrived unlabelled would make
    // the filing drift, tile by tile, into a pile.
    open({ max: 1, purpose: 'comment-image' });
    fireEvent.click(tile('The four picture'));

    expect(onPick.mock.calls[0]?.[0]?.[0]?.purpose).toBe('comment-image');
  });

  it('shows no basket and no footer, because there is nothing to fill', () => {
    open({ max: 1 });
    expect(screen.queryByText('media.gallery.pickHint')).not.toBeInTheDocument();
    expect(screen.queryByText('media.gallery.addCount')).not.toBeInTheDocument();
    // One picture means one tap: the full-size preview is a second control a member
    // could hit by accident, so it is not offered.
    expect(screen.queryByRole('button', { name: 'media.gallery.preview' })).not.toBeInTheDocument();
  });
});

describe('a surface that takes several', () => {
  it('hands the pictures back in the order they were touched', () => {
    open();
    fireEvent.click(tile('The four picture'));
    fireEvent.click(tile('The bridge at dawn'));

    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.addCount' }));
    expect(onPick.mock.calls[0]?.[0]?.map((item) => item.mediaId)).toEqual(['four', 'one']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('numbers the tiles it took, so the order is visible and not just implied', () => {
    open();
    fireEvent.click(tile('The bridge at dawn'));
    fireEvent.click(tile('The four picture'));

    const marks = Array.from(document.querySelectorAll('[data-tile] span[aria-hidden="true"]'))
      .map((node) => node.textContent ?? '')
      .filter((text) => /^\d$/.test(text));
    expect(marks).toEqual(['1', '2']);
  });

  it('takes a tile back out with a second tap on it', () => {
    open();
    fireEvent.click(tile('The bridge at dawn'));
    fireEvent.click(tile('The bridge at dawn'));

    expect(screen.getByText('media.gallery.pickHint')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'media.gallery.addCount' }),
    ).not.toBeInTheDocument();
  });

  it('takes a tile out of the strip as well, and calls the control by the picture', () => {
    open();
    fireEvent.click(tile('The bridge at dawn'));
    fireEvent.click(tile('The four picture'));

    fireEvent.click(
      screen.getByRole('button', { name: 'media.gallery.unpick — The four picture' }),
    );
    expect(screen.getByRole('button', { name: 'media.gallery.addCount' })).toHaveTextContent(
      'media.gallery.addCount',
    );
    expect(tile('The bridge at dawn')).toHaveAttribute('aria-pressed', 'true');
    expect(tile('The four picture')).toHaveAttribute('aria-pressed', 'false');
  });

  it('stops offering tiles once the surface has no room left', () => {
    open({ max: 2 });
    fireEvent.click(tile('The bridge at dawn'));
    fireEvent.click(tile('The four picture'));

    // The third is disabled rather than silently dropped: a control that takes a
    // picture and forgets it is worse than one that never offered it.
    expect(tile('media.gallery.tileNoAlt')).toBeDisabled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('lets a full basket make room by taking one out', () => {
    open({ max: 2 });
    fireEvent.click(tile('The bridge at dawn'));
    fireEvent.click(tile('The four picture'));
    expect(tile('media.gallery.tileNoAlt')).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: 'media.gallery.unpick — The four picture' }),
    );
    expect(tile('The four picture')).toBeEnabled();
  });

  it('will not commit an empty basket', () => {
    open();
    // No Add button at all until something is chosen, so there is nothing to press
    // that would hand a surface an empty array it then has to guess the meaning of.
    expect(
      screen.queryByRole('button', { name: 'media.gallery.addCount' }),
    ).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('looking for one picture', () => {
  it('reads a library of one kind when its chip is chosen', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.filterAvatars' }));

    // The chips are the member's own filing, taken from what they were uploading at
    // the time: "profile pictures" finds the two rows recorded as avatars, and the
    // dialog asks for nothing else.
    expect(tiles().map((node) => node.getAttribute('aria-label'))).toEqual([
      'media.gallery.tileNoAlt',
      'The four picture',
    ]);
    expect(screen.getByRole('button', { name: 'media.gallery.filterAvatars' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('searches the pictures by what they were said to be', () => {
    open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bridge' } });

    expect(tiles()).toHaveLength(1);
    expect(tile('The bridge at dawn')).toBeInTheDocument();
  });

  it('says a search found nothing, which is not the same news as having no pictures', () => {
    open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'helicopter' } });

    expect(screen.getByText('media.gallery.noMatches')).toBeInTheDocument();
    expect(screen.getByText('media.gallery.noMatchesHint')).toBeInTheDocument();
    expect(screen.queryByText('media.gallery.empty')).not.toBeInTheDocument();
  });

  it('drops what was selected when the list underneath it changes', () => {
    open();
    fireEvent.click(tile('The bridge at dawn'));
    expect(screen.getByRole('button', { name: 'media.gallery.addCount' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.filterAvatars' }));

    // A keyset cursor is a position in one sorted list of matches, and a basket is the
    // same: the tiles on screen belong to another query now, so what was held back is
    // let go instead of being carried into a list that no longer contains it.
    expect(screen.getByText('media.gallery.pickHint')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'media.gallery.addCount' }),
    ).not.toBeInTheDocument();
  });
});

describe('the other door, inside the same dialog', () => {
  it('uploads from in here, and asks for the library to be re-read', () => {
    open();
    const input = screen.getByLabelText('media.gallery.uploadDevice');
    const file = new File([new Uint8Array(8)], 'new.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    // A member who searches, finds nothing, and wants the photo they took ten minutes
    // ago should not have to close the dialog to add it.
    expect(onDevice.mock.calls[0]?.[0]?.[0]?.name).toBe('new.png');
    // A nudge, not a promise: the surface owns the upload, and the library gains the
    // tile as soon as the row behind it is written.
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it('offers no upload to a surface that cannot take a file', () => {
    open({ device: false });
    expect(
      screen.queryByRole('button', { name: 'media.gallery.uploadDevice' }),
    ).not.toBeInTheDocument();
  });
});

describe('a library with more to it, or nothing to it', () => {
  it('shows the empty library with the hint that says what this place is', () => {
    const before = LIBRARY.length;
    LIBRARY.length = 0;
    try {
      open();
      expect(screen.getByText('media.gallery.empty')).toBeInTheDocument();
      expect(screen.getByText('media.gallery.emptyHint')).toBeInTheDocument();
      // The way out of an empty library is the other door — the header's own button,
      // and the one the empty state puts in the middle of the screen. The same input,
      // reached from two places, which is what an empty state is for.
      expect(screen.getAllByRole('button', { name: 'media.gallery.uploadDevice' })).toHaveLength(2);
    } finally {
      LIBRARY.length = before;
      LIBRARY.push(
        image('one', { altText: 'The bridge at dawn' }),
        image('two', { purpose: 'chat-image', createdAt: '2026-01-02T10:00:00.000Z' }),
        image('three', {
          purpose: 'avatar',
          altText: '',
          inUse: true,
          uses: 2,
          surfaces: ['post', 'chat'],
          createdAt: '2026-01-02T06:00:00.000Z',
        }),
        image('four', { purpose: 'avatar', inUse: true, uses: 1, surfaces: ['mystery'] }),
      );
    }
  });

  it('ends with a sentence, not a button that loads nothing', () => {
    open();
    expect(screen.getByText('media.gallery.endOfLibrary')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'media.gallery.loadMore' }),
    ).not.toBeInTheDocument();
  });

  it('offers older pages while there are older pages', () => {
    const loadMore = vi.fn<() => void>();
    hookState.hasMore = true;
    hookState.loadMore = loadMore;
    open();

    // Both halves of an infinite scroll: a sentinel for the hands-free case, and this
    // button for the keyboard — and for a browser that throttles observers in a
    // background tab, which is exactly when a member comes back to a dialog that had
    // stopped loading.
    expect(screen.queryByText('media.gallery.endOfLibrary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.loadMore' }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('says the library could not be opened, without blaming the member', async () => {
    const refresh = vi.fn();
    hookState.failed = true;
    hookState.errorKey = 'media.gallery.errors.failed';
    hookState.refresh = refresh;
    const before = LIBRARY.length;
    LIBRARY.length = 0;
    try {
      render(
        <GalleryPickerDialog open onClose={onClose} purpose="post-image" max={6} onPick={onPick} />,
      );
      await waitFor(() => expect(screen.getByText('media.gallery.errorTitle')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'media.gallery.retry' }));
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      LIBRARY.length = before;
    }
  });
});
