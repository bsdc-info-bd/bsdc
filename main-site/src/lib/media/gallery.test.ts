import { describe, expect, it } from 'vitest';

import { bn } from '@/i18n/locales/bn';
import { en } from '@/i18n/locales/en';
import { GALLERY_FILTERS, MEDIA_PURPOSES } from '@/lib/storage/media-contract';
import {
  GALLERY_FILTER_LABEL,
  GALLERY_PURPOSE_LABEL,
  GALLERY_SURFACE_LABEL,
  attachedUrls,
  cursorAfterPage,
  filterLabelKey,
  groupByDay,
  isSameMedia,
  normaliseMediaUrl,
  purposeLabelKey,
  roomFor,
  shouldResetFor,
  surfaceLabelKeys,
  toPicked,
  type GalleryImage,
} from './gallery';

/**
 * The picker's own rules, tested apart from the dialog that uses them.
 *
 * Each of these is small enough to write inline in a component and be forgotten
 * there, and each one is a rule the gallery quietly depends on: which two addresses
 * count as one picture, how many more a surface may take, where the next page
 * resumes from, and what a tile is filed under. The last group matters more than it
 * looks — a label with no copy behind it is a raw key on screen for half the
 * community, so the two bundles are held against the maps here rather than
 * discovered in a screenshot three weeks from now.
 */

function image(patch: Partial<GalleryImage> = {}): GalleryImage {
  return {
    id: 'asset-1',
    url: 'https://i.ibb.co/one/one.webp',
    thumbUrl: 'https://i.ibb.co/one/one-thumb.webp',
    purpose: 'post-image',
    width: 1600,
    height: 900,
    bytes: 40_000,
    mimeType: 'image/webp',
    createdAt: '2026-03-04T10:00:00.000Z',
    expiresAt: null,
    inUse: true,
    uses: 2,
    surfaces: ['post', 'cover'],
    altText: 'The bridge at dawn',
    ...patch,
  };
}

