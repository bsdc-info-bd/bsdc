import { env, isConfigured } from '@/lib/env';

/**
 * Media pipeline.
 *
 * Image bytes have one deliberate destination: ordinary member images go to
 * imgbb; assets that need Cloudinary transforms (avatars, profile/project
 * covers, product images) go to Cloudinary. Documents and audio also go to
 * Cloudinary. Supabase stores only the media metadata row used by the content
 * tables; this module never uploads bytes to Supabase Storage and never falls
 * back to the wrong host when a provider is not configured.
 */
export type MediaKind = 'image' | 'document' | 'audio';
export type MediaProvider = 'cloudinary' | 'imgbb';

export type MediaPurpose =
  | 'avatar'
  | 'cover'
  | 'project-cover'
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
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'];

/** Classifies a file by MIME type; unknown types are rejected outright. */
export function kindOf(mimeType: string): MediaKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return 'image';
  if (DOCUMENT_TYPES.includes(mimeType)) return 'document';
  if (AUDIO_TYPES.includes(mimeType)) return 'audio';
  return null;
}

const CLOUDINARY_PURPOSES: readonly MediaPurpose[] = [
  'avatar',
  'cover',
  'project-cover',
  'product-image',
];

/** Which third party should carry this upload, ignoring what is configured. */
export function chooseProvider(purpose: MediaPurpose, kind: MediaKind): MediaProvider {
  if (kind !== 'image') return 'cloudinary';
  return CLOUDINARY_PURPOSES.includes(purpose) ? 'cloudinary' : 'imgbb';
}

export interface ProviderAvailability {
  cloudinary: boolean;
  imgbb: boolean;
}

/**
 * The required provider, or null when that provider is not configured.
 *
 * There is intentionally no cross-provider fallback: an ordinary post image
 * must not silently consume Cloudinary quota, and an important cover must not
 * lose the transformations and delivery contract it was sent there for.
 */
export function resolveProvider(
  purpose: MediaPurpose,
  kind: MediaKind,
  available: ProviderAvailability,
): MediaProvider | null {
  const preferred = chooseProvider(purpose, kind);
  return available[preferred] ? preferred : null;
}

/** Best-effort intrinsic image dimensions, measured before or during upload. */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dimensions;
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
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** XHR is used because fetch still cannot report upload progress. */
function postForm(options: XhrOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    if (options.signal?.aborted) {
      reject(new MediaError('media.errors.cancelled'));
      return;
    }

    const abort = () => request.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    const fail = (key: string) => {
      cleanup();
      reject(new MediaError(key));
    };

    request.open('POST', options.url, true);
    request.responseType = 'json';
    request.timeout = 120_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => fail('media.errors.failed');
    request.ontimeout = () => fail('media.errors.failed');
    request.onabort = () => fail('media.errors.cancelled');
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) resolve(request.response);
      else reject(new MediaError('media.errors.failed'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
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

/** Read image bytes as base64 for imgbb's `image` form field. */
export function fileToBase64(file: Blob, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new MediaError('media.errors.cancelled'));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => reader.abort();

    reader.onload = () => {
      cleanup();
      if (typeof reader.result !== 'string') {
        reject(new MediaError('media.errors.failed'));
        return;
      }
      const comma = reader.result.indexOf(',');
      if (comma < 0) {
        reject(new MediaError('media.errors.failed'));
        return;
      }
      resolve(reader.result.slice(comma + 1));
    };
    reader.onerror = () => {
      cleanup();
      reject(new MediaError('media.errors.failed'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new MediaError('media.errors.cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.readAsDataURL(file);
  });
}

async function uploadToImgbb(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  if (!isConfigured.imgbb) throw new MediaError('media.errors.notConfigured');

  const [base64, size] = await Promise.all([fileToBase64(file, signal), readImageSize(file)]);
  const body = new FormData();
  // ImgBB takes a base64 string in `image`; the API key remains in its query
  // parameter. Do not send the raw File or move the key into the request body.
  body.append('image', base64);

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
    width: toNumber(response.data?.width) ?? size?.width ?? null,
    height: toNumber(response.data?.height) ?? size?.height ?? null,
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
  const provider = resolveProvider(options.purpose, kind, {
    cloudinary: isConfigured.cloudinary,
    imgbb: isConfigured.imgbb,
  });

  if (provider === null) throw new MediaError('media.errors.notConfigured');
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
