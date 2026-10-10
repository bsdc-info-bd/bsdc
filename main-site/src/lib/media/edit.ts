/**
 * Editing a picture before it is attached.
 *
 * The complaint this answers is not that cropping is missing from a menu — it
 * is that a member who took a photo sideways, or with half the frame given to
 * a table, had no way to fix it without leaving the site. Everything here
 * happens in the browser, on a canvas, before a single byte is uploaded: the
 * stored picture is the edited one, so the feed, the post page, the search
 * index and the notification preview all agree without any of them knowing an
 * edit happened.
 *
 * The geometry is split from the drawing on purpose. `outputSizeFor`,
 * `clampCrop`, `refitCropOnRotate` and `cssFilterFor` are pure and covered by
 * tests; `renderEdit` is the only part that touches a canvas, and a test
 * environment has no canvas to touch.
 */

export type Rotation = 0 | 90 | 180 | 270;

/** A crop as fractions of the picture it is taken from, after rotation. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditState {
  crop: CropRect;
  rotate: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** 1 is untouched. 0.4–1.8 is the range a slider can reach. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Longest edge the result is scaled down to; 0 keeps the original size. */
  maxWidth: number;
  /** Encoder quality, 0.5–0.95. */
  quality: number;
  /** What the result is encoded as. 'source' keeps whatever came in. */
  format: 'source' | 'image/jpeg' | 'image/webp';
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export const DEFAULT_EDIT: EditState = {
  crop: FULL_CROP,
  rotate: 0,
  flipHorizontal: false,
  flipVertical: false,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  maxWidth: 0,
  quality: 0.86,
  format: 'source',
};

/** Crop shapes offered in the editor, in the order a member reaches for them. */
export const CROP_PRESETS: { id: string; ratio: number | null }[] = [
  { id: 'free', ratio: null },
  { id: 'original', ratio: 0 },
  { id: 'square', ratio: 1 },
  { id: 'portrait', ratio: 4 / 5 },
  { id: 'story', ratio: 9 / 16 },
  { id: 'landscape', ratio: 16 / 9 },
];

/** Longest-edge choices. Mobile data is not free, and neither is a 12 MB PNG. */
export const SIZE_CHOICES = [0, 2560, 1920, 1280];

export const MIN_DIMENSION = 16;

/** A picture that moves cannot be flattened into a still without saying so. */
export function isEditableType(mimeType: string): boolean {
  const type = mimeType.toLowerCase();
  return (
    type === 'image/jpeg' ||
    type === 'image/png' ||
    type === 'image/webp' ||
    type === 'image/avif' ||
    type === 'image/bmp'
  );
}

export function sizeAfterRotation(width: number, height: number, rotate: Rotation) {
  return rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height };
}

function roundToEven(value: number): number {
  return Math.max(MIN_DIMENSION, Math.round(value));
}

/** The pixel size the edited picture will have, before any scaling down. */
export function croppedSize(
  width: number,
  height: number,
  edit: Pick<EditState, 'crop' | 'rotate'>,
): { width: number; height: number } {
  const rotated = sizeAfterRotation(width, height, edit.rotate);
  return {
    width: roundToEven(rotated.width * edit.crop.width),
    height: roundToEven(rotated.height * edit.crop.height),
  };
}

/** The pixel size that is actually encoded, after the longest-edge cap. */
export function outputSizeFor(
  width: number,
  height: number,
  edit: Pick<EditState, 'crop' | 'rotate' | 'maxWidth'>,
): { width: number; height: number } {
  const cropped = croppedSize(width, height, edit);
  if (edit.maxWidth <= 0) return cropped;
  const longest = Math.max(cropped.width, cropped.height);
  if (longest <= edit.maxWidth) return cropped;
  const scale = edit.maxWidth / longest;
  return {
    width: roundToEven(cropped.width * scale),
    height: roundToEven(cropped.height * scale),
  };
}

/** Roughly what the file will weigh, so the member can see the trade. */
export function estimatedBytes(
  width: number,
  height: number,
  edit: EditState,
  sourceBytes: number,
): number {
  const output = outputSizeFor(width, height, edit);
  if (isUntouched(edit)) return sourceBytes;
  const pixels = output.width * output.height;
  const bytesPerPixel = edit.format === 'image/webp' ? 0.28 : 0.42;
  const qualityScale = 0.4 + edit.quality;
  const estimate = pixels * bytesPerPixel * qualityScale;
  // Never promise a result bigger than what came in: the encoder is asked to
  // keep quality, not to invent detail.
  return Math.min(Math.round(estimate), sourceBytes > 0 ? sourceBytes : Number.MAX_SAFE_INTEGER);
}

