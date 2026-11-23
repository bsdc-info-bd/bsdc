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
  | 'chat-image'
  | 'product-image'
  | 'ad-creative'
  | 'other';

/**
 * Every purpose the platform will accept from a caller.
 *
 * 'chat-image' replaced a lie: the message composer was passing 'comment-image'
 * because there was nothing else for a picture sent in a conversation, so every
 * chat photo in the library is filed under comments. Rows already written stay as
 * they are — relabelling them would be guessing about a surface that had no way to
 * say otherwise. 'other' is what a picture is when the caller does not know: rows
 * from before the library existed, and any future upload path that has not been
 * taught to say.
 *
 * `media_assets.purpose` checks exactly this list (0132). A value here that is not
 * there fails at the database with 22023, which a member sees as a failed upload.
 */
export const MEDIA_PURPOSES: readonly MediaPurpose[] = [
  'avatar',
  'cover',
  'project-cover',
  'project-image',
  'post-image',
  'comment-image',
  'chat-image',
  'product-image',
  'ad-creative',
  'other',
];

/**
 * What the gallery offers as filters, in the order its chips appear.
 *
 * 'all' is not a purpose — it is the absence of one, and the function that reads
 * the library treats it as such. The list is here rather than assembled from
 * MEDIA_PURPOSES because a filter that matches nothing is worse than no filter:
 * 'other' is deliberately not offered, since a member choosing it expects pictures
 * and finds only rows nobody labelled.
 */
export const GALLERY_FILTERS = [
  'all',
  'post-image',
  'chat-image',
  'comment-image',
  'avatar',
  'cover',
  'project-image',
  'project-cover',
  'product-image',
  'ad-creative',
] as const;

export type GalleryFilter = (typeof GALLERY_FILTERS)[number];

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

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** Normalises MIME casing, parameters, and legacy image aliases. */
export function normalizeMimeType(mimeType: string): string {
  const base = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  return MIME_ALIASES[base] ?? base;
}

/**
 * Resolves the effective MIME type for an uploaded file.
 *
 * When a browser supplies a MIME type (standard or alias/uppercase), that
 * normalised value is returned directly. Only when a mobile file picker leaves
 * `file.type` completely empty do we infer from a known image extension; the
 * edge uploader still verifies the magic bytes before sending to ImgBB.
 */
export function effectiveMimeType(file: { readonly type: string; readonly name: string }): string {
  const normalized = normalizeMimeType(file.type);
  if (normalized.length > 0) return normalized;
  const dot = file.name.lastIndexOf('.');
  if (dot < 0) return '';
  const ext = file.name
    .slice(dot + 1)
    .trim()
    .toLowerCase();
  return EXTENSION_MIME_MAP[ext] ?? '';
}

/** Classifies a file by MIME type; non-image and unknown types are rejected outright. */
export function kindOf(mimeType: string): MediaKind | null {
  const normalized = normalizeMimeType(mimeType);
  if (IMAGE_TYPES.includes(normalized)) return 'image';
  return null;
}

/** Every accepted image purpose is hosted exclusively on ImgBB. */
export function chooseProvider(_purpose: MediaPurpose, _kind: MediaKind): MediaProvider {
  return 'imgbb';
}
