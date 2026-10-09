import { describe, expect, it } from 'vitest';
import {
  clampCrop,
  displayBoxFor,
  cropForRatio,
  cssFilterFor,
  DEFAULT_EDIT,
  estimatedBytes,
  FULL_CROP,
  isEditableType,
  isUntouched,
  MIN_DIMENSION,
  outputNameFor,
  outputSizeFor,
  outputTypeFor,
  refitCropOnRotate,
  sizeAfterRotation,
} from './edit';

const edit = (changes: Partial<typeof DEFAULT_EDIT> = {}) => ({ ...DEFAULT_EDIT, ...changes });

describe('which pictures can be edited at all', () => {
  it('takes the still formats a canvas can draw and write', () => {
    expect(isEditableType('image/jpeg')).toBe(true);
    expect(isEditableType('image/png')).toBe(true);
    expect(isEditableType('image/webp')).toBe(true);
    expect(isEditableType('image/avif')).toBe(true);
  });

  it('leaves a moving picture alone rather than flattening it into one frame', () => {
    expect(isEditableType('image/gif')).toBe(false);
    expect(isEditableType('image/svg+xml')).toBe(false);
    expect(isEditableType('video/mp4')).toBe(false);
    expect(isEditableType('')).toBe(false);
  });
});

describe('turning a picture', () => {
  it('swaps the sides on a quarter turn and keeps them on a half turn', () => {
    expect(sizeAfterRotation(1600, 900, 0)).toEqual({ width: 1600, height: 900 });
    expect(sizeAfterRotation(1600, 900, 90)).toEqual({ width: 900, height: 1600 });
    expect(sizeAfterRotation(1600, 900, 180)).toEqual({ width: 1600, height: 900 });
    expect(sizeAfterRotation(1600, 900, 270)).toEqual({ width: 900, height: 1600 });
  });

  it('moves the crop with the picture, so a quarter turn does not select somewhere else', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const turned = refitCropOnRotate(crop, 0, 90);
    expect(turned.width).toBeCloseTo(crop.height);
    expect(turned.height).toBeCloseTo(crop.width);
    // The centre follows the turn instead of staying where the old frame was.
    expect(turned.x + turned.width / 2).toBeCloseTo(1 - (crop.y + crop.height / 2));
    expect(turned.y + turned.height / 2).toBeCloseTo(crop.x + crop.width / 2);

    const halfTurn = refitCropOnRotate(crop, 0, 180);
    expect(halfTurn.x + halfTurn.width / 2).toBeCloseTo(1 - (crop.x + crop.width / 2));
    expect(halfTurn.y + halfTurn.height / 2).toBeCloseTo(1 - (crop.y + crop.height / 2));

    expect(refitCropOnRotate(crop, 0, 0)).toEqual(clampCrop(crop));
    // Two quarter turns are a half turn, whichever way round they are asked for.
    expect(refitCropOnRotate(crop, 90, 270).width).toBeCloseTo(halfTurn.width);
  });

  it('keeps the crop inside the picture however far it is pushed', () => {
    expect(clampCrop({ x: -2, y: -2, width: 4, height: 4 })).toEqual(FULL_CROP);
    expect(clampCrop({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 })).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
    const tiny = clampCrop({ x: 0.5, y: 0.5, width: 0, height: -1 });
    expect(tiny.width).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(0);
  });
});

describe('a crop asked to be a shape', () => {
  const picture = { width: 1600, height: 900 };

  it('takes the whole height for a shape narrower than the picture', () => {
    const crop = cropForRatio(FULL_CROP, 1, picture, 0);
    expect(crop.height).toBe(1);
    expect(crop.width).toBeCloseTo(900 / 1600);
    expect(crop.x + crop.width / 2).toBeCloseTo(0.5);
  });

  it('takes the whole width for a shape wider than the picture', () => {
    const crop = cropForRatio(FULL_CROP, 21 / 9, picture, 0);
    expect(crop.width).toBe(1);
    expect(crop.height).toBeLessThan(1);
  });

  it("keeps the member's centre rather than snapping back to the middle", () => {
    const offCentre = { x: 0.15, y: 0, width: 0.4, height: 1 };
    const crop = cropForRatio(offCentre, 1, picture, 0);
    expect(crop.x + crop.width / 2).toBeCloseTo(0.35, 5);
  });

  it('measures the shape against the picture as it will be drawn, not as it was stored', () => {
    const turned = cropForRatio(FULL_CROP, 1, picture, 90);
    // After the turn the frame is portrait, so a square takes the whole width.
    expect(turned.width).toBe(1);
    expect(turned.height).toBeLessThan(1);
  });

  it('leaves the crop alone for free and original', () => {
    const crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 };
    expect(cropForRatio(crop, null, picture, 0)).toEqual(clampCrop(crop));
    expect(cropForRatio(crop, 0, picture, 0)).toEqual(clampCrop(crop));
  });
});