function flatten(value: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') {
    if (prefix.length > 0) out.add(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const enKeys = flatten(en);
const bnKeys = flatten(bn);

describe('one picture, one address', () => {
  it('reads http and https as the same picture, because the host answers both', () => {
    expect(normaliseMediaUrl('http://i.ibb.co/one/one.webp')).toBe('https://i.ibb.co/one/one.webp');
  });

  it('drops the trailing slash a host accepts without caring', () => {
    expect(normaliseMediaUrl('https://i.ibb.co/one/')).toBe('https://i.ibb.co/one');
  });

  it('says what a picture is when the address is not a URL at all', () => {
    // A row written before the https rule can hold anything. Normalising must not
    // throw, and must not pretend to understand what it cannot parse.
    expect(normaliseMediaUrl('one.webp')).toBe('one.webp');
    expect(normaliseMediaUrl('   ')).toBe('');
  });

  it('knows a tile the surface already has, across the differences above', () => {
    expect(isSameMedia('http://i.ibb.co/one/one.webp/', 'https://i.ibb.co/one/one.webp')).toBe(
      true,
    );
    expect(isSameMedia('https://i.ibb.co/one/one.webp', 'https://i.ibb.co/two/two.webp')).toBe(
      false,
    );
  });

  it('never calls two unknown addresses the same picture', () => {
    // The empty string is "we do not know" in this field. Reading two of them as
    // equal would mark every tile on a fresh surface as already attached.
    expect(isSameMedia('', '')).toBe(false);
    expect(attachedUrls(['', '  ', 'https://i.ibb.co/one/one.webp'])).toEqual(
      new Set(['https://i.ibb.co/one/one.webp']),
    );
  });
});

describe('how much room a surface has', () => {
  it('counts what is left', () => {
    expect(roomFor(2, 6)).toBe(4);
  });

  it('refuses to go below none, because a draft longer than the limit is real', () => {
    // An eight-picture product draft opened where six are allowed would otherwise
    // be handed a negative count of slots — and `slice(-2)` drops pictures rather
    // than adding any.
    expect(roomFor(8, 6)).toBe(0);
    expect(roomFor(0, 0)).toBe(0);
  });
});

describe('the next page of a library', () => {
  it('resumes from the oldest row it showed, both halves together', () => {
    const first = image({ id: 'a', createdAt: '2026-03-04T10:00:00.000Z' });
    const older = image({ id: 'b', createdAt: '2026-02-01T08:30:00.000Z' });
    expect(cursorAfterPage([first, older])).toEqual({
      before: '2026-02-01T08:30:00.000Z',
      beforeId: 'b',
    });
  });

  it('carries no cursor for a page with nothing on it, so a caller cannot loop', () => {
    expect(cursorAfterPage([])).toBeNull();
  });
});

describe('what a picked picture carries', () => {
  it('hands the surface the id, the addresses and the description it already had', () => {
    const picked = toPicked(image(), 'cover');
    expect(picked).toEqual({
      mediaId: 'asset-1',
      url: 'https://i.ibb.co/one/one.webp',
      thumbUrl: 'https://i.ibb.co/one/one-thumb.webp',
      width: 1600,
      height: 900,
      altText: 'The bridge at dawn',
      purpose: 'cover',
    });
  });

  it('shows the full picture when the host never made a thumbnail', () => {
    // Every consumer puts `thumbUrl` in an `img` element: an empty string there is
    // a broken frame in the middle of the thing the member just did.
    expect(toPicked(image({ thumbUrl: '' }), 'post-image').thumbUrl).toBe(
      'https://i.ibb.co/one/one.webp',
    );
  });
});

describe('a library in runs of days', () => {
  it('puts consecutive tiles from one day in one section', () => {
    const sections = groupByDay([
      image({ id: 'a', createdAt: '2026-03-04T10:00:00.000Z' }),
      image({ id: 'b', createdAt: '2026-03-04T06:00:00.000Z' }),
      image({ id: 'c', createdAt: '2026-03-02T06:00:00.000Z' }),
    ]);
    expect(sections.map((section) => [section.day, section.items.length])).toEqual([
      ['2026-03-04', 2],
      ['2026-03-02', 1],
    ]);
  });

  it('starts a new run when the day comes back, and keeps the keys unique', () => {
    // A page boundary can repeat a day the page before it ended on. Grouping by
    // "the day of the last row" keeps that a second run instead of interleaving.
    const sections = groupByDay([
      image({ id: 'a', createdAt: '2026-03-04T10:00:00.000Z' }),
      image({ id: 'b', createdAt: '2026-03-02T10:00:00.000Z' }),
      image({ id: 'c', createdAt: '2026-03-04T09:00:00.000Z' }),
    ]);
    expect(sections).toHaveLength(3);
    expect(new Set(sections.map((section) => section.key)).size).toBe(3);
  });

  it('uses the day name the caller was given, which is how it reads in Bangla', () => {
    const sections = groupByDay([image()], (iso) => `day:${iso.slice(0, 7)}`);
    expect(sections[0]?.day).toBe('day:2026-03');
  });
});

describe('a filter change', () => {
  it('throws away the pages already loaded, for a filter or for a word', () => {
    const before = { purpose: 'all' as const, query: '' };
    expect(shouldResetFor(before, { purpose: 'post-image', query: '' })).toBe(true);
    expect(shouldResetFor(before, { purpose: 'all', query: 'bridge' })).toBe(true);
    expect(shouldResetFor(before, { purpose: 'all', query: '  ' })).toBe(false);
  });
});

describe('the words on a tile', () => {
  it('has a filter for every chip the picker offers, and one name each', () => {
    expect([...GALLERY_FILTERS].sort()).toEqual(
      [...new Set(['all', ...MEDIA_PURPOSES.filter((purpose) => purpose !== 'other')])].sort(),
    );
    for (const filter of GALLERY_FILTERS) {
      expect(GALLERY_FILTER_LABEL[filter]).toBeDefined();
      expect(filterLabelKey(filter)).toBe(GALLERY_FILTER_LABEL[filter]);
    }
  });

  it('names every surface the reference view can answer with', () => {
    // The arms of `bsdc.media_references` (0132). A name here that the view does not
    // produce is a label no tile will ever use; a name the view produces and this map
    // lacks is a tile that says "in use" and nothing about where.
    expect(Object.keys(GALLERY_SURFACE_LABEL).sort()).toEqual(
      [
        'post',
        'chat',
        'comment',
        'avatar',
        'cover',
        'community',
        'page',
        'event',
        'project',
        'course',
        'conversation',
        'ad',
        'shop',
        'product',
        'order',
        'seo',
      ].sort(),
    );
    expect(surfaceLabelKeys(['post', 'mystery', 'chat'])).toEqual([
      'media.gallery.surfacePost',
      'media.gallery.surfaceChat',
    ]);
  });

  it('files the pictures nobody named under a heading of their own', () => {
    expect(purposeLabelKey('other')).toBe(GALLERY_PURPOSE_LABEL.other);
    // A purpose added on the database side is not an error client-side: it is a
    // heading the copy has not caught up with, and the key says so plainly.
    expect(purposeLabelKey('mystery')).toBe('media.gallery.purpose.mystery');
  });

  it('has Bangla and English for every key the picker can ask for', () => {
    const keys = [
      ...Object.values(GALLERY_FILTER_LABEL),
      ...Object.values(GALLERY_PURPOSE_LABEL),
      ...Object.values(GALLERY_SURFACE_LABEL),
    ];
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(enKeys.has(key), `en is missing ${key}`).toBe(true);
      expect(bnKeys.has(key), `bn is missing ${key}`).toBe(true);
    }
  });
});
