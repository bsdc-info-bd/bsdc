/**
 * The edge half of the media pipeline (ImgBB-only).
 *
 * All images across BSDC are uploaded exclusively to ImgBB from this Pages
 * Function, keeping `IMGBB_API_KEY` server-only at request time while reading
 * ImgBB's aspect-preserving `medium` (~640px) and full `image` URLs so feed
 * cards, post views, avatars, and covers render rapidly at the right resolution.
 */
import { IMAGE_SNIFF_BYTES, looksLikeImageBytes } from '../src/lib/media/image-signature';
import {
  chooseProvider,
  effectiveMimeType,
  kindOf,
  MAX_BYTES,
  type MediaKind,
  type MediaProvider,
  type MediaPurpose,
} from '../src/lib/storage/media-contract';

export interface MediaEnv {
  /** ImgBB's API key. A secret: it is never sent to a browser. */
  IMGBB_API_KEY?: string;
  /** Optional deployment alias for the server-only ImgBB API key. */
  BSDC_IMGBB_API_KEY?: string;
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
    imgbbKey: first(env.IMGBB_API_KEY, env.BSDC_IMGBB_API_KEY),
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
  const kind = kindOf(effectiveMimeType(file));
  if (kind === null) return { errorKey: 'media.errors.unsupported', status: 415 };
  if (file.size === 0) return { errorKey: 'media.errors.empty', status: 400 };
  if (file.size > MAX_BYTES[kind]) return { errorKey: 'media.errors.tooLarge', status: 413 };

  void chooseProvider(purpose, kind);
  const credentials = credentialsOf(env);
  if (!hasImgbb(credentials)) return { errorKey: 'media.errors.notConfigured', status: 503 };

  return null;
}

/**
 * Whether the file's own bytes are a picture.
 *
 * `reject()` checks the type the browser *said* the file was. That is a claim,
 * and it costs one line to send a ZIP with `content-type: image/png` — which
 * then spends this deployment's upload quota and puts a file in a picture
 * account. The first bytes are the evidence, and the same check already guards
 * the read path (`functions/media/i.ts`) and the worker's cache, so the three
 * cannot disagree about what a picture is.
 *
 * A refusal is `media.errors.unsupported`, the same sentence the member would
 * have read had the browser refused it, because from their point of view the
 * same thing happened.
 */