describe('how big the result is', () => {
  it('crops in pixels, and never below a size worth encoding', () => {
    expect(outputSizeFor(1600, 900, edit())).toEqual({ width: 1600, height: 900 });
    expect(
      outputSizeFor(1600, 900, edit({ crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } })),
    ).toEqual({ width: 800, height: 450 });
    expect(
      outputSizeFor(2000, 2000, edit({ crop: { x: 0, y: 0, width: 0.001, height: 1 } })),
    ).toEqual({ width: MIN_DIMENSION, height: 2000 });
  });

  it('measures the crop against the turned picture', () => {
    expect(outputSizeFor(1600, 900, edit({ rotate: 90 }))).toEqual({ width: 900, height: 1600 });
  });

  it('scales the longest edge down and keeps the shape', () => {
    expect(outputSizeFor(4000, 3000, edit({ maxWidth: 2000 }))).toEqual({
      width: 2000,
      height: 1500,
    });
    expect(outputSizeFor(3000, 4000, edit({ maxWidth: 2000 }))).toEqual({
      width: 1500,
      height: 2000,
    });
    // Already smaller than the cap: left exactly as it is.
    expect(outputSizeFor(800, 600, edit({ maxWidth: 2000 }))).toEqual({ width: 800, height: 600 });
    expect(outputSizeFor(800, 600, edit({ maxWidth: 0 }))).toEqual({ width: 800, height: 600 });
  });

  it('applies the cap after the crop, not before', () => {
    const cropped = outputSizeFor(
      4000,
      3000,
      edit({ crop: { x: 0, y: 0, width: 0.5, height: 1 }, maxWidth: 1000 }),
    );
    // 2000 x 3000 cropped, capped at a 1000 pixel longest edge.
    expect(cropped).toEqual({ width: 667, height: 1000 });
  });
});

describe('what the sliders do', () => {
  it('writes a css filter string a canvas understands', () => {
    expect(cssFilterFor(edit())).toBe('none');
    expect(cssFilterFor(edit({ brightness: 1.2 }))).toBe('brightness(1.20)');
    expect(cssFilterFor(edit({ contrast: 0.9, saturation: 1.4 }))).toBe(
      'contrast(0.90) saturate(1.40)',
    );
    expect(cssFilterFor(edit({ brightness: 1.05, contrast: 1.1, saturation: 0.8 }))).toBe(
      'brightness(1.05) contrast(1.10) saturate(0.80)',
    );
  });

  it('knows when nothing has been done, so the original bytes can be sent', () => {
    expect(isUntouched(DEFAULT_EDIT)).toBe(true);
    expect(isUntouched(edit({ quality: 0.5 }))).toBe(true);
    expect(isUntouched(edit({ format: 'image/webp' }))).toBe(true);
    expect(isUntouched(edit({ rotate: 90 }))).toBe(false);
    expect(isUntouched(edit({ flipHorizontal: true }))).toBe(false);
    expect(isUntouched(edit({ brightness: 1.2 }))).toBe(false);
    expect(isUntouched(edit({ maxWidth: 1920 }))).toBe(false);
    expect(isUntouched(edit({ crop: { x: 0.1, y: 0, width: 0.9, height: 1 } }))).toBe(false);
  });
});

describe('the box the editor draws into', () => {
  it('fits the turned picture without changing its shape', () => {
    expect(displayBoxFor(1600, 900, 0, 800, 800)).toEqual({ width: 800, height: 450 });
    expect(displayBoxFor(1600, 900, 90, 800, 800)).toEqual({ width: 450, height: 800 });
    expect(displayBoxFor(900, 1600, 0, 800, 800)).toEqual({ width: 450, height: 800 });
  });

  it('never enlarges a picture smaller than the box', () => {
    expect(displayBoxFor(400, 300, 0, 800, 800)).toEqual({ width: 400, height: 300 });
  });

  it('always answers with something drawable', () => {
    const box = displayBoxFor(1, 4000, 0, 600, 200);
    expect(box.width).toBeGreaterThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(1);
  });
});

describe('what comes out the other end', () => {
  it('encodes as asked, and falls back when the browser cannot write the source type', () => {
    expect(outputTypeFor(edit(), 'image/png')).toBe('image/png');
    expect(outputTypeFor(edit({ format: 'image/webp' }), 'image/png')).toBe('image/webp');
    expect(outputTypeFor(edit(), 'image/avif')).toBe('image/jpeg');
    expect(outputTypeFor(edit(), 'image/svg+xml')).toBe('image/jpeg');
  });

  it('names the result after the picture it came from', () => {
    expect(outputNameFor('sunset.png', 'image/png')).toBe('sunset-edited.png');
    expect(outputNameFor('sunset.png', 'image/jpeg')).toBe('sunset-edited.jpg');
    expect(outputNameFor('holiday.photo.webp', 'image/webp')).toBe('holiday.photo-edited.webp');
    expect(outputNameFor('', 'image/jpeg')).toBe('image-edited.jpg');
  });

  it('estimates the weight honestly, and never above what came in', () => {
    const source = 2_400_000;
    expect(estimatedBytes(4000, 3000, DEFAULT_EDIT, source)).toBe(source);
    const halved = estimatedBytes(4000, 3000, edit({ maxWidth: 2000 }), source);
    expect(halved).toBeGreaterThan(0);
    expect(halved).toBeLessThan(source);
    const tiny = estimatedBytes(4000, 3000, edit({ maxWidth: 1280, quality: 0.6 }), source);
    expect(tiny).toBeLessThan(halved);
    // A small picture is not padded up to an estimate.
    expect(estimatedBytes(400, 300, edit({ rotate: 90 }), 20_000)).toBeLessThanOrEqual(20_000);
  });
});
