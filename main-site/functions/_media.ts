/**
 * The edge half of the media pipeline (ImgBB-only).
 *
 * All images across BSDC are uploaded exclusively to ImgBB from this Pages
 * Function, keeping `IMGBB_API_KEY` server-only at request time while reading
 * ImgBB's aspect-preserving `medium` (~640px) and full `image` URLs so feed
 * cards, post views, avatars, and covers render rapidly at the right resolution.
 */
import {
  chooseProvider,
  kindOf,
  MAX_BYTES,
  type MediaKind,
  type MediaProvider,
  type MediaPurpose,
} from '../src/lib/storage/media-contract';

export interface MediaEnv {
  /** ImgBB's API key. A secret: it is never sent to a browser. */
  IMGBB_API_KEY?: string;
}

export interface HostCredentials {
  imgbbKey: string;
}

function first(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

/** The ImgBB credential this deployment holds. */
export function credentialsOf(env: MediaEnv): HostCredentials {
  return {
    imgbbKey: first(env.IMGBB_API_KEY),
  };
}

export function hasImgbb(credentials: HostCredentials): boolean {
  return credentials.imgbbKey.length > 0;
}

/** What this endpoint can carry, published to the browser so it can plan. */
export function availabilityOf(env: MediaEnv): { imgbb: boolean } {
  const credentials = credentialsOf(env);
  return { imgbb: hasImgbb(credentials) };
}

export { chooseProvider, kindOf, MAX_BYTES };
export type { MediaKind, MediaProvider, MediaPurpose };

export interface MediaFailure {
  errorKey: string;
  status: number;
}

export function reject(file: File, purpose: MediaPurpose, env: MediaEnv): MediaFailure | null {
  const kind = kindOf(file.type);
  if (kind === null) return { errorKey: 'media.errors.unsupported', status: 415 };
  if (file.size === 0) return { errorKey: 'media.errors.empty', status: 400 };
  if (file.size > MAX_BYTES[kind]) return { errorKey: 'media.errors.tooLarge', status: 413 };

  void chooseProvider(purpose, kind);
  const credentials = credentialsOf(env);
  if (!hasImgbb(credentials)) return { errorKey: 'media.errors.notConfigured', status: 503 };

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

export interface EdgeUploadResult {
  provider: MediaProvider;
  kind: MediaKind;
  url: string;
  thumbUrl: string;
  deleteToken: string;
  width: number | null;
  height: number | null;
  bytes: number;
  mimeType: string;
  expiresAt: string | null;
}

/**
 * The lifetime an upload is given, by purpose, in seconds (`0` = permanent).
 */
export const UPLOAD_LIFETIME_SECONDS: Record<MediaPurpose, number> = {
  avatar: 0,
  cover: 0,
  'project-cover': 0,
  'project-image': 0,
  'post-image': 0,
  'comment-image': 0,
  'product-image': 0,
};

/** ISO string for `seconds` from now, or null when the host keeps it forever. */
export function expiresAtFor(purpose: MediaPurpose, now = Date.now()): string | null {
  const seconds = UPLOAD_LIFETIME_SECONDS[purpose] ?? 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(now + seconds * 1000).toISOString();
}

interface ImgbbVariant {
  url?: string;
  width?: number | string;
  height?: number | string;
  mime?: string;
}

interface ImgbbResponse {
  data?: {
    url?: string;
    display_url?: string;
    delete_url?: string;
    size?: number | string;
    width?: number | string;
    height?: number | string;
    image?: ImgbbVariant;
    medium?: ImgbbVariant;
    thumb?: ImgbbVariant;
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function sendToImgbb(
  file: File,
  key: string,
  purpose: MediaPurpose,
  now = Date.now(),
): Promise<EdgeUploadResult> {
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const body = new FormData();
  body.append('image', base64);
  const lifetime = UPLOAD_LIFETIME_SECONDS[purpose] ?? 0;
  if (lifetime > 0) body.append('expiration', String(lifetime));

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    body,
  });
  if (!response.ok) throw new Error('imgbb-refused');

  const payload = (await response.json()) as ImgbbResponse;
  const fullUrl = payload.data?.image?.url ?? payload.data?.display_url ?? payload.data?.url ?? '';
  if (fullUrl.length === 0) throw new Error('imgbb-answered-without-a-url');

  // ImgBB's `thumb` is a 180x180 square crop suited only for small avatars;
  // `medium` (~640px wide) preserves aspect ratio for feed cards and previews.
  const thumbUrl =
    purpose === 'avatar'
      ? (payload.data?.thumb?.url ?? payload.data?.medium?.url ?? fullUrl)
      : (payload.data?.medium?.url ?? payload.data?.display_url ?? fullUrl);

  return {
    provider: 'imgbb',
    kind: 'image',
    url: fullUrl,
    thumbUrl,
    deleteToken: payload.data?.delete_url ?? '',
    width: toNumber(payload.data?.width) ?? toNumber(payload.data?.image?.width),
    height: toNumber(payload.data?.height) ?? toNumber(payload.data?.image?.height),
    bytes: toNumber(payload.data?.size) ?? file.size,
    mimeType: payload.data?.image?.mime ?? file.type,
    expiresAt: expiresAtFor(purpose, now),
  };
}

/**
 * Sends an image to ImgBB after `reject()` has validated type, size, and key.
 */
export async function sendToHost(
  file: File,
  purpose: MediaPurpose,
  env: MediaEnv,
): Promise<EdgeUploadResult> {
  const kind = kindOf(file.type);
  if (kind === null) throw new Error('unsupported');

  const credentials = credentialsOf(env);
  return sendToImgbb(file, credentials.imgbbKey, purpose);
}
