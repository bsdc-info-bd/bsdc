/**
 * BSDC — src/services/media/validate.ts
 * Purpose : Upload validation: what may be uploaded, how large, and through which provider.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   LAW-07 — BSDC accepts no video, anywhere, ever. The check lives at the transport boundary so
 *   no surface can re-enable it by omission.
 *   LAW-05 — Firebase Storage is not the media store. Durable media (avatars, covers, product
 *   images, ad creatives, KYC) goes to Cloudinary; bulk non-critical media (feed and chat images,
 *   story frames) goes to ImgBB. The provider is chosen from the context here, in one table.
 *   Every ceiling comes from src/core/config/limits.ts so the composer counter, this validator
 *   and the Firestore rules can never disagree.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { MEDIA_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result/Result';

/** Every media surface in the product. */
export type MediaContext = keyof typeof MEDIA_LIMITS;

/** Provider used to store the asset. */
export type MediaProvider = 'cloudinary' | 'imgbb' | 'firebase-storage';

/** Accept rules for one context. */
export interface MediaPlan {
  readonly context: MediaContext;
  readonly provider: MediaProvider;
  readonly maxBytes: number;
  readonly maxEdge: number;
}

/** Everything the validator needs to know about a candidate file. */
export interface MediaCandidate {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/** Accepted image mime types. */
export const IMAGE_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
];

/** Accepted document mime types. */
export const DOCUMENT_MIME_TYPES: readonly string[] = ['application/pdf'];

/** Mime types that must never be accepted: video in any container. */
const VIDEO_MIME_PREFIX = 'video/';
const VIDEO_EXTENSIONS: readonly string[] = [
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mkv',
  '.avi',
  '.3gp',
  '.ogg',
  '.ogv',
  '.mts',
  '.m2ts',
];

/**
 * Reports whether a file is video, by type or by extension.
 * @param candidate file description
 * @returns true when the file must be rejected under LAW-07
 */
export function isVideo(candidate: MediaCandidate): boolean {
  if (candidate.mimeType.toLowerCase().startsWith(VIDEO_MIME_PREFIX)) return true;
  const lower = candidate.name.toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Reads a file's intrinsic pixel dimensions.
 * @param file file to probe
 * @returns the width and height, or null when they cannot be read
 */
export async function probeImageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      /* Fall through to the element-based probe below. */
    }
  }
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = (): void => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = (): void => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/**
 * Builds a candidate description from a File, probing dimensions for images.
 * @param file file to describe
 * @returns the candidate
 */
export async function describeFile(file: File): Promise<MediaCandidate> {
  const base: MediaCandidate = {
    name: file.name,
    mimeType: file.type,
    bytes: file.size,
  };
  if (!file.type.startsWith('image/')) return base;
  const size = await probeImageSize(file);
  return size === null ? base : { ...base, width: size.width, height: size.height };
}

/**
 * Resolves the upload plan for a context.
 * @param context media surface
 * @returns the provider and the ceilings
 */
export function planFor(context: MediaContext): MediaPlan {
  const limit = MEDIA_LIMITS[context];
  return {
    context,
    provider: limit.provider,
    maxBytes: limit.maxBytes,
    maxEdge: limit.maxEdge,
  };
}

/**
 * Validates a candidate against a context's plan.
 * @param candidate file description
 * @param context media surface
 * @returns Ok with the plan, or Err with the AppError explaining the refusal
 */
export function validateMedia(
  candidate: MediaCandidate,
  context: MediaContext,
): Result<MediaPlan, AppError> {
  const plan = planFor(context);

  if (isVideo(candidate)) {
    return err(new AppError('BSDC-MEDIA-003', { context, mimeType: candidate.mimeType }));
  }
  if (candidate.bytes <= 0) {
    return err(new AppError('BSDC-MEDIA-005', { context, bytes: candidate.bytes }));
  }
  if (candidate.bytes > plan.maxBytes) {
    return err(
      new AppError('BSDC-MEDIA-005', { context, bytes: candidate.bytes, max: plan.maxBytes }),
    );
  }

  const isImage = IMAGE_MIME_TYPES.includes(candidate.mimeType.toLowerCase());
  const isDocument = DOCUMENT_MIME_TYPES.includes(candidate.mimeType.toLowerCase());
  if (!isImage && !isDocument) {
    return err(new AppError('BSDC-MEDIA-007', { context, mimeType: candidate.mimeType }));
  }
  if (isDocument && !isImage && context !== 'chatPdf' && context !== 'kycDocument') {
    return err(new AppError('BSDC-MEDIA-007', { context, mimeType: candidate.mimeType }));
  }

  if (plan.maxEdge > 0 && candidate.width !== undefined && candidate.height !== undefined) {
    const longest = Math.max(candidate.width, candidate.height);
    if (longest > plan.maxEdge) {
      return err(
        new AppError('BSDC-MEDIA-006', {
          context,
          width: candidate.width,
          height: candidate.height,
          maxEdge: plan.maxEdge,
        }),
      );
    }
  }

  return ok(plan);
}
