import { env, isConfigured } from '@/lib/env';

/**
 * Media pipeline.
 *
 * Routing rule agreed for BSDC: Cloudinary carries the media that matters —
 * avatars, covers, chat documents and voice notes — because it gives us
 * transformations and reliable delivery. Every other ordinary image goes to
 * imgbb to keep Cloudinary's free quota for the important traffic.
 */
export type MediaKind = 'image' | 'document' | 'audio' | 'video';
export type MediaProvider = 'cloudinary' | 'imgbb';

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

/** Which provider should carry this upload. */
export function chooseProvider(purpose: MediaPurpose, kind: MediaKind): MediaProvider {
  if (kind !== 'image') return 'cloudinary';
  return CLOUDINARY_PURPOSES.includes(purpose) ? 'cloudinary' : 'imgbb';
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
  body: FormData;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** XHR is used because fetch still cannot report upload progress. */
function postForm(options: XhrOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', options.url, true);
    request.responseType = 'json';

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

export interface UploadOptions {
  purpose: MediaPurpose;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Validates, routes and uploads a single file. */
export async function uploadMedia(file: File, options: UploadOptions): Promise<UploadResult> {
  const kind = assertUploadable(file);
  const provider = chooseProvider(options.purpose, kind);

  if (provider === 'imgbb' && !isConfigured.imgbb && isConfigured.cloudinary) {
    return uploadToCloudinary(file, kind, options.purpose, options.onProgress, options.signal);
  }

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