export function rejectBytes(bytes: Uint8Array): MediaFailure | null {
  if (!looksLikeImageBytes(bytes.subarray(0, IMAGE_SNIFF_BYTES))) {
    return { errorKey: 'media.errors.unsupported', status: 415 };
  }
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
  'ad-creative': 0,
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

/**
 * A refusal that knows why, so the endpoint can answer in the member's language.
 *
 * Which host said no, and what it said, stays inside this function: the member
 * reads an i18n key, never a provider's error text, and the identity of the
 * service behind the endpoint is not advertised to a caller.
 */
export class HostError extends Error {
  constructor(
    public readonly errorKey: string,
    public readonly status: number,
  ) {
    super(errorKey);
    this.name = 'HostError';
  }
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

/**
 * How long one ImgBB upload may take before the edge gives up on it.
 *
 * A Pages Function has a wall-clock budget of its own, and a request that hangs
 * against the host until the platform kills it answers the member with a 5xx and
 * no explanation. Answering first, with a reason, is better.
 */
const UPSTREAM_TIMEOUT_MS = 25_000;

/** Upload attempts, including the first. A 5xx or a timeout is retried once. */
const UPSTREAM_ATTEMPTS = 2;

/** Statuses worth trying again: the host is busy, rate-limiting, or transiently blocking at an edge WAF. */
function retryable(status: number, body: string): boolean {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  return status === 403 && looksLikeHtmlBody(body);
}

function looksLikeHtmlBody(body: string): boolean {
  return /^\s*</.test(body) && /<!doctype|<html|<head|<title/i.test(body);
}

/**
 * Whether ImgBB's own words name the credential.
 *
 * ImgBB answers an invalid or expired key with a 400 JSON payload whose error
 * message mentions the API key (`Invalid API v1 key.` / error code 100). A WAF
 * or edge rate-limit HTML page with HTTP 403 is a transient failure, NOT a
 * missing secret — conflating the two blames a healthy deployment with
 * "Picture uploads are unavailable right now".
 */
export function keyWasRefused(status: number, body: string): boolean {
  if (looksLikeHtmlBody(body)) return false;

  let message = body;
  let code: number | null = null;
  try {
    const parsed = JSON.parse(body) as {
      status_code?: unknown;
      error?: { message?: unknown; code?: unknown };
    };
    if (typeof parsed.error?.message === 'string') message = parsed.error.message;
    if (typeof parsed.error?.code === 'number') code = parsed.error.code;
  } catch {
    // Plain-text response; evaluate raw body below.
  }

  if (code === 100 && /key/i.test(message)) return true;
  if (
    /invalid.{0,24}(api)?\s*key|expired.{0,12}(api)?\s*key|missing.{0,12}(api)?\s*key/i.test(
      message,
    )
  ) {
    return true;
  }
  return status === 401 && /key|auth|token|credential/i.test(message);
}

function ensureHttpsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol.startsWith('http')) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/** Threshold above which multipart Blob upload avoids doubling heap via base64 strings. */
const MULTIPART_BLOB_THRESHOLD_BYTES = 2 * 1024 * 1024;

async function sendToImgbb(
  file: File,
  key: string,
  purpose: MediaPurpose,
  bytes: Uint8Array | undefined,
  now = Date.now(),
): Promise<EdgeUploadResult> {
  const rawBytes = bytes ?? new Uint8Array(await file.arrayBuffer());
  const useBinaryMultipart = rawBytes.byteLength > MULTIPART_BLOB_THRESHOLD_BYTES;
  const base64 = useBinaryMultipart ? '' : bytesToBase64(rawBytes);
  const lifetime = UPLOAD_LIFETIME_SECONDS[purpose] ?? 0;

  const endpoint = `https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`;

  let response: Response | null = null;
  let text = '';
  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      // Rebuilt on every attempt so a retry never reuses a consumed multipart
      // body stream in Workers/undici.
      const body = new FormData();
      if (useBinaryMultipart) {
        const mime = effectiveMimeType(file) || 'image/webp';
        body.append('image', new Blob([rawBytes], { type: mime }), file.name || 'image.webp');
      } else {
        body.append('image', base64);
      }
      if (lifetime > 0) body.append('expiration', String(lifetime));
      response = await fetch(endpoint, { method: 'POST', body, signal: controller.signal });
      text = await response.text();
    } catch {
      response = null;
      text = '';
    } finally {
      clearTimeout(timeout);
    }

    if (response !== null && !retryable(response.status, text)) break;
    if (attempt < UPSTREAM_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (response === null) throw new HostError('media.errors.failed', 504);
  if (!response.ok) {
    if (keyWasRefused(response.status, text)) {
      throw new HostError('media.errors.notConfigured', 503);
    }
    if (response.status === 413) throw new HostError('media.errors.tooLarge', 413);
    throw new HostError('media.errors.failed', 502);
  }

  let payload: ImgbbResponse;
  try {
    payload = JSON.parse(text) as ImgbbResponse;
  } catch {
    throw new HostError('media.errors.failed', 502);
  }
  const rawFullUrl =
    payload.data?.image?.url ?? payload.data?.display_url ?? payload.data?.url ?? '';
  const fullUrl = ensureHttpsUrl(rawFullUrl);
  if (fullUrl.length === 0) throw new HostError('media.errors.failed', 502);

  // ImgBB's `thumb` is a 180x180 square crop suited only for small avatars;
  // `medium` (~640px wide) preserves aspect ratio for feed cards and previews.
  const rawThumbUrl =
    purpose === 'avatar'
      ? (payload.data?.thumb?.url ?? payload.data?.medium?.url ?? fullUrl)
      : (payload.data?.medium?.url ?? payload.data?.display_url ?? fullUrl);
  const thumbUrl = ensureHttpsUrl(rawThumbUrl) || fullUrl;

  return {
    provider: 'imgbb',
    kind: 'image',
    url: fullUrl,
    thumbUrl,
    deleteToken: payload.data?.delete_url ?? '',
    width: toNumber(payload.data?.width) ?? toNumber(payload.data?.image?.width),
    height: toNumber(payload.data?.height) ?? toNumber(payload.data?.image?.height),
    bytes: toNumber(payload.data?.size) ?? file.size,
    mimeType: payload.data?.image?.mime ?? (effectiveMimeType(file) || file.type),
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
  /** The bytes, when the caller already read them to check the signature. */
  bytes?: Uint8Array,
): Promise<EdgeUploadResult> {
  const kind = kindOf(effectiveMimeType(file));
  if (kind === null) throw new HostError('media.errors.unsupported', 415);

  const credentials = credentialsOf(env);
  if (!hasImgbb(credentials)) throw new HostError('media.errors.notConfigured', 503);
  return sendToImgbb(file, credentials.imgbbKey, purpose, bytes);
}
