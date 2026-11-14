import { getCorporateIdToken, mediaUploadEndpoints, type CorporateEnv } from '@kit';

export type Rotation = 0 | 90 | 180 | 270;

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AdImageEdit {
  readonly crop: CropRect;
  readonly rotate: Rotation;
  readonly flipHorizontal: boolean;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly maxWidth: number;
  readonly format: 'image/webp' | 'image/jpeg';
}

export const DEFAULT_AD_IMAGE_EDIT: AdImageEdit = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotate: 0,
  flipHorizontal: false,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  maxWidth: 1200,
  format: 'image/webp',
};

export interface AspectPreset {
  readonly id: string;
  readonly label: string;
  readonly ratio: number | null;
}

export const AD_ASPECT_PRESETS: readonly AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'landscape', label: '16:9 Feed', ratio: 16 / 9 },
  { id: 'banner', label: '3:1 Banner', ratio: 3 / 1 },
  { id: 'card', label: '4:3 Card', ratio: 4 / 3 },
  { id: 'square', label: '1:1 Square', ratio: 1 },
];

export const MAX_AD_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_AD_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const EDITABLE_AD_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

const UPLOAD_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'media.errors.signInRequired': 'Sign in with a verified staff account to upload ad creatives.',
  'media.errors.unsupported': 'Choose a JPG, PNG, WebP, GIF, or AVIF image file.',
  'media.errors.empty': 'The selected image file is empty.',
  'media.errors.tooLarge': 'Image must be 10 MB or smaller.',
  'media.errors.notConfigured': 'ImgBB upload is not configured on the edge service yet.',
  'media.errors.failed': 'Upload to ImgBB failed. Try again or paste an ImgBB URL directly.',
};

export function clampCrop(crop: CropRect): CropRect {
  const width = Math.min(1, Math.max(0.08, crop.width));
  const height = Math.min(1, Math.max(0.08, crop.height));
  const x = Math.min(Math.max(0, crop.x), 1 - width);
  const y = Math.min(Math.max(0, crop.y), 1 - height);
  return { x, y, width, height };
}

export function sizeAfterRotation(
  width: number,
  height: number,
  rotate: Rotation,
): { width: number; height: number } {
  return rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height };
}

export function fitCropToRatio(
  current: CropRect,
  ratio: number | null,
  imageWidth: number,
  imageHeight: number,
  rotate: Rotation,
): CropRect {
  if (ratio === null) return { x: 0, y: 0, width: 1, height: 1 };
  const turned = sizeAfterRotation(imageWidth, imageHeight, rotate);
  const pictureRatio = turned.width / Math.max(turned.height, 1);
  const targetNormalizedRatio = ratio / pictureRatio;

  let width = 0.92;
  let height = width / targetNormalizedRatio;
  if (height > 0.92) {
    height = 0.92;
    width = height * targetNormalizedRatio;
  }
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  return clampCrop({
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  });
}

export interface DecodedAdImage {
  readonly element: HTMLImageElement;
  readonly width: number;
  readonly height: number;
  readonly revoke: () => void;
}

export function decodeAdImageFile(file: File): Promise<DecodedAdImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        element: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        revoke: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the selected image.'));
    };
    img.src = objectUrl;
  });
}

function drawTransformedSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  edit: AdImageEdit,
  outWidth: number,
  outHeight: number,
): void {
  const turned = sizeAfterRotation(srcWidth, srcHeight, edit.rotate);
  const sx = edit.crop.x * turned.width;
  const sy = edit.crop.y * turned.height;
  const sw = Math.max(1, edit.crop.width * turned.width);
  const sh = Math.max(1, edit.crop.height * turned.height);

  const stage = document.createElement('canvas');
  stage.width = turned.width;
  stage.height = turned.height;
  const sctx = stage.getContext('2d');
  if (!sctx) throw new Error('Canvas 2D context is unavailable.');

  sctx.save();
  sctx.translate(turned.width / 2, turned.height / 2);
  sctx.rotate((edit.rotate * Math.PI) / 180);
  if (edit.flipHorizontal) sctx.scale(-1, 1);
  sctx.filter = `brightness(${edit.brightness}) contrast(${edit.contrast}) saturate(${edit.saturation})`;
  sctx.drawImage(source, -srcWidth / 2, -srcHeight / 2, srcWidth, srcHeight);
  sctx.restore();

  ctx.clearRect(0, 0, outWidth, outHeight);
  ctx.drawImage(stage, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
}

export function outputDimensions(
  srcWidth: number,
  srcHeight: number,
  edit: AdImageEdit,
): { width: number; height: number } {
  const turned = sizeAfterRotation(srcWidth, srcHeight, edit.rotate);
  const croppedW = Math.max(1, Math.round(edit.crop.width * turned.width));
  const croppedH = Math.max(1, Math.round(edit.crop.height * turned.height));
  if (edit.maxWidth <= 0 || Math.max(croppedW, croppedH) <= edit.maxWidth) {
    return { width: croppedW, height: croppedH };
  }
  const scale = edit.maxWidth / Math.max(croppedW, croppedH);
  return {
    width: Math.max(1, Math.round(croppedW * scale)),
    height: Math.max(1, Math.round(croppedH * scale)),
  };
}

export function paintFullStagePreview(
  canvas: HTMLCanvasElement,
  decoded: DecodedAdImage,
  edit: AdImageEdit,
  maxWidth = 560,
  maxHeight = 320,
): { width: number; height: number } {
  const turned = sizeAfterRotation(decoded.width, decoded.height, edit.rotate);
  const scale = Math.min(
    1,
    maxWidth / Math.max(1, turned.width),
    maxHeight / Math.max(1, turned.height),
  );
  const width = Math.max(1, Math.round(turned.width * scale));
  const height = Math.max(1, Math.round(turned.height * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width, height };

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((edit.rotate * Math.PI) / 180);
  if (edit.flipHorizontal) ctx.scale(-1, 1);
  ctx.filter = `brightness(${edit.brightness}) contrast(${edit.contrast}) saturate(${edit.saturation})`;
  const drawW = edit.rotate === 90 || edit.rotate === 270 ? height : width;
  const drawH = edit.rotate === 90 || edit.rotate === 270 ? width : height;
  ctx.drawImage(decoded.element, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  return { width, height };
}

export async function renderEditedAdImage(
  fileName: string,
  decoded: DecodedAdImage,
  edit: AdImageEdit,
): Promise<File> {
  const { width, height } = outputDimensions(decoded.width, decoded.height, edit);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  drawTransformedSource(ctx, decoded.element, decoded.width, decoded.height, edit, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('Could not encode edited image.'));
      },
      edit.format,
      0.88,
    );
  });

  const ext = edit.format === 'image/webp' ? 'webp' : 'jpg';
  const stem = fileName.replace(/\.[^.]+$/, '') || 'ad-creative';
  return new File([blob], `${stem}.${ext}`, { type: edit.format, lastModified: Date.now() });
}

export interface UploadedAdImage {
  readonly url: string;
  readonly thumbUrl: string;
  readonly width: number | null;
  readonly height: number | null;
}

export async function uploadAdCreativeImage(
  env: CorporateEnv,
  file: File,
): Promise<UploadedAdImage> {
  if (!ALLOWED_AD_IMAGE_TYPES.includes(file.type)) {
    throw new Error(UPLOAD_ERROR_MESSAGES['media.errors.unsupported']);
  }
  if (file.size <= 0) {
    throw new Error(UPLOAD_ERROR_MESSAGES['media.errors.empty']);
  }
  if (file.size > MAX_AD_IMAGE_BYTES) {
    throw new Error(UPLOAD_ERROR_MESSAGES['media.errors.tooLarge']);
  }

  const token = await getCorporateIdToken(env);
  const endpoints = mediaUploadEndpoints(env.siteUrl);

  let response: Response | null = null;
  for (const endpoint of endpoints) {
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'ad-creative');
      const candidate = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      const contentType = candidate.headers?.get('content-type') ?? '';
      if (
        candidate.status === 404 ||
        candidate.status === 405 ||
        (candidate.ok && !contentType.toLowerCase().includes('json'))
      ) {
        continue;
      }
      response = candidate;
      break;
    } catch {
      // Try next BSDC fallback host if any.
    }
  }

  if (response === null) {
    throw new Error('Could not reach the ImgBB upload endpoint on main-site.');
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    errorKey?: string;
    url?: string;
    thumbUrl?: string;
    width?: number | null;
    height?: number | null;
  } | null;

  if (!response.ok || payload?.ok !== true || typeof payload.url !== 'string') {
    const key = payload?.errorKey ?? 'media.errors.failed';
    throw new Error(UPLOAD_ERROR_MESSAGES[key] ?? 'Upload to ImgBB failed.');
  }

  return {
    url: payload.url,
    thumbUrl:
      typeof payload.thumbUrl === 'string' && payload.thumbUrl ? payload.thumbUrl : payload.url,
    width: typeof payload.width === 'number' ? payload.width : null,
    height: typeof payload.height === 'number' ? payload.height : null,
  };
}
