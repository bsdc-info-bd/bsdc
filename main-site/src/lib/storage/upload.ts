import { env, isConfigured } from '@/lib/env';

/**
 * Media pipeline.
 *
 * Supabase Storage carries everything a deployment can reach: it is the same
 * project the database lives in, so it needs no third-party key compiled into
 * the public bundle, and a member can attach a picture on the day the platform
 * is installed rather than the day somebody signs up for an image host.
 *
 * The two third parties stay, and the routing rule between them is unchanged —
 * Cloudinary carries the media that benefits from transformations (avatars,
 * covers, chat documents, voice notes) and imgbb the ordinary images, so
 * Cloudinary's free quota is not spent on them. They are reached when Storage
 * is not configured, which now means never on a deployment that has a
 * database.
 */
export type MediaKind = 'image' | 'document' | 'audio' | 'video';
export type MediaProvider = 'cloudinary' | 'imgbb' | 'supabase';

export type MediaPurpose =
  | 'avatar'
  | 'cover'
  | 'post-image'
  | 'comment-image'
  | 'chat-document'
  | 'voice-note'
  | 'product-image';

export interface UploadResult {
  provider: MediaProvider;
  kind: MediaKind;
  url: string;
  thumbUrl: string;
  deleteToken: string;
  width: number | null;
  height: number | null;
  bytes: number;
  mimeType: string;
}

export class MediaError extends Error {
  readonly messageKey: string;
  constructor(messageKey: string) {
    super(messageKey);
    this.name = 'MediaError';
    this.messageKey = messageKey;
  }
}

export const MAX_BYTES: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

/** Classifies a file by MIME type; unknown types are rejected outright. */
export function kindOf(mimeType: string): MediaKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return 'image';
  if (DOCUMENT_TYPES.includes(mimeType)) return 'document';
  if (AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (VIDEO_TYPES.includes(mimeType)) return 'video';
  return null;
}

const CLOUDINARY_PURPOSES: readonly MediaPurpose[] = [
  'avatar',
  'cover',
  'chat-document',
  'voice-note',
  'product-image',
];

/** Which third party should carry this upload, ignoring what is configured. */
export function chooseProvider(purpose: MediaPurpose, kind: MediaKind): MediaProvider {
  if (kind !== 'image') return 'cloudinary';
  return CLOUDINARY_PURPOSES.includes(purpose) ? 'cloudinary' : 'imgbb';
}

export interface ProviderAvailability {
  supabase: boolean;
  cloudinary: boolean;
  imgbb: boolean;
}

/**
 * The provider this upload actually takes, or null when a deployment has
 * nowhere at all to put it.
 *
 * Storage first, because it is first-party; then the third party the routing
 * rule picked; then whichever of the two is configured, since a picture on the
 * "wrong" host is still a picture.
 */
