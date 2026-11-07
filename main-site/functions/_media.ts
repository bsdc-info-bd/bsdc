/**
 * The edge half of the media pipeline.
 *
 * The browser decides *what* is being uploaded; this decides *how* it reaches
 * the host, with the host's key read from Pages environment variables at
 * request time. That is the whole reason the endpoint exists: a key held here is
 * not in the public bundle, and changing it does not require a rebuild.
 *
 * The routing table is not repeated here. `chooseProvider`, the MIME lists, the
 * size limits and the Cloudinary transforms all come from
 * `src/lib/storage/media-contract`, the one file both sides import, so the edge
 * and the browser cannot disagree about where a picture belongs.
 */
import {
  chooseProvider,
  cloudinaryFolder,
  cloudinaryResourceType,
  cloudinaryThumb,
  kindOf,
  MAX_BYTES,
  type MediaKind,
  type MediaProvider,
  type MediaPurpose,
} from '../src/lib/storage/media-contract';

export interface MediaEnv {
  /** ImgBB's API key. A secret: it is never sent to a browser. */
  IMGBB_API_KEY?: string;
  /** Cloudinary's cloud name and the unsigned preset that accepts uploads. */
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_UNSIGNED_PRESET?: string;
  /**
   * Accepted as an alternative spelling. A deployment that already set the
   * build-time variables in Pages has the same strings available here, and
   * refusing to use them would make the endpoint answer "not configured" on a
   * site that is in fact configured.
   */
  VITE_IMGBB_API_KEY?: string;
  VITE_CLOUDINARY_CLOUD_NAME?: string;
  VITE_CLOUDINARY_UNSIGNED_PRESET?: string;
}

export interface HostCredentials {
  imgbbKey: string;
  cloudName: string;
  unsignedPreset: string;
}

function first(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

/** The host credentials this deployment actually holds. */
export function credentialsOf(env: MediaEnv): HostCredentials {
  return {
    imgbbKey: first(env.IMGBB_API_KEY, env.VITE_IMGBB_API_KEY),
    cloudName: first(env.CLOUDINARY_CLOUD_NAME, env.VITE_CLOUDINARY_CLOUD_NAME),
    unsignedPreset: first(env.CLOUDINARY_UNSIGNED_PRESET, env.VITE_CLOUDINARY_UNSIGNED_PRESET),
  };
}

export function hasImgbb(credentials: HostCredentials): boolean {
  return credentials.imgbbKey.length > 0;
}

/** Both halves are required: an unsigned upload without a preset is rejected. */
export function hasCloudinary(credentials: HostCredentials): boolean {
  return credentials.cloudName.length > 0 && credentials.unsignedPreset.length > 0;
}

/** What this endpoint can carry, published to the browser so it can plan. */
export function availabilityOf(env: MediaEnv): { imgbb: boolean; cloudinary: boolean } {
  const credentials = credentialsOf(env);
  return { imgbb: hasImgbb(credentials), cloudinary: hasCloudinary(credentials) };
}

export { chooseProvider, kindOf, MAX_BYTES };
export type { MediaKind, MediaProvider, MediaPurpose };

/**
 * The i18n key a caller shows, so a refusal at the edge reads the same as one
 * in the browser. Never a stack trace and never a host's own error text, which
 * would leak which service is behind the endpoint.
 */
export interface MediaFailure {
  errorKey: string;
  status: number;
}

export function reject(file: File, purpose: MediaPurpose, env: MediaEnv): MediaFailure | null {
  const kind = kindOf(file.type);
  if (kind === null) return { errorKey: 'media.errors.unsupported', status: 415 };
  if (file.size === 0) return { errorKey: 'media.errors.empty', status: 400 };
  if (file.size > MAX_BYTES[kind]) return { errorKey: 'media.errors.tooLarge', status: 413 };

  const provider = chooseProvider(purpose, kind);
  const credentials = credentialsOf(env);
  const ready = provider === 'cloudinary' ? hasCloudinary(credentials) : hasImgbb(credentials);
  if (!ready) return { errorKey: 'media.errors.notConfigured', status: 503 };

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: a 10 MB picture is ~140k characters, and one `fromCharCode`
  // spread that wide overflows the argument list.
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
  /**
   * When the host will stop serving this file by itself, or `null` when it never
   * will.
   *
   * This is the difference between a picture that is eventually deleted by the
   * provider and a picture that is never deleted at all. ImgBB is the second
   * kind: an upload with no `expiration` is kept indefinitely, which is fine for
   * a post and wrong for an avatar somebody replaced. Cloudinary is the first
   * kind when the preset has a scheduled deletion.
   *
   * Recorded rather than inferred, because "we think this one expires" is not a
   * promise a cleaner can act on.
   */
  expiresAt: string | null;
}

/**
 * The lifetime an upload is given, by purpose, in seconds.
 *
 * `0` means the host keeps it forever. A direct message attachment earns a
 * shorter life than a post: a photograph sent to one person should not outlive
 * the conversation, and the member who sent it has no way to delete it from the
 * host after the fact — so the platform promises it for them.
 *
 * These are ImgBB's semantics exactly: `expiration` is seconds from upload, and
 * a value that is not a positive integer means "no expiration".
 */
export const UPLOAD_LIFETIME_SECONDS: Record<MediaPurpose, number> = {
  avatar: 0,
  cover: 0,
  'project-cover': 0,
  'project-image': 0,
  'post-image': 0,
  'comment-image': 0,
  'product-image': 0,
  // A document handed to one member in a conversation is not a publication.
  'chat-document': 60 * 60 * 24 * 180,
  // A voice note is the most personal thing on the platform and the shortest.
  'voice-note': 60 * 60 * 24 * 90,
};

/** ISO string for `seconds` from now, or null when the host keeps it forever. */
export function expiresAtFor(purpose: MediaPurpose, now = Date.now()): string | null {
  const seconds = UPLOAD_LIFETIME_SECONDS[purpose] ?? 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(now + seconds * 1000).toISOString();
}

interface ImgbbResponse {
  data?: {
    url?: string;
    display_url?: string;
    delete_url?: string;
    size?: number;
    width?: number | string;
    height?: number | string;
    thumb?: { url?: string };
  };
}

interface CloudinaryResponse {
  secure_url?: string;
  delete_token?: string;
  width?: number;
  height?: number;
  bytes?: number;
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
  // ImgBB's contract: the key in the query string, base64 in the `image` field,
  // and `expiration` in *seconds from upload*. Omitting it means the file is
  // kept until somebody deletes it by hand, which is why every purpose has an
  // explicit number in `UPLOAD_LIFETIME_SECONDS` rather than a default.
  body.append('image', base64);
  const lifetime = UPLOAD_LIFETIME_SECONDS[purpose] ?? 0;
  if (lifetime > 0) body.append('expiration', String(lifetime));

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    body,
  });
  if (!response.ok) throw new Error('imgbb-refused');

  const payload = (await response.json()) as ImgbbResponse;
  const url = payload.data?.display_url ?? payload.data?.url ?? '';
  if (url.length === 0) throw new Error('imgbb-answered-without-a-url');

  return {
    provider: 'imgbb',
    kind: 'image',
    url,
    thumbUrl: payload.data?.thumb?.url ?? url,
    deleteToken: payload.data?.delete_url ?? '',
    width: toNumber(payload.data?.width),
    height: toNumber(payload.data?.height),
    bytes: toNumber(payload.data?.size) ?? file.size,
    mimeType: file.type,
    expiresAt: expiresAtFor(purpose, now),
  };
}

