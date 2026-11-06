import { env, isConfigured } from '@/lib/env';
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
} from './media-contract';

/**
 * Media pipeline.
 *
 * Image bytes have one deliberate destination: ordinary member images go to
 * ImgBB; assets that need Cloudinary transforms (avatars, profile and project
 * covers, project screenshots, product images) go to Cloudinary. Documents and
 * audio also go to Cloudinary. Supabase stores only the `media_assets` metadata
 * row used by the content tables; this module never uploads bytes to Supabase
 * Storage and never falls back to the wrong host when a provider is missing.
 *
 * There are two transports, and the choice between them is the fix for the
 * failure this platform already had. A direct upload needs the host's key
 * compiled into the public bundle at *build* time, so a deployment that missed
 * one `VITE_` variable answers "uploads are not configured" — which on a phone,
 * where the toast is easy to miss, looks exactly like nothing happening at all.
 * It also puts the ImgBB API key, which is a secret and not a publishable one,
 * in JavaScript that anybody can read.
 *
 * So the preferred transport is this site's own edge endpoint,
 * `POST /api/media/upload`, which holds the keys in Pages environment
 * variables, reads them at *runtime*, verifies the caller's Firebase ID token
 * and uploads on the member's behalf. Changing a Pages variable then takes
 * effect on the next request instead of the next rebuild. The direct transport
 * remains as a fallback for a deployment whose Functions are not live yet, so
 * this module keeps working on a static host — but it is never used when the
 * endpoint can do the job, and it is never retried after a genuine provider
 * error, because that would upload the same picture twice.
 */
export {
  chooseProvider,
  cloudinaryThumb,
  cloudinaryWide,
  kindOf,
  MAX_BYTES,
} from './media-contract';
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
   *
   * The edge decides this per purpose (`UPLOAD_LIFETIME_SECONDS` in
   * `functions/_media.ts`) and states what it told the host. The browser does not
   * decide it and cannot extend it: the database validates it again in
   * `record_media_asset`. It is carried here so a caller can say "this goes in
   * 30 days" rather than "this disappears eventually".
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
 *
 * Resolves with the status rather than rejecting on a 4xx/5xx: the caller has
 * to tell "the endpoint is not there" from "the host refused the picture", and
 * only the first may be retried through the other transport.
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

