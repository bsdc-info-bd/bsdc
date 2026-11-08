import {
  chooseProvider,
  kindOf,
  MAX_BYTES,
  type MediaKind,
  type MediaProvider,
  type MediaPurpose,
} from './media-contract';

/**
 * Media upload pipeline (ImgBB-only).
 *
 * Every image uploaded on BSDC goes exclusively to ImgBB through the platform's
 * own edge endpoint (`POST /api/media/upload`), which keeps `IMGBB_API_KEY`
 * server-only at runtime, verifies the caller's Firebase ID token, and returns
 * both the full image URL and ImgBB's aspect-preserving medium variant.
 *
 * Before a single byte leaves the browser, raster images are downscaled to the
 * exact bounding box their purpose requires and encoded as high-efficiency WebP,
 * cutting multi-megabyte camera photos down to ~40–160 KB for DEV-Community-grade
 * upload and feed speed.
 */
export { chooseProvider, kindOf, MAX_BYTES } from './media-contract';
export type { MediaKind, MediaProvider, MediaPurpose } from './media-contract';

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
  /**
   * When the host was told to stop serving this file, or `null` for never.
   */
  expiresAt: string | null;
}

export class MediaError extends Error {
  readonly messageKey: string;
  constructor(messageKey: string) {
    super(messageKey);
    this.name = 'MediaError';
    this.messageKey = messageKey;
  }
}

export interface ProviderAvailability {
  imgbb: boolean;
}

/**
 * The required provider (`imgbb`), or null when ImgBB is not configured.
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
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

interface XhrOutcome {
  status: number;
  /** Parsed JSON when the response was JSON, otherwise null. */
  body: unknown;
}

/**
 * XHR is used because fetch still cannot report upload progress.
 */
function postForm(options: XhrOptions): Promise<XhrOutcome> {
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
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      request.setRequestHeader(name, value);
    }
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
      resolve({ status: request.status, body: request.response });
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    request.send(options.body);
  });
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Purpose-specific max longest-edge dimensions before upload.
 *
 * Tuned for DEV-Community-grade delivery on ImgBB: avatars never exceed 512px,
 * post/comment/project/product images top out at 1600px (crisp on 2x-3x retina
 * whileImgBB also generates a ~640px medium variant), and wide covers top out
 * at 1920px.
 */
const UPLOAD_MAX_EDGE: Record<MediaPurpose, number> = {
  avatar: 512,
  cover: 1920,
  'project-cover': 1920,
  'project-image': 1600,
  'post-image': 1600,
  'comment-image': 1440,
  'product-image': 1600,
};

const UPLOAD_QUALITY: Record<MediaPurpose, number> = {
  avatar: 0.86,
  cover: 0.85,
  'project-cover': 0.85,
  'project-image': 0.84,
  'post-image': 0.84,
  'comment-image': 0.84,
  'product-image': 0.85,
};

async function encodeCanvasWebp(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context !== null) {
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({ type: 'image/webp', quality });
    }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context !== null) {
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((blob) => resolve(blob), 'image/webp', quality),
      );
    }
  }
  return null;
}

/**
 * Re-encode an image to a purpose-sized WebP before uploading to ImgBB.
 *
 * Preserves GIF animations and already-compact WebP files untouched, and
 * gracefully falls back to the original file whenever canvas APIs are absent.
 */
export async function shrinkForUpload(
  file: File,
  purpose: MediaPurpose,
): Promise<{ blob: Blob; name: string; width?: number; height?: number }> {
  const maxEdge = UPLOAD_MAX_EDGE[purpose] ?? 1600;
  const quality = UPLOAD_QUALITY[purpose] ?? 0.84;
  const unchanged: { blob: Blob; name: string } = { blob: file, name: file.name };
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return unchanged;
  if (typeof createImageBitmap !== 'function') return unchanged;
  if (file.type === 'image/webp' && file.size <= 48 * 1024) return unchanged;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (file.type === 'image/webp' && longest <= maxEdge && file.size <= 180 * 1024) {
      return { blob: file, name: file.name, width: bitmap.width, height: bitmap.height };
    }
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const encoded = await encodeCanvasWebp(bitmap, width, height, quality);
    if (encoded === null || encoded.size === 0 || (scale === 1 && encoded.size >= file.size)) {
      return { blob: file, name: file.name, width: bitmap.width, height: bitmap.height };
    }
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return { blob: encoded, name: `${base}.webp`, width, height };
  } catch {
    return unchanged;
  } finally {
    bitmap?.close?.();
  }
}

/** Read image bytes as base64 for ImgBB's `image` form field. */
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

// --------------------------------------------------------------- capability ---

/** What this deployment can actually upload through, discovered at runtime. */
export interface UploadCapabilities {
  /** The site's own edge endpoint answered and is willing to upload. */
  proxy: boolean;
  /** The edge holds an ImgBB key. */
  proxyImgbb: boolean;
}

/** Which transport carries the bytes. */
export type UploadRoute = 'proxy';

export interface UploadPlan {
  route: UploadRoute;
  provider: MediaProvider;
}

export function localCapabilities(): UploadCapabilities {
  return {
    proxy: false,
    proxyImgbb: false,
  };
}

/**
 * Decides the transport before a byte moves.
 *
 * ImgBB's API key is a server secret and never ships in the client bundle, so
 * every image upload rides through `POST /api/media/upload` when `proxyImgbb`
 * is active.
 */
