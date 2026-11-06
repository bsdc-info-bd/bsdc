/**
 * The media routing contract, shared by the browser and the edge.
 *
 * This file decides *where* a byte goes and nothing else: which kinds of file
 * the platform accepts, how large each may be, and which of the two image hosts
 * carries a given purpose. It has no imports at all, on purpose. The browser
 * reaches it through `@/lib/storage/media-contract`; the Pages Function that
 * uploads on the member's behalf reaches it through a relative path, because
 * `functions/` has no path aliases and must never pull in `@/lib/env` (which
 * reads `import.meta.env`, a thing that does not exist at the edge).
 *
 * Keeping the contract in one file is the point. A router duplicated on both
 * sides of a network boundary is a router that eventually disagrees with
 * itself, and the disagreement shows up as a picture that uploaded somewhere
 * the reader cannot see it — which is exactly the failure this platform has
 * already had once.
 *
 * Supabase Storage is not a destination here and never becomes one: it holds
 * the `media_assets` metadata row and the SQL relationships, not image bytes.
 */

export type MediaKind = 'image' | 'document' | 'audio';
export type MediaProvider = 'cloudinary' | 'imgbb';

export type MediaPurpose =
  | 'avatar'
  | 'cover'
  | 'project-cover'
  | 'project-image'
  | 'post-image'
  | 'comment-image'
  | 'chat-document'
  | 'voice-note'
  | 'product-image';

/** Every purpose the platform will accept from a caller. */
export const MEDIA_PURPOSES: readonly MediaPurpose[] = [
  'avatar',
  'cover',
  'project-cover',
  'project-image',
  'post-image',
  'comment-image',
  'chat-document',
  'voice-note',
  'product-image',
];

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === 'string' && (MEDIA_PURPOSES as readonly string[]).includes(value);
}

export const MAX_BYTES: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
};

export const IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const DOCUMENT_TYPES: readonly string[] = [
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const AUDIO_TYPES: readonly string[] = [
  'audio/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
];

/** Classifies a file by MIME type; unknown types are rejected outright. */
export function kindOf(mimeType: string): MediaKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return 'image';
  if (DOCUMENT_TYPES.includes(mimeType)) return 'document';
  if (AUDIO_TYPES.includes(mimeType)) return 'audio';
  return null;
}

/**
 * The purposes that need Cloudinary.
 *
 * Two reasons a purpose is on this list, and the second is the expensive one to
 * get wrong:
 *
 *   1. It is transformed on delivery — an avatar is a face-aware square, a cover
 *      is a wide crop, a product image is drawn at four sizes on four screens.
 *   2. **It is drawn in a feed.** A post picture and a comment picture are the
 *      pictures there are most of, and they are the ones that make the site feel
 *      slow, because a feed draws each of them a few hundred pixels wide while
 *      the original is several thousand. Cloudinary is the only one of the two
 *      hosts that can be asked for the width the card can show, in the smallest
 *      format the browser accepts. ImgBB serves the original and ignores every
 *      parameter, so a feed of ImgBB pictures downloads megabytes per card and
 *      that is exactly what "the images load so slow" was reporting.
 *
 * ImgBB is still used, deliberately, for the one case where its unlimited
 * capacity genuinely wins: a chat attachment, drawn at one size, in one place,
 * whose bytes the edge caches on the way past. Voice notes and documents are not
 * images and go to Cloudinary because ImgBB is not an image host for those.
 */
export const CLOUDINARY_PURPOSES: readonly MediaPurpose[] = [
  'avatar',
  'cover',
  'project-cover',
  'project-image',
  'post-image',
  'comment-image',
  'product-image',
];

/**
 * Which host carries this upload, ignoring what is configured.
 *
 * Documents and voice notes have no ImgBB equivalent — ImgBB is an image host —
 * so they go to Cloudinary whatever their purpose says.
 */
export function chooseProvider(purpose: MediaPurpose, kind: MediaKind): MediaProvider {
  if (kind !== 'image') return 'cloudinary';
  return CLOUDINARY_PURPOSES.includes(purpose) ? 'cloudinary' : 'imgbb';
}

/**
 * The Cloudinary resource type a kind uploads under.
 *
 * Cloudinary has no `audio` resource type: audio belongs to `video`, which
 * accepts it and serves it back. A document is `raw`, which is what lets a PDF
 * be delivered as a PDF rather than transcoded.
 */
export function cloudinaryResourceType(kind: MediaKind): 'image' | 'raw' | 'video' {
  if (kind === 'image') return 'image';
  return kind === 'document' ? 'raw' : 'video';
}

/** Cloudinary delivery transform: square, face-aware, modern format. */
export function cloudinaryThumb(url: string, size = 256): string {
  return url.replace('/upload/', `/upload/c_fill,g_auto:face,w_${size},h_${size},f_auto,q_auto/`);
}

/** Cloudinary delivery transform for wide imagery such as covers and cards. */
export function cloudinaryWide(url: string, width = 1200): string {
  return url.replace('/upload/', `/upload/c_fill,g_auto,w_${width},f_auto,q_auto/`);
}

/** The folder an upload is filed under, so a host's console stays readable. */
export function cloudinaryFolder(purpose: MediaPurpose): string {
  return `bsdc/${purpose}`;
}