export function resolveProvider(
  purpose: MediaPurpose,
  kind: MediaKind,
  available: ProviderAvailability,
): MediaProvider | null {
  if (available.supabase) return 'supabase';
  const preferred = chooseProvider(purpose, kind);
  if (preferred === 'cloudinary') {
    return available.cloudinary ? 'cloudinary' : available.imgbb ? 'imgbb' : null;
  }
  return available.imgbb ? 'imgbb' : available.cloudinary ? 'cloudinary' : null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/** The file extension a mime type is stored under. Never empty. */
export function extensionFor(mimeType: string): string {
  const mapped = EXTENSIONS[mimeType.toLowerCase()];
  if (mapped !== undefined) return mapped;
  const subtype = mimeType.split('/')[1] ?? '';
  const cleaned = subtype.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return cleaned.length > 0 && cleaned.length <= 5 ? cleaned : 'bin';
}

/**
 * Where an object lives inside the bucket: `<uid>/<purpose>/<yyyymm>/<id>.<ext>`.
 *
 * The first segment is the member's uid and the storage policies check it, so
 * the path is not a filing convenience — it is what makes the folder theirs.
 * The month keeps a heavy member's folder from becoming one directory with
 * ten thousand entries in it, and the id is random so two uploads in the same
 * millisecond do not collide.
 */
export function mediaObjectPath(
  uid: string,
  purpose: MediaPurpose,
  mimeType: string,
  options: { now?: Date; id?: string } = {},
): string {
  const now = options.now ?? new Date();
  const month = `${String(now.getUTCFullYear())}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const id = options.id ?? randomObjectId();
  return `${uid}/${purpose}/${month}/${id}.${extensionFor(mimeType)}`;
}

/** A random id that is safe in a path, without depending on a UUID generator. */
export function randomObjectId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === 'function') {
    return crypto_.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  const bytes = new Uint8Array(10);
  if (crypto_ && typeof crypto_.getRandomValues === 'function') crypto_.getRandomValues(bytes);
  else
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The pixel size of an image, read before it is uploaded.
 *
 * Best effort and never fatal: the layout uses it to choose an arrangement,
 * and a browser without `createImageBitmap` simply gets no aspect ratio and
 * falls back to the arrangement for unknown shapes.
 */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return null;
  }
}

export function assertUploadable(file: File): MediaKind {
  const kind = kindOf(file.type);
  if (!kind) throw new MediaError('media.errors.unsupported');
  if (file.size > MAX_BYTES[kind]) throw new MediaError('media.errors.tooLarge');
  if (file.size === 0) throw new MediaError('media.errors.empty');
  return kind;
}

interface XhrOptions {
  url: string;
  body: FormData | Blob;
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** XHR is used because fetch still cannot report upload progress. */
function postForm(options: XhrOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', options.url, true);
    request.responseType = 'json';
    for (const [header, value] of Object.entries(options.headers ?? {})) {
      request.setRequestHeader(header, value);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new MediaError('media.errors.failed'));
    request.ontimeout = () => reject(new MediaError('media.errors.failed'));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(request.response);
      else reject(new MediaError('media.errors.failed'));
    };
    options.signal?.addEventListener('abort', () => request.abort(), { once: true });

    request.send(options.body);
  });
}

interface CloudinaryResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
  resource_type?: string;
  delete_token?: string;
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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function uploadToCloudinary(
  file: File,
  kind: MediaKind,
  purpose: MediaPurpose,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  if (!isConfigured.cloudinary) throw new MediaError('media.errors.notConfigured');

  const resourceType = kind === 'image' ? 'image' : kind === 'document' ? 'raw' : 'video';
  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', env.cloudinary.unsignedPreset);
  body.append('folder', `bsdc/${purpose}`);

  const response = (await postForm({
    url: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/${resourceType}/upload`,
    body,
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  })) as CloudinaryResponse;

  if (!response.secure_url) throw new MediaError('media.errors.failed');

  return {
    provider: 'cloudinary',
    kind,
    url: response.secure_url,
    thumbUrl: kind === 'image' ? cloudinaryThumb(response.secure_url) : '',
    deleteToken: response.delete_token ?? '',
    width: toNumber(response.width),
    height: toNumber(response.height),
    bytes: toNumber(response.bytes) ?? file.size,
    mimeType: file.type,
  };
}

async function uploadToImgbb(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  if (!isConfigured.imgbb) throw new MediaError('media.errors.notConfigured');

  const body = new FormData();
  body.append('image', file);

  const response = (await postForm({
    url: `https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.imgbbApiKey)}`,
    body,
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  })) as ImgbbResponse;

  const url = response.data?.display_url ?? response.data?.url;
  if (!url) throw new MediaError('media.errors.failed');

  return {
    provider: 'imgbb',
    kind: 'image',
    url,
    thumbUrl: response.data?.thumb?.url ?? url,
    deleteToken: response.data?.delete_url ?? '',
    width: toNumber(response.data?.width),
    height: toNumber(response.data?.height),
    bytes: toNumber(response.data?.size) ?? file.size,
    mimeType: file.type,
  };
}

