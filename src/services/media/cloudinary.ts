/**
 * BSDC — src/services/media/cloudinary.ts
 * Purpose : Durable media upload and delivery through Cloudinary (LAW-05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Uploads use an unsigned preset, which is why the browser holds an API key and never a
 *   secret: the preset is constrained server-side in the Cloudinary console to a fixed folder,
 *   a fixed transformation set and a fixed format allow-list. Avatars, covers, product images,
 *   ad creatives and branding exports live here because they must survive forever.
 *   Delivery URLs are built, not stored: width, format and quality are decided per viewport, so
 *   one asset serves 250px and 5120px without a second upload.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result/Result';
import { CLOUDINARY } from '@/core/config/firebase';
import { uploadWithProgress } from './transport';

/** A successful Cloudinary upload. */
export interface CloudinaryUpload {
  readonly url: string;
  readonly publicId: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly format: string;
  readonly provider: 'cloudinary';
}

/** Fields of the Cloudinary upload response that BSDC reads. */
interface CloudinaryResponse {
  readonly secure_url?: string;
  readonly url?: string;
  readonly public_id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
  readonly format?: string;
  readonly error?: { readonly message?: string };
}

/** Options for an upload. */
export interface CloudinaryUploadOptions {
  /** Logical folder, e.g. `bsdc/avatars`. Preset restrictions still apply. */
  readonly folder: string;
  /** Free-form tags used by the moderation and search tooling. */
  readonly tags?: readonly string[] | undefined;
  readonly onProgress?: ((fraction: number) => void) | undefined;
}

/**
 * Builds a Cloudinary delivery URL with on-the-fly transformations.
 * @param publicId Cloudinary public id
 * @param transform delivery parameters
 * @returns an absolute URL
 */
export function cloudinaryUrl(
  publicId: string,
  transform: { readonly width?: number; readonly height?: number; readonly blur?: boolean } = {},
): string {
  if (CLOUDINARY.cloudName.length === 0) return publicId;
  const parts: string[] = [];
  if (transform.width !== undefined) parts.push(`w_${Math.round(transform.width)}`);
  if (transform.height !== undefined) parts.push(`h_${Math.round(transform.height)}`);
  parts.push('c_limit', 'q_auto', 'f_auto', 'dpr_auto');
  if (transform.blur === true) parts.push('e_blur:600');
  return `https://res.cloudinary.com/${CLOUDINARY.cloudName}/image/upload/${parts.join(',')}/${publicId}`;
}

/**
 * Builds a tiny, blurred preview of an asset for progressive loading.
 * @param publicId Cloudinary public id
 * @returns a 32-pixel-wide blurred URL
 */
export function cloudinaryPreview(publicId: string): string {
  return cloudinaryUrl(publicId, { width: 32, blur: true });
}

/**
 * Builds a width-descriptor srcset for responsive delivery.
 * @param publicId Cloudinary public id
 * @param widths candidate widths
 * @returns a srcset attribute value
 */
export function cloudinarySrcSet(publicId: string, widths: readonly number[]): string {
  return widths.map((width) => `${cloudinaryUrl(publicId, { width })} ${width}w`).join(', ');
}

/**
 * Uploads a file to Cloudinary through the unsigned preset.
 * @param file file to upload
 * @param options folder, tags and progress callback
 * @returns Ok with the upload record, or Err with an AppError
 */
export async function uploadToCloudinary(
  file: File,
  options: CloudinaryUploadOptions,
): Promise<Result<CloudinaryUpload, AppError>> {
  if (CLOUDINARY.cloudName.length === 0 || CLOUDINARY.unsignedPreset.length === 0) {
    return err(
      new AppError('BSDC-MEDIA-008', { provider: 'cloudinary', reason: 'not-configured' }),
    );
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY.unsignedPreset);
  form.append('folder', options.folder);
  if (options.tags !== undefined && options.tags.length > 0) {
    form.append('tags', options.tags.join(','));
  }

  const response = await uploadWithProgress(CLOUDINARY.uploadUrl, form, options.onProgress);
  if (!response.ok) return err(response.error);

  const payload = JSON.parse(response.value) as CloudinaryResponse;
  if (payload.error !== undefined || payload.public_id === undefined) {
    return err(
      new AppError('BSDC-MEDIA-008', {
        provider: 'cloudinary',
        reason: payload.error?.message ?? 'malformed-response',
      }),
    );
  }

  return ok({
    url: payload.secure_url ?? payload.url ?? '',
    publicId: payload.public_id,
    width: payload.width ?? 0,
    height: payload.height ?? 0,
    bytes: payload.bytes ?? file.size,
    format: payload.format ?? '',
    provider: 'cloudinary',
  });
}
