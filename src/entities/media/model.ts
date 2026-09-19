/**
 * BSDC — src/entities/media/model.ts
 * Purpose : The media asset entity: what we keep about an uploaded file.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The asset record is the durable receipt of an upload: where it lives, who owns it,
 *   which surface it belongs to and its intrinsic size. Size is stored so every render can emit
 *   width and height and therefore never cause layout shift (PART 25).
 *   The blur preview is generated on the device at upload time and stored as a data URL, which is
 *   why a feed card can paint a finished-looking frame before the image has arrived.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { MediaContext } from '@/services/media/validate';
import type { MediaUpload } from '@/services/media';
import type { LocalPreview } from '@/services/media/preview';

/** A stored media asset. */
export interface MediaAsset {
  readonly id: string;
  readonly ownerUid: string;
  readonly context: MediaContext;
  readonly provider: 'cloudinary' | 'imgbb';
  readonly url: string;
  readonly remoteId: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly alt: string;
  readonly blurPreview: string;
  readonly dominantColor: string;
  /** Host-supplied deletion URL, when the provider offers one. */
  readonly deleteUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Inputs for building an asset record. */
export interface NewMediaAssetInput {
  readonly upload: MediaUpload;
  readonly ownerUid: string;
  readonly alt: string;
  readonly preview: LocalPreview | null;
  readonly id?: string | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds a media asset record from a completed upload.
 * @param input upload result, owner, alt text and local preview
 * @returns the asset entity
 */
export function newMediaAsset(input: NewMediaAssetInput): MediaAsset {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id ?? input.upload.remoteId,
    ownerUid: input.ownerUid,
    context: input.upload.context,
    provider: input.upload.provider,
    url: input.upload.url,
    remoteId: input.upload.remoteId,
    width: input.upload.width,
    height: input.upload.height,
    bytes: input.upload.bytes,
    alt: input.alt.trim(),
    blurPreview: input.preview?.blurDataUrl ?? '',
    dominantColor: input.preview?.dominantColor ?? '#1b2436',
    deleteUrl: input.upload.deleteUrl,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Chooses a sensible srcset for an asset based on its intrinsic width.
 * @param asset the asset
 * @returns candidate widths, never wider than the original
 */
export function srcSetWidths(asset: MediaAsset): readonly number[] {
  const candidates = [320, 480, 720, 1080, 1440, 1920];
  const usable = candidates.filter((width) => width <= asset.width);
  return usable.length > 0 ? [...usable, asset.width] : [asset.width];
}

/**
 * Computes the rendered height for a target width, preserving aspect ratio.
 * @param asset the asset
 * @param width target width
 * @returns the height in pixels
 */
export function heightForWidth(asset: MediaAsset, width: number): number {
  if (asset.width === 0) return Math.round(width * 0.5625);
  return Math.round((asset.height / asset.width) * width);
}
