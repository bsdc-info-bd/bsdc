/**
 * How a post's pictures are laid out, decided from the pictures themselves.
 *
 * A feed that shows one image at a fixed height and hides the rest is not a
 * gallery, and a grid that treats every picture as a square is not either: a
 * panorama becomes a letterbox and a portrait becomes a crop of somebody's
 * chest. This module takes the sizes the upload measured and returns a layout
 * the renderer can follow without measuring anything itself — no flash of the
 * wrong shape, no layout shift as images arrive.
 *
 * Everything here is pure. The renderer (MediaGallery) draws it, the card
 * (PostCard) asks it where the pictures belong, and the tests can assert the
 * whole arrangement from a list of widths and heights.
 */

/** What the upload recorded about a picture. Null means "not measured". */
export interface SizedMedia {
  width: number | null;
  height: number | null;
}

export type MediaLayout = 'empty' | 'hero' | 'pair' | 'trio' | 'quad' | 'gallery';

/** Where a card should put its pictures: as the header, or in the body. */
export type MediaPlacement = 'none' | 'header' | 'body';

export interface MediaCell {
  /** Position in the author's own order. Reordering is the author's, not ours. */
  index: number;
  /** CSS `aspect-ratio` for the box this picture is cropped into. */
  ratio: string;
  columnSpan: number;
  rowSpan: number;
  /**
   * CSS `object-position`, chosen so the crop keeps the part of the picture
   * that carries it instead of cutting through the middle.
   */
  align: string;
  /** Pictures sitting behind this cell, shown as "+N" on top of it. */
  overflow: number;
}

export interface MediaArrangement {
  layout: MediaLayout;
  columns: number;
  rows: number;
  cells: MediaCell[];
  /** True when the grid bleeds to the edge of the card that contains it. */
  flush: boolean;
  shown: number;
  hidden: number;
}

/** At most four cells: past that a grid stops reading as a set of pictures. */
export const MAX_CELLS = 4;

/** A hero wider than a cinema screen or taller than a phone is not a hero. */
export const HERO_WIDEST = 21 / 9;
export const HERO_TALLEST = 3 / 4;
/** The ratio used when the upload could not measure the picture. */
export const HERO_DEFAULT = 16 / 9;
/** Portrait pictures in a pair keep more of their height than a square would. */
export const PORTRAIT = 4 / 5;
/** A picture this much narrower than its box is cropped from the top down. */
const SUBJECT_BAND = '22%';

export function naturalRatio(item: SizedMedia): number | null {
  if (typeof item.width !== 'number' || typeof item.height !== 'number') return null;
  if (!Number.isFinite(item.width) || !Number.isFinite(item.height)) return null;
  if (item.width <= 0 || item.height <= 0) return null;
  return item.width / item.height;
}

export function isPortrait(item: SizedMedia): boolean {
  const ratio = naturalRatio(item);
  return ratio !== null && ratio < 1;
}

function clampRatio(ratio: number | null, min: number, max: number, fallback: number): number {
  if (ratio === null) return fallback;
  return Math.min(Math.max(ratio, min), max);
}

function ratioCss(ratio: number): string {
  // Two decimals is more precision than a pixel grid can show, and it keeps
  // the value readable in the inspector.
  return `${Math.round(ratio * 100) / 100} / 1`;
}

/**
 * Where a cover-cropped picture should sit inside its box.
 *
 * When the box is wider than the picture, the crop takes the sides — centre is
 * right, because the subject of a portrait or a product shot is in the middle.
 * When the box is taller than the picture's shape allows, the crop takes the
 * top and bottom, and the top is where the thing being photographed usually
 * is: a face, a heading, a skyline. Cutting from the bottom keeps it.
 */
export function alignFor(item: SizedMedia, box: number): string {
  const ratio = naturalRatio(item);
  if (ratio === null) return 'center';
  // ratio < box: the picture is narrower than the box, so the box crops it
  // vertically and the top band is the one worth keeping.
  if (ratio < box) return `center ${SUBJECT_BAND}`;
  return 'center';
}