interface CloudinaryResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
  resource_type?: string;
  delete_token?: string;
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

  // Downscale before uploading, when the browser can.
  //
  // The upload is the member's own connection, and it is the slowest part of
  // posting: a 12-megapixel phone photograph is four megabytes of radio time for
  // a picture the feed will draw 480 pixels wide. Re-encoding it to a 2560-pixel
  // WebP at 0.86 quality typically costs 400 KB, is indistinguishable on any
  // screen, and makes posting four times faster on a phone. Where the browser
  // cannot do it — an old Safari, a decode failure, a GIF that must keep
  // animating — the original is sent, which is what happened before.
  const prepared: { blob: Blob; name: string } =
    kind === 'image' ? await shrinkForUpload(file, purpose) : { blob: file, name: file.name };

  const body = new FormData();
  body.append('file', prepared.blob, prepared.name);
  body.append('upload_preset', env.cloudinary.unsignedPreset);
  body.append('folder', cloudinaryFolder(purpose));

  const outcome = await postForm({
    url: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/${cloudinaryResourceType(kind)}/upload`,
    body,
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  });

  if (outcome.status < 200 || outcome.status >= 300) throw new MediaError('media.errors.failed');
  const response = outcome.body as CloudinaryResponse | null;
  if (!response?.secure_url) throw new MediaError('media.errors.failed');

  return {
    provider: 'cloudinary',
    kind,
    url: response.secure_url,
    thumbUrl: kind === 'image' ? cloudinaryThumb(response.secure_url) : '',
    deleteToken: response.delete_token ?? '',
    width: toNumber(response.width),
    height: toNumber(response.height),
    bytes: toNumber(response.bytes) ?? prepared.blob.size,
    mimeType: file.type,
    expiresAt: null,
  };
}

/**
 * The largest a picture needs to be, per purpose, before anything is uploaded.
 *
 * 2560 covers a retina desktop hero with room to crop; a cover is drawn wider than
 * an avatar but never wider than that; a product shot is enlarged by zoom on the
 * page it lives on, so it keeps its detail. Above these widths the extra pixels
 * are bytes nobody can see.
 */
const UPLOAD_MAX_EDGE: Partial<Record<MediaPurpose, number>> = {
  avatar: 640,
  cover: 2560,
  'project-cover': 2560,
  'project-image': 2000,
  'post-image': 2560,
  'comment-image': 1600,
  'product-image': 2000,
};

/** Refuse to re-encode a picture whose result would be larger than the original. */
const SHRINK_QUALITY = 0.86;

/**
 * Re-encode an image at a size the page can actually draw.
 *
 * Returns the original file whenever anything is less than ideal: no canvas, a
 * format that must not be flattened (a GIF's animation, an SVG's vectors), a
 * picture already smaller than the limit, or an encode that came out larger than
 * what went in. Correctness first — the only cost of the original is bytes.
 */
export async function shrinkForUpload(
  file: File,
  purpose: MediaPurpose,
): Promise<{ blob: Blob; name: string }> {
  const maxEdge = UPLOAD_MAX_EDGE[purpose] ?? 2560;
  const unchanged: { blob: Blob; name: string } = { blob: file, name: file.name };
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return unchanged;
  if (typeof createImageBitmap !== 'function') return unchanged;
  if (typeof document === 'undefined' || typeof OffscreenCanvas === 'undefined') return unchanged;
  // A picture that is already small is already fast: re-encoding it would cost a
  // decode and a tick of main-thread time to save nothing.
  if (file.size <= 320 * 1024) return unchanged;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    // A picture within the limit is still worth a quality pass when it is heavy;
    // anything at or below the limit that is already light has returned above.
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) return unchanged;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: SHRINK_QUALITY });
    if (encoded.size === 0 || encoded.size >= file.size) return unchanged;
    const base = file.name.replace(/\.[^.]+$/, '');
    return { blob: encoded, name: `${base}.webp` };
  } catch {
    // An older browser, a corrupt file, a canvas that refused the encode: send
    // the original. A picture that uploads slowly is better than one that fails.
    return unchanged;
  } finally {
    bitmap?.close?.();
  }
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

// --------------------------------------------------------------- capability ---

/** What this deployment can actually upload through, discovered at runtime. */
export interface UploadCapabilities {
  /** The site's own edge endpoint answered and is willing to upload. */
  proxy: boolean;
  /** The edge holds an ImgBB key. */
  proxyImgbb: boolean;
  /** The edge holds both halves of the Cloudinary pair. */
  proxyCloudinary: boolean;
  /** A build-time Cloudinary pair is compiled into this bundle. */
  localCloudinary: boolean;
}

/** Which transport carries the bytes. */
export type UploadRoute = 'proxy' | 'direct';

export interface UploadPlan {
  route: UploadRoute;
  provider: MediaProvider;
}

export function localCapabilities(): UploadCapabilities {
  return {
    proxy: false,
    proxyImgbb: false,
    proxyCloudinary: false,
    localCloudinary: isConfigured.cloudinary,
  };
}

/**
 * Decides the transport before a byte moves.
 *
 * Pure, so the whole routing table can be asserted without a network. The edge
 * is preferred whenever it can serve the provider this purpose needs: it keeps
 * the ImgBB secret out of the public bundle and survives a Pages variable
 * changing without a rebuild. Direct is a fallback, not a preference, and null
 * means "no host will take this", which the caller turns into a readable error
 * rather than a silent no-op.
 */
export function planUpload(
  purpose: MediaPurpose,
  kind: MediaKind,
  capabilities: UploadCapabilities,
): UploadPlan | null {
  const provider = chooseProvider(purpose, kind);
  const viaProxy =
    provider === 'cloudinary' ? capabilities.proxyCloudinary : capabilities.proxyImgbb;
  if (capabilities.proxy && viaProxy) return { route: 'proxy', provider };

  // Only Cloudinary has a direct route. Its cloud name and unsigned preset are
  // public by design; an ImgBB key is a secret and never leaves the Functions.
  if (provider === 'cloudinary' && capabilities.localCloudinary) {
    return { route: 'direct', provider };
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
 * Asks the edge what it can upload, once per page load.
 *
 * Any failure at all — no `fetch`, a static host with no Functions, a non-JSON
 * answer, a timeout — means "no proxy", and the answer is negative rather than
 * thrown. A member on a deployment without Functions still uploads; they just
 * upload through the bundle's own keys.
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
      cloudinary?: unknown;
    };
    if (body?.proxy !== true) return local;
    return {
      ...local,
      proxy: true,
      proxyImgbb: body.imgbb === true,
      proxyCloudinary: body.cloudinary === true,
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

/** True when the endpoint itself is absent, which is the only retryable case. */
function endpointMissing(status: number, body: unknown): boolean {
  if (status === 404 || status === 405 || status === 501) return true;
  // A static host answers an unknown path with the application shell.
  return body === null || typeof body !== 'object';
}

/**
 * The member's own Firebase ID token, or an empty string.
 *
 * The edge endpoint verifies this before it uploads anything, so an upload is
 * attributable to a real member and the `media_assets` row it produces belongs
 * to whoever actually asked for it. Empty means "not signed in", which the
 * caller turns into a readable error rather than an anonymous upload.
 */
async function idToken(): Promise<string> {
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase');
    const user = getFirebaseAuth().currentUser;
    if (user === null) return '';
    return await user.getIdToken();
  } catch {
    return '';
  }
}

async function uploadThroughProxy(
  file: File,
  purpose: MediaPurpose,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const token = await idToken();
  if (token.length === 0) throw new MediaError('media.errors.signInRequired');

  const body = new FormData();
  body.append('file', file);
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
      width: toNumber(payload.width),
      height: toNumber(payload.height),
      bytes: toNumber(payload.bytes) ?? file.size,
      mimeType: payload.mimeType || file.type,
      expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
    };
  }

  // The endpoint is there and refused the picture. Surface its reason; never
  // retry through the other transport, which would upload it a second time.
  if (payload && typeof payload === 'object' && payload.ok === false) {
    throw new MediaError(payload.errorKey ?? 'media.errors.failed');
  }

  if (endpointMissing(outcome.status, payload)) {
    invalidateCapabilities();
    throw new ProxyUnavailable();
  }

  throw new MediaError('media.errors.failed');
}

/** Internal: the edge endpoint is not deployed, so the direct path may run. */
class ProxyUnavailable extends Error {}

// ------------------------------------------------------------------- upload ---

export interface UploadOptions {
  purpose: MediaPurpose;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Validates, routes and uploads a single file.
 *
 * The plan is decided once, up front, from what this deployment can actually
 * do. The edge carries it when it can; the bundle's own keys carry it when the
 * edge is not there; and when neither host will take the file the member gets a
 * readable reason instead of a spinner that stops.
 */
export async function uploadMedia(file: File, options: UploadOptions): Promise<UploadResult> {
  const kind = assertUploadable(file);
  const available = await capabilities(options.signal);
  const plan = planUpload(options.purpose, kind, available);

  if (plan === null) throw new MediaError('media.errors.notConfigured');

  if (plan.route === 'proxy') {
    try {
      return await uploadThroughProxy(file, options.purpose, options.onProgress, options.signal);
    } catch (error) {
      if (!(error instanceof ProxyUnavailable)) throw error;
      // Fall through: this deployment has no Functions, so use the bundle's own
      // keys when it holds them. `plan` is recomputed because the probe was
      // wrong about what this deployment can do.
      const fallback = planUpload(options.purpose, kind, localCapabilities());
      if (fallback?.provider !== 'cloudinary') throw new MediaError('media.errors.notConfigured');
      return uploadToCloudinary(file, kind, options.purpose, options.onProgress, options.signal);
    }
  }

  if (plan.provider !== 'cloudinary') throw new MediaError('media.errors.notConfigured');
  return uploadToCloudinary(file, kind, options.purpose, options.onProgress, options.signal);
}
