import { describe, expect, it } from 'vitest';
import {
  alignFor,
  arrangeMedia,
  EMPTY_ARRANGEMENT,
  HERO_DEFAULT,
  HERO_TALLEST,
  HERO_WIDEST,
  MAX_CELLS,
  naturalRatio,
  placementFor,
  sortMedia,
} from './arrangement';

const wide = { width: 1920, height: 640 }; // 3/1 panorama
const normal = { width: 1600, height: 900 }; // 16/9
const square = { width: 1000, height: 1000 };
const portrait = { width: 900, height: 1600 }; // phone held upright
const unknown = { width: null, height: null };

function ratios(cells: { ratio: string }[]): number[] {
  return cells.map((cell) => Number(cell.ratio.split('/')[0]?.trim()));
}

describe('reading a size', () => {
  it('divides width by height and refuses anything it cannot trust', () => {
    expect(naturalRatio(square)).toBe(1);
    expect(naturalRatio(portrait)).toBeCloseTo(0.5625);
    expect(naturalRatio(unknown)).toBeNull();
    expect(naturalRatio({ width: 0, height: 100 })).toBeNull();
    expect(naturalRatio({ width: -4, height: 100 })).toBeNull();
    expect(naturalRatio({ width: Number.NaN, height: 100 })).toBeNull();
  });
});

describe('one picture', () => {
  it('becomes the header, edge to edge', () => {
    const layout = arrangeMedia([normal]);
    expect(layout.layout).toBe('hero');
    expect(layout.flush).toBe(true);
    expect(layout.cells).toHaveLength(1);
    expect(layout.cells[0]?.index).toBe(0);
    expect(placementFor([normal])).toBe('header');
  });

  it('keeps its own shape, within reason', () => {
    expect(ratios(arrangeMedia([normal]).cells)[0]).toBeCloseTo(1.78, 1);
    expect(ratios(arrangeMedia([square]).cells)[0]).toBe(1);
  });

  it('stops a panorama from becoming a letterbox and a phone photo from becoming a wall', () => {
    const panorama = ratios(arrangeMedia([wide]).cells)[0] ?? 0;
    const tall = ratios(arrangeMedia([portrait]).cells)[0] ?? 0;
    expect(panorama).toBeLessThanOrEqual(HERO_WIDEST + 0.01);
    expect(panorama).toBeGreaterThan(1.5);
    expect(tall).toBeGreaterThanOrEqual(HERO_TALLEST - 0.01);
    expect(tall).toBeLessThan(1);
  });

  it('assumes a shape when the upload could not measure one', () => {
    // Two decimals of ratio is more than a pixel grid can show.
    expect(ratios(arrangeMedia([unknown]).cells)[0]).toBeCloseTo(HERO_DEFAULT, 1);
  });
});

describe('several pictures', () => {
  it('puts two side by side, and gives two portraits the height they need', () => {
    const pair = arrangeMedia([normal, square]);
    expect(pair.layout).toBe('pair');
    expect(pair.columns).toBe(2);
    expect(ratios(pair.cells)).toEqual([1, 1]);

    const twoPortraits = arrangeMedia([portrait, { width: 800, height: 1200 }]);
    expect(ratios(twoPortraits.cells)[0]).toBeLessThan(1);
    expect(placementFor([normal, square])).toBe('body');
  });

  it('gives three a tall picture on the left and two squares on the right', () => {
    const trio = arrangeMedia([portrait, square, normal]);
    expect(trio.layout).toBe('trio');
    expect(trio.columns).toBe(2);
    expect(trio.rows).toBe(2);
    expect(trio.cells[0]?.rowSpan).toBe(2);
    expect(trio.cells[1]?.rowSpan).toBe(1);
    const left = Number(trio.cells[0]?.ratio.split('/')[0]);
    expect(left).toBeGreaterThan(0.4);
    expect(left).toBeLessThan(0.85);
  });

  it('makes four a grid', () => {
    const quad = arrangeMedia([square, square, square, square]);
    expect(quad.layout).toBe('quad');
    expect(quad.cells).toHaveLength(4);
    expect(quad.hidden).toBe(0);
    expect(quad.cells.every((cell) => cell.overflow === 0)).toBe(true);
    expect(placementFor([square, square, square, square])).toBe('body');
  });

  it('shows four of a longer set and says how many are behind them', () => {
    const gallery = arrangeMedia([square, square, square, square, square, square, square]);
    expect(gallery.layout).toBe('gallery');
    expect(gallery.cells).toHaveLength(MAX_CELLS);
    expect(gallery.shown).toBe(MAX_CELLS);
    expect(gallery.hidden).toBe(3);
    expect(gallery.cells[3]?.overflow).toBe(3);
    expect(gallery.cells[0]?.overflow).toBe(0);
  });

  it('never invents a cell for a picture that is not there', () => {
    expect(arrangeMedia([])).toEqual(EMPTY_ARRANGEMENT);
    expect(placementFor([])).toBe('none');
  });

  it("leaves the author's order alone", () => {
    const layout = arrangeMedia([portrait, wide, square, normal, wide]);
    expect(layout.cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3]);
  });
});

describe('where the crop lands', () => {
  it('keeps the top of a picture that is taller than its box', () => {
    expect(alignFor(portrait, 1)).toBe('center 22%');
    expect(alignFor(square, 16 / 9)).toBe('center 22%');
  });

  it('keeps the middle of a picture that is wider than its box', () => {
    expect(alignFor(wide, 1)).toBe('center');
    expect(alignFor(normal, 1)).toBe('center');
  });

  it('centres what it cannot measure', () => {
    expect(alignFor(unknown, 1)).toBe('center');
  });

  it('and the arrangement carries that alignment into every cell', () => {
    const layout = arrangeMedia([portrait, wide]);
    expect(layout.cells[0]?.align).toBe('center 22%');
    expect(layout.cells[1]?.align).toBe('center');
  });
});

describe('the order pictures are attached in', () => {
  it('follows position, and falls back to the order they arrived', () => {
    const media = [
      { position: 2, id: 'c' },
      { position: 0, id: 'a' },
      { position: 1, id: 'b' },
    ];
    expect(sortMedia(media).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(
      sortMedia([
        { position: 0, id: 'first' },
        { position: 0, id: 'second' },
      ]).map((item) => item.id),
    ).toEqual(['first', 'second']);
  });

  it('does not rearrange the array it was given', () => {
    const media = [{ position: 1 }, { position: 0 }];
    sortMedia(media);
    expect(media.map((item) => item.position)).toEqual([1, 0]);
  });
});