function cell(index: number, ratio: number, item: SizedMedia, span?: { c?: number; r?: number }) {
  return {
    index,
    ratio: ratioCss(ratio),
    columnSpan: span?.c ?? 1,
    rowSpan: span?.r ?? 1,
    align: alignFor(item, ratio),
    overflow: 0,
  } satisfies MediaCell;
}

export const EMPTY_ARRANGEMENT: MediaArrangement = {
  layout: 'empty',
  columns: 1,
  rows: 1,
  cells: [],
  flush: false,
  shown: 0,
  hidden: 0,
};

/**
 * Lay out a post's pictures.
 *
 * The order is the author's; only the shape of the boxes is decided here.
 * `media` may be longer than what is shown — the extra pictures sit behind the
 * last cell and open in the lightbox from there.
 */
export function arrangeMedia(media: readonly SizedMedia[]): MediaArrangement {
  const total = media.length;
  if (total === 0) return EMPTY_ARRANGEMENT;

  const shown = Math.min(total, MAX_CELLS);
  const hidden = total - shown;
  const visible = media.slice(0, shown);

  if (shown === 1) {
    const item = visible[0] ?? { width: null, height: null };
    const ratio = clampRatio(naturalRatio(item), HERO_TALLEST, HERO_WIDEST, HERO_DEFAULT);
    return {
      layout: 'hero',
      columns: 1,
      rows: 1,
      cells: [cell(0, ratio, item)],
      flush: true,
      shown: 1,
      hidden,
    };
  }

  if (shown === 2) {
    // Two portraits side by side want a taller box than two squares; anything
    // else reads better as a pair of squares, whatever the originals were.
    const bothPortrait = visible.every((item) => isPortrait(item));
    const ratio = bothPortrait ? PORTRAIT : 1;
    return {
      layout: 'pair',
      columns: 2,
      rows: 1,
      cells: visible.map((item, index) => cell(index, ratio, item)),
      flush: false,
      shown: 2,
      hidden,
    };
  }

  if (shown === 3) {
    // One tall picture down the left, two squares stacked on the right. The
    // left cell spans both rows, so its own ratio is half as wide as it is
    // tall once the gap is folded in.
    const [first, second, third] = visible as [SizedMedia, SizedMedia, SizedMedia];
    const leftRatio = clampRatio(naturalRatio(first), 0.45, 0.8, 0.6);
    return {
      layout: 'trio',
      columns: 2,
      rows: 2,
      cells: [
        cell(0, leftRatio, first, { r: 2 }),
        cell(1, 1, second ?? { width: null, height: null }),
        cell(2, 1, third ?? { width: null, height: null }),
      ],
      flush: false,
      shown: 3,
      hidden,
    };
  }

  // Four or more: a square grid, with the count of the rest on the last cell.
  const cells = visible.map((item, index) => {
    const made = cell(index, 1, item);
    return index === shown - 1 ? { ...made, overflow: hidden } : made;
  });
  return {
    layout: hidden > 0 ? 'gallery' : 'quad',
    columns: 2,
    rows: 2,
    cells,
    flush: false,
    shown,
    hidden,
  };
}

/**
 * Where a card puts its pictures.
 *
 * A single picture is the post's header: it goes first, edge to edge, with the
 * byline underneath it — the alignment people expect from every feed they have
 * used. A set of pictures is content the reader chooses to look at, so it stays
 * in the body under the title, where a grid does not compete with the byline.
 */
export function placementFor(media: readonly SizedMedia[]): MediaPlacement {
  const arrangement = arrangeMedia(media);
  if (arrangement.layout === 'empty') return 'none';
  return arrangement.layout === 'hero' ? 'header' : 'body';
}

/**
 * The order pictures are attached in, kept stable across renders.
 *
 * `post_media` carries a position, and a reorder in the composer writes new
 * positions; this is the one place that decides what "first" means when the
 * positions are missing, duplicated or out of range.
 */
export function sortMedia<T extends { position: number }>(media: readonly T[]): T[] {
  return media
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byPosition = (a.item.position ?? 0) - (b.item.position ?? 0);
      return byPosition !== 0 ? byPosition : a.index - b.index;
    })
    .map((entry) => entry.item);
}
