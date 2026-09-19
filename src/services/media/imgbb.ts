/**
 * BSDC — src/services/media/imgbb.ts
 * Purpose : Bulk, non-critical image upload through ImgBB (LAW-05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Feed images, chat images and story frames are high-volume and disposable: if one is
 *   lost, the conversation loses a picture, not a record. They are therefore stored on ImgBB,
 *   which keeps the durable Cloudinary quota for assets that must never disappear. Media asset
 *   documents record the provider per asset, so a future migration is a data task, not a mystery.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result/Result';
import { IMGBB } from '@/core/config/firebase';
import { uploadWithProgress } from './transport';

/** A successful ImgBB upload. */
export interface ImgbbUpload {
  readonly url: string;
  readonly displayUrl: string;
  readonly deleteUrl: string;
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  /** Seconds until the host expires the image, when the host supports expiration. */
  readonly expiration: number;
  readonly provider: 'imgbb';
}

/** Fields of the ImgBB upload response that BSDC reads. */
interface ImgbbResponse {
  readonly data?: {
    readonly id?: string;
    readonly url?: string;
    readonly display_url?: string;
    readonly delete_url?: string;
    readonly width?: string | number;
    readonly height?: string | number;
    readonly size?: string | number;
    readonly expiration?: string | number;
  };
  readonly error?: { readonly message?: string };
}

/** Options for an upload. */
export interface ImgbbUploadOptions {
  /** Friendly name recorded by the host. */
  readonly name?: string | undefined;
  /** Seconds until the host may discard the image. Omitted means no expiry. */
  readonly expirationSeconds?: number | undefined;
  readonly onProgress?: ((fraction: number) => void) | undefined;
}

/**
 * Encodes a File as a base64 data payload for the ImgBB API.
 * @param file file to encode
 * @returns the base64 body without the data-url prefix
 */
export async function toBase64Body(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < buffer.length; index += chunkSize) {
    binary += String.fromCharCode(...Array.from(buffer.subarray(index, index + chunkSize)));
  }
  return btoa(binary);
}

/**
 * Uploads an image to ImgBB.
 * @param file image file
 * @param options name, expiration and progress callback
 * @returns Ok with the upload record, or Err with an AppError
 */
export async function uploadToImgbb(
  file: File,
  options: ImgbbUploadOptions = {},
): Promise<Result<ImgbbUpload, AppError>> {
  if (IMGBB.apiKey.length === 0) {
    return err(new AppError('BSDC-MEDIA-008', { provider: 'imgbb', reason: 'not-configured' }));
  }

  const form = new FormData();
  form.append('image', await toBase64Body(file));
  if (options.name !== undefined) form.append('name', options.name);
  if (options.expirationSeconds !== undefined) {
    form.append('expiration', String(options.expirationSeconds));
  }

  const url = `${IMGBB.uploadUrl}?key=${encodeURIComponent(IMGBB.apiKey)}`;
  const response = await uploadWithProgress(url, form, options.onProgress);
  if (!response.ok) return err(response.error);

  const payload = JSON.parse(response.value) as ImgbbResponse;
  const data = payload.data;
  if (payload.error !== undefined || data?.url === undefined) {
    return err(
      new AppError('BSDC-MEDIA-008', {
        provider: 'imgbb',
        reason: payload.error?.message ?? 'malformed-response',
      }),
    );
  }

  return ok({
    url: data.url,
    displayUrl: data.display_url ?? data.url,
    deleteUrl: data.delete_url ?? '',
    id: data.id ?? '',
    width: Number(data.width ?? 0),
    height: Number(data.height ?? 0),
    bytes: Number(data.size ?? file.size),
    expiration: Number(data.expiration ?? 0),
    provider: 'imgbb',
  });
}