export function clampCrop(crop: CropRect): CropRect {
  const width = Math.min(Math.max(crop.width, 0.01), 1);
  const height = Math.min(Math.max(crop.height, 0.01), 1);
  return {
    x: Math.min(Math.max(crop.x, 0), 1 - width),
    y: Math.min(Math.max(crop.y, 0), 1 - height),
    width,
    height,
  };
}

/**
 * Move a crop so it stays inside a picture that has just been turned.
 *
 * Rotating 90° swaps the axes; a crop left where it was would silently select
 * a different part of the photograph. Keeping the centre and the shape, and
 * growing no larger than the new frame allows, is what a member expects.
 */
export function refitCropOnRotate(crop: CropRect, from: Rotation, to: Rotation): CropRect {
  const steps = (((to - from) % 360) + 360) % 360;
  if (steps === 0) return clampCrop(crop);
  if (steps === 180) {
    return clampCrop({
      x: 1 - crop.x - crop.width,
      y: 1 - crop.y - crop.height,
      width: crop.width,
      height: crop.height,
    });
  }
  // A quarter turn: the fraction that measured across now measures down.
  const clockwise = steps === 90;
  const width = crop.height;
  const height = crop.width;
  const x = clockwise ? 1 - crop.y - crop.height : crop.y;
  const y = clockwise ? crop.x : 1 - crop.x - crop.width;
  return clampCrop({ x, y, width, height });
}

/**
 * Fit a crop to a shape, keeping it as large as the picture allows and centred
 * on wherever the member had it.
 */
export function cropForRatio(
  crop: CropRect,
  ratio: number | null,
  picture: { width: number; height: number },
  rotate: Rotation,
): CropRect {
  if (ratio === null || ratio <= 0) return clampCrop(crop);
  const frame = sizeAfterRotation(picture.width, picture.height, rotate);
  const frameRatio = frame.width / Math.max(frame.height, 1);
  const centreX = crop.x + crop.width / 2;
  const centreY = crop.y + crop.height / 2;
  let width: number;
  let height: number;
  if (ratio >= frameRatio) {
    width = 1;
    height = frameRatio / ratio;
  } else {
    height = 1;
    width = ratio / frameRatio;
  }
  return clampCrop({ x: centreX - width / 2, y: centreY - height / 2, width, height });
}

