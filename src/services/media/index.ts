/**
 * BSDC — src/services/media/index.ts
 * Purpose : The one upload entry point: validate, choose a provider, upload, report progress.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Callers never choose a provider. They name the surface (avatar, feedImage, chatPdf…)
 *   and this module resolves the provider from src/core/config/limits.ts. That is the whole
 *   reason LAW-05 is enforceable: there is no second place where the decision is made.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { type AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result/Result';
import { uploadToCloudinary, type CloudinaryUpload } from './cloudinary';
import { uploadToImgbb, type ImgbbUpload } from './imgbb';
import { describeFile, validateMedia, type MediaContext } from './validate';

/** Normalised result of a successful upload, whatever the provider. */
export interface MediaUpload {
  readonly url: string;
  readonly provider: 'cloudinary' | 'imgbb';
  /** Provider-native identifier used for transformations or deletion. */
  readonly remoteId: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly context: MediaContext;
  /** Host-supplied deletion URL, when the provider offers one. */
  readonly deleteUrl: string;
}

/** Options for an upload. */
export interface UploadMediaOptions {
  /** Progress callback receiving a fraction between 0 and 1. */
  readonly onProgress?: ((fraction: number) => void) | undefined;
  /** Folder for Cloudinary assets. */
  readonly folder?: string | undefined;
  /** Friendly name for ImgBB assets. */
  readonly name?: string | undefined;
}

/**
 * Uploads a file through the provider its surface is mapped to.
 * @param file file to upload
 * @param context media surface
 * @param options progress and provider hints
 * @returns Ok with the upload record, or Err with an AppError
 */
export async function uploadMedia(
  file: File,
  context: MediaContext,
  options: UploadMediaOptions = {},
): Promise<Result<MediaUpload, AppError>> {
  const candidate = await describeFile(file);
  const validation = validateMedia(candidate, context);
  if (!validation.ok) return err(validation.error);

  const plan = validation.value;
  if (plan.provider === 'cloudinary') {
    const uploaded: Result<CloudinaryUpload, AppError> = await uploadToCloudinary(file, {
      folder: options.folder ?? `bsdc/${context}`,
      ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
    });
    return uploaded.ok
      ? ok({
          url: uploaded.value.url,
          provider: 'cloudinary',
          remoteId: uploaded.value.publicId,
          width: uploaded.value.width,
          height: uploaded.value.height,
          bytes: uploaded.value.bytes,
          context,
          deleteUrl: '',
        })
      : uploaded;
  }

  const uploaded: Result<ImgbbUpload, AppError> = await uploadToImgbb(file, {
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
  });
  return uploaded.ok
    ? ok({
        url: uploaded.value.displayUrl,
        provider: 'imgbb',
        remoteId: uploaded.value.id,
        width: uploaded.value.width,
        height: uploaded.value.height,
        bytes: uploaded.value.bytes,
        context,
        deleteUrl: uploaded.value.deleteUrl,
      })
    : uploaded;
}
