/**
 * The media routing contract, shared by the browser and the edge.
 *
 * All images across BSDC — avatars, profile/group/event/ad covers, project
 * covers and screenshots, post images, comment and chat images, and marketplace
 * product images — are hosted exclusively on ImgBB through the edge upload
 * endpoint (`POST /api/media/upload`).
 *
 * This file has no imports at all, on purpose: both the browser bundle and
 * Cloudflare Pages Functions import it directly.
 *
 * Supabase Storage is never an upload destination; Postgres holds only the
 * `media_assets` metadata row and relational links.
 */

export type MediaKind = 'image';
export type MediaProvider = 'imgbb';

export type MediaPurpose =
  | 'avatar'
  | 'cover'
  | 'project-cover'
  | 'project-image'
  | 'post-image'
  | 'comment-image'
  | 'product-image';

/** Every purpose the platform will accept from a caller. */
export const MEDIA_PURPOSES: readonly MediaPurpose[] = [
  'avatar',
  'cover',
  'project-cover',
  'project-image',
  'post-image',
  'comment-image',
  'product-image',
];

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === 'string' && (MEDIA_PURPOSES as readonly string[]).includes(value);
}

export const MAX_BYTES: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
};

export const IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

/** Classifies a file by MIME type; non-image and unknown types are rejected outright. */
export function kindOf(mimeType: string): MediaKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return 'image';
  return null;
}

/** Every accepted image purpose is hosted exclusively on ImgBB. */
export function chooseProvider(_purpose: MediaPurpose, _kind: MediaKind): MediaProvider {
  return 'imgbb';
}