/**
 * Uploads into the project's own storage.
 *
 * The bytes go straight to the Storage REST endpoint rather than through
 * supabase-js for one reason: progress. An XHR reports how much of the file
 * has arrived, which is what turns a two-second silence on a phone into a bar
 * that moves, and the SDK's fetch-based client cannot tell us that.
 */
async function uploadToSupabase(
  file: File,
  kind: MediaKind,
  purpose: MediaPurpose,
  options: UploadOptions,
): Promise<UploadResult> {
  if (!isConfigured.supabase) throw new MediaError('media.errors.notConfigured');

  const uid = options.uid ?? (await currentUid());
  if (uid.length === 0) throw new MediaError('media.errors.signInRequired');

  const path = mediaObjectPath(uid, purpose, file.type);
  // Imported here rather than at the top: this module is reached through a
  // dynamic import, and supabase-js should stay in the chunk that already
  // carries it instead of joining the composer's.
  const { supabaseAccessToken } = await import('@/lib/supabase/client');
  const token = await supabaseAccessToken();
  if (token.length === 0) throw new MediaError('media.errors.signInRequired');

  const [size] = await Promise.all([
    kind === 'image' ? readImageSize(file) : Promise.resolve(null),
    postForm({
      url: `${env.supabase.url.replace(/\/+$/, '')}/storage/v1/object/media/${path}`,
      body: file,
      headers: {
        authorization: `Bearer ${token}`,
        apikey: env.supabase.publishableKey,
        'content-type': file.type,
        'cache-control': '31536000',
        'x-upsert': 'false',
      },
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  ]);

  const url = `${env.supabase.url.replace(/\/+$/, '')}/storage/v1/object/public/media/${path}`;
  return {
    provider: 'supabase',
    kind,
    url,
    // Storage has no free transformation, so the thumb is the object itself;
    // the browser scales it. A Cloudinary upload keeps its real thumbnail.
    thumbUrl: url,
    deleteToken: path,
    width: size?.width ?? null,
    height: size?.height ?? null,
    bytes: file.size,
    mimeType: file.type,
  };
}

/** The signed-in member, resolved without importing Firebase eagerly. */
async function currentUid(): Promise<string> {
  if (!isConfigured.firebase) return '';
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase');
    return getFirebaseAuth().currentUser?.uid ?? '';
  } catch {
    return '';
  }
}

export interface UploadOptions {
  purpose: MediaPurpose;
  /** Whose folder the object is stored in. Read from the session when absent. */
  uid?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Validates, routes and uploads a single file. */
export async function uploadMedia(file: File, options: UploadOptions): Promise<UploadResult> {
  const kind = assertUploadable(file);
  const provider = resolveProvider(options.purpose, kind, {
    supabase: isConfigured.supabase,
    cloudinary: isConfigured.cloudinary,
    imgbb: isConfigured.imgbb,
  });

  if (provider === null) throw new MediaError('media.errors.notConfigured');
  if (provider === 'supabase') return uploadToSupabase(file, kind, options.purpose, options);
  return provider === 'cloudinary'
    ? uploadToCloudinary(file, kind, options.purpose, options.onProgress, options.signal)
    : uploadToImgbb(file, options.onProgress, options.signal);
}

/** Cloudinary delivery transform: square, face-aware, modern format. */
export function cloudinaryThumb(url: string, size = 256): string {
  return url.replace('/upload/', `/upload/c_fill,g_auto:face,w_${size},h_${size},f_auto,q_auto/`);
}

/** Cloudinary delivery transform for wide imagery such as covers and cards. */
export function cloudinaryWide(url: string, width = 1200): string {
  return url.replace('/upload/', `/upload/c_fill,g_auto,w_${width},f_auto,q_auto/`);
}