export function cssFilterFor(edit: EditState): string {
  const parts: string[] = [];
  if (edit.brightness !== 1) parts.push(`brightness(${edit.brightness.toFixed(2)})`);
  if (edit.contrast !== 1) parts.push(`contrast(${edit.contrast.toFixed(2)})`);
  if (edit.saturation !== 1) parts.push(`saturate(${edit.saturation.toFixed(2)})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

const TOLERANCE = 0.001;

/** True when applying the edit would produce the picture that came in. */
export function isUntouched(edit: EditState): boolean {
  return (
    edit.rotate === 0 &&
    !edit.flipHorizontal &&
    !edit.flipVertical &&
    Math.abs(edit.brightness - 1) < TOLERANCE &&
    Math.abs(edit.contrast - 1) < TOLERANCE &&
    Math.abs(edit.saturation - 1) < TOLERANCE &&
    edit.maxWidth <= 0 &&
    edit.crop.x <= TOLERANCE &&
    edit.crop.y <= TOLERANCE &&
    edit.crop.width >= 1 - TOLERANCE &&
    edit.crop.height >= 1 - TOLERANCE
  );
}

/** The mime type the result is written as. */
export function outputTypeFor(edit: EditState, sourceType: string): string {
  if (edit.format !== 'source') return edit.format;
  // A PNG re-encoded as a PNG after a crop stays a PNG; anything the browser
  // cannot write (AVIF in most of them) falls back to JPEG.
  const writable = ['image/jpeg', 'image/png', 'image/webp'];
  return writable.includes(sourceType.toLowerCase()) ? sourceType : 'image/jpeg';
}

export function outputNameFor(originalName: string, type: string): string {
  const dot = originalName.lastIndexOf('.');
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName || 'image';
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `${stem}-edited.${extension}`;
}

type Drawable = CanvasImageSource;

/**
 * The box a turned picture fits into, without distorting it.
 *
 * The editor draws the preview itself rather than asking CSS to rotate an
 * `<img>`: a turn and a crop have to be shown in the same space the crop is
 * measured in, and a transformed element is not that space.
 */
export function displayBoxFor(
  width: number,
  height: number,
  rotate: Rotation,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const turned = sizeAfterRotation(width, height, rotate);
  const scale = Math.min(maxWidth / turned.width, maxHeight / turned.height, 1);
  return {
    width: Math.max(1, Math.round(turned.width * scale)),
    height: Math.max(1, Math.round(turned.height * scale)),
  };
}

/**
 * Paint an edit onto a canvas of the size asked for.
 *
 * Two passes, because a crop taken from a turned picture cannot be expressed
 * as one transform without guessing at the order the browser will apply it in.
 * The first canvas holds the turn and the flips; the second takes the crop and
 * the adjustments. `workingLimit` caps the first pass, which is what keeps a
 * preview of a 4000-pixel photograph from allocating 4000 pixels of canvas on
 * every movement of a slider — crops are fractions, so the cap costs nothing
 * but preview sharpness.
 */
export function paintEdit(
  source: Drawable,
  natural: { width: number; height: number; type?: string | undefined },
  edit: EditState,
  target: { width: number; height: number },
  workingLimit = 0,
): HTMLCanvasElement {
  const rotated = sizeAfterRotation(natural.width, natural.height, edit.rotate);
  const longest = Math.max(rotated.width, rotated.height, 1);
  const workScale = workingLimit > 0 ? Math.min(1, workingLimit / longest) : 1;
  const work = {
    width: Math.max(1, Math.round(rotated.width * workScale)),
    height: Math.max(1, Math.round(rotated.height * workScale)),
  };

  const turn = document.createElement('canvas');
  turn.width = work.width;
  turn.height = work.height;
  const turnContext = turn.getContext('2d');
  if (!turnContext) throw new Error('media.errors.failed');
  turnContext.translate(work.width / 2, work.height / 2);
  turnContext.scale(workScale, workScale);
  turnContext.rotate((edit.rotate * Math.PI) / 180);
  turnContext.scale(edit.flipHorizontal ? -1 : 1, edit.flipVertical ? -1 : 1);
  turnContext.drawImage(
    source,
    -natural.width / 2,
    -natural.height / 2,
    natural.width,
    natural.height,
  );

  const final = document.createElement('canvas');
  final.width = Math.max(1, target.width);
  final.height = Math.max(1, target.height);
  const context = final.getContext('2d');
  if (!context) throw new Error('media.errors.failed');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  // A JPEG has no alpha, so a transparent PNG turned into one would come out
  // against whatever the canvas started with. Paint the page white first.
  const type = outputTypeFor(edit, natural.type ?? '');
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, final.width, final.height);
  }

  const filter = cssFilterFor(edit);
  if (filter !== 'none') context.filter = filter;
  context.drawImage(
    turn,
    edit.crop.x * work.width,
    edit.crop.y * work.height,
    Math.max(1, edit.crop.width * work.width),
    Math.max(1, edit.crop.height * work.height),
    0,
    0,
    final.width,
    final.height,
  );
  return final;
}

/** Draw the edit onto a canvas the member can see. Returns false if the browser has no canvas. */
export function drawPreview(
  canvas: HTMLCanvasElement,
  source: Drawable,
  natural: { width: number; height: number; type?: string | undefined },
  edit: EditState,
  box: { width: number; height: number },
): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  canvas.width = box.width;
  canvas.height = box.height;
  let painted: HTMLCanvasElement;
  try {
    painted = paintEdit(source, natural, edit, box, PREVIEW_WORKING_LIMIT);
  } catch {
    return false;
  }
  context.clearRect(0, 0, box.width, box.height);
  context.drawImage(painted, 0, 0);
  return true;
}

/** Longest edge a preview is drawn from. Enough to look sharp, small enough to redraw on a slider. */
export const PREVIEW_WORKING_LIMIT = 1600;

/**
 * Encode the edit. This is the picture that gets uploaded — the original is
 * never sent once a member has cropped it, so nothing downstream has to know
 * an edit happened.
 */
export async function renderEdit(
  source: Drawable,
  natural: { width: number; height: number; type?: string },
  edit: EditState,
): Promise<Blob> {
  const target = outputSizeFor(natural.width, natural.height, edit);
  const canvas = paintEdit(source, natural, edit, target);
  const type = outputTypeFor(edit, natural.type ?? '');
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), type, edit.quality);
  });
  if (!blob) throw new Error('media.errors.failed');
  return blob;
}

/**
 * Decode a File into something a canvas can draw, with a fallback for browsers
 * that refuse `createImageBitmap` — which is most of them for AVIF and HEIC.
 */
export async function decodeImage(
  file: Blob,
): Promise<{ source: Drawable; width: number; height: number; type: string }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, type: file.type };
    } catch {
      // Falls through to the element path: a picture the decoder refused may
      // still draw, and the member should get the choice rather than an error.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('media.errors.failed'));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      type: file.type,
    };
  } finally {
    // Revoked after the load has painted: some browsers need the bytes until then.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
