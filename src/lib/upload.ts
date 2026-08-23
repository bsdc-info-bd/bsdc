/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { uploadToCloudinary } from '@/config/cloudinary';
import { uploadToImgBB } from '@/config/imgbb';
import type { UploadResult } from '@/config/cloudinary';

export type UploadTier = 'important' | 'casual';

/**
 * Route uploads to the right provider:
 * - important (avatars, covers, post images, banners) → Cloudinary, ImgBB fallback
 * - casual (chat attachments, comment images) → ImgBB, Cloudinary fallback
 */
export async function uploadImage(file: File, tier: UploadTier, folder = 'bsdc/misc'): Promise<UploadResult> {
  const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (!accepted.includes(file.type)) throw new Error('Only image files are supported (JPEG, PNG, WebP, GIF, SVG)');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image must be under 10 MB');
  const primary = tier === 'important' ? uploadToCloudinary : uploadToImgBB;
  const fallback = tier === 'important' ? uploadToImgBB : uploadToCloudinary;
  try {
    if (tier === 'important') {
      return await uploadToCloudinary(file, { folder });
    }
    return await primary(file);
  } catch {
    return fallback(file);
  }
}

export function cld(url: string, transforms = 'f_auto,q_auto,w_800'): string {
  if (!url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/${transforms}/`);
}

export function avatarUrl(url: string | undefined, size = 96): string {
  if (!url) return '';
  if (url.includes('/upload/')) return cld(url, `f_auto,q_auto,w_${size},c_fill,g_face`);
  return url;
}