export function planUpload(
  purpose: MediaPurpose,
  kind: MediaKind,
  capabilities: UploadCapabilities,
): UploadPlan | null {
  const provider = chooseProvider(purpose, kind);
  if (capabilities.proxy && capabilities.proxyImgbb) {
    return { route: 'proxy', provider };
  }
  return null;
}

const PROVIDERS_ENDPOINT = '/api/media/providers';
const UPLOAD_ENDPOINT = '/api/media/upload';

let cachedCapabilities: UploadCapabilities | null = null;
let probeInFlight: Promise<UploadCapabilities> | null = null;

/** Fixes what the deployment can do — used by tests and by a startup warm-up. */
export function setUploadCapabilities(capabilities: UploadCapabilities | null): void {
  cachedCapabilities = capabilities;
}

export function knownCapabilities(): UploadCapabilities | null {
  return cachedCapabilities;
}

/**
 * Asks the edge whether ImgBB uploads are configured, once per page load.
 */
export async function probeUploadCapabilities(signal?: AbortSignal): Promise<UploadCapabilities> {
  const local = localCapabilities();
  if (typeof fetch !== 'function') return local;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(PROVIDERS_ENDPOINT, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return local;
    const body = (await response.json()) as {
      proxy?: unknown;
      imgbb?: unknown;
    };
    if (body?.proxy !== true) return local;
    return {
      proxy: true,
      proxyImgbb: body.imgbb === true,
    };
  } catch {
    return local;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function capabilities(signal?: AbortSignal): Promise<UploadCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;
  probeInFlight ??= probeUploadCapabilities(signal).then((result) => {
    cachedCapabilities = result;
    probeInFlight = null;
    return result;
  });
  return probeInFlight;
}

/** Forgets a probe that turned out to be wrong, so the next upload re-asks. */
function invalidateCapabilities(): void {
  cachedCapabilities = null;
  probeInFlight = null;
}

// -------------------------------------------------------------------- proxy ---

interface ProxySuccessBody extends UploadResult {
  ok: true;
}

interface ProxyErrorBody {
  ok: false;
  errorKey?: string;
}

/** True when the endpoint itself is absent. */
function endpointMissing(status: number, body: unknown): boolean {
  if (status === 404 || status === 405 || status === 501) return true;
  return body === null || typeof body !== 'object';
}

/**
 * The member's own Firebase ID token, or an empty string.
 */
async function idToken(): Promise<string> {
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase');
    const user = getFirebaseAuth().currentUser;
    if (user !== null) return await user.getIdToken();
  } catch {
    // Fall back to the active auth-store user when Firebase SDK is mocked.
  }
  try {
    const { useAuthStore } = await import('@/store/auth-store');
    const fallbackUser = useAuthStore.getState().user;
    if (fallbackUser !== null && typeof fallbackUser.getIdToken === 'function') {
      return await fallbackUser.getIdToken();
    }
  } catch {
    // Ignore.
  }
  return '';
}

async function uploadThroughProxy(
  file: File,
  purpose: MediaPurpose,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const token = await idToken();
  if (token.length === 0) throw new MediaError('media.errors.signInRequired');

  const prepared = await shrinkForUpload(file, purpose);
  const outgoing =
    prepared.blob instanceof File && prepared.name === prepared.blob.name
      ? prepared.blob
      : new File([prepared.blob], prepared.name, {
          type: prepared.blob.type || file.type,
        });

  const body = new FormData();
  body.append('file', outgoing);
  body.append('purpose', purpose);

  const outcome = await postForm({
    url: UPLOAD_ENDPOINT,
    body,
    headers: { authorization: `Bearer ${token}` },
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  });

  const payload = outcome.body as ProxySuccessBody | ProxyErrorBody | null;

  if (outcome.status === 200 && payload?.ok === true) {
    if (typeof payload.url !== 'string' || payload.url.length === 0) {
      throw new MediaError('media.errors.failed');
    }
    return {
      provider: payload.provider,
      kind: payload.kind,
      url: payload.url,
      thumbUrl: payload.thumbUrl ?? '',
      deleteToken: payload.deleteToken ?? '',
      width: toNumber(payload.width) ?? prepared.width ?? null,
      height: toNumber(payload.height) ?? prepared.height ?? null,
      bytes: toNumber(payload.bytes) ?? outgoing.size,
      mimeType: payload.mimeType || outgoing.type || file.type,
      expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
    };
  }

  if (payload && typeof payload === 'object' && payload.ok === false) {
    throw new MediaError(payload.errorKey ?? 'media.errors.failed');
  }

  if (endpointMissing(outcome.status, payload)) {
    invalidateCapabilities();
    throw new MediaError('media.errors.notConfigured');
  }

  throw new MediaError('media.errors.failed');
}

// ------------------------------------------------------------------- upload ---

export interface UploadOptions {
  purpose: MediaPurpose;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Validates, compresses to WebP, and uploads an image to ImgBB via `/api/media/upload`.
 */
export async function uploadMedia(file: File, options: UploadOptions): Promise<UploadResult> {
  const kind = assertUploadable(file);
  const available = await capabilities(options.signal);
  const plan = planUpload(options.purpose, kind, available);

  if (plan === null) throw new MediaError('media.errors.notConfigured');
  return uploadThroughProxy(file, options.purpose, options.onProgress, options.signal);
}