async function sendToCloudinary(
  file: File,
  kind: MediaKind,
  purpose: MediaPurpose,
  credentials: HostCredentials,
): Promise<EdgeUploadResult> {
  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', credentials.unsignedPreset);
  body.append('folder', cloudinaryFolder(purpose));

  const endpoint = `https://api.cloudinary.com/v1_1/${credentials.cloudName}/${cloudinaryResourceType(kind)}/upload`;
  const response = await fetch(endpoint, { method: 'POST', body });
  if (!response.ok) throw new Error('cloudinary-refused');

  const payload = (await response.json()) as CloudinaryResponse;
  const url = payload.secure_url ?? '';
  if (url.length === 0) throw new Error('cloudinary-answered-without-a-url');

  return {
    provider: 'cloudinary',
    kind,
    url,
    thumbUrl: kind === 'image' ? cloudinaryThumb(url) : '',
    deleteToken: payload.delete_token ?? '',
    width: toNumber(payload.width),
    height: toNumber(payload.height),
    bytes: toNumber(payload.bytes) ?? file.size,
    mimeType: file.type,
    // Cloudinary deletes on its own schedule only when the preset says so, and
    // the preset is not readable from here. An upload that claims an expiry the
    // host will not honour is worse than one that claims none.
    expiresAt: null,
  };
}

/**
 * Sends one file to the host its purpose requires.
 *
 * Assumes `reject()` already passed: the kind is known, the size is within the
 * limit and the host's credentials are present.
 */
export async function sendToHost(
  file: File,
  purpose: MediaPurpose,
  env: MediaEnv,
): Promise<EdgeUploadResult> {
  const kind = kindOf(file.type);
  if (kind === null) throw new Error('unsupported');

  const credentials = credentialsOf(env);
  const provider = chooseProvider(purpose, kind);

  return provider === 'cloudinary'
    ? sendToCloudinary(file, kind, purpose, credentials)
    : sendToImgbb(file, credentials.imgbbKey, purpose);
}
