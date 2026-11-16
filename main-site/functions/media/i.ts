/**
 * Edge image delivery & repair endpoint (`GET /media/i?u=<encoded URL>`).
 *
 * Serves allowlisted ImgBB images from BSDC's own Cloudflare edge with 7-day
 * PoP caching (`cf: { cacheEverything: true, cacheTtl: 604800 }`) and immutable
 * browser cache headers. This eliminates hotlink/CORS/ISP throttling issues and
 * caches heavy historical images at the nearest Cloudflare edge location.
 */
import { IMAGE_SNIFF_BYTES, looksLikeImageBytes } from '../../src/lib/media/image-signature';
import { isRepairableMediaHost, looksLikeDocument } from '../../src/lib/media/hosts';

interface MediaEnv {
  MEDIA_PROXY_MAX_BYTES?: string;
  SITE_URL?: string;
}

/** Maximum forwarded image size (12 MB). */
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;

/** 7-day Cloudflare edge and browser cache lifetime for content-addressed ImgBB URLs. */
const EDGE_TTL_SECONDS = 60 * 60 * 24 * 7;
const BROWSER_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Only verified image MIME types are forwarded. */
const IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
];

function problem(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * Parses and validates a source URL against the strict ImgBB host allowlist.
 */
export function parseSource(raw: string | null): URL | null {
  if (raw === null || raw.length === 0 || raw.length > 2_048) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username.length > 0 || parsed.password.length > 0) return null;
  if (parsed.port.length > 0 && parsed.port !== '443') return null;
  if (parsed.hostname.length === 0 || parsed.hostname.includes('..')) return null;
  if (!isRepairableMediaHost(parsed.hostname)) return null;
  if (looksLikeDocument(parsed.toString())) return null;
  return parsed;
}

function maxBytes(env: MediaEnv): number {
  const configured = Number.parseInt(env.MEDIA_PROXY_MAX_BYTES ?? '', 10);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_BYTES;
  return Math.min(Math.max(configured, 64 * 1024), 32 * 1024 * 1024);
}

function clampTtl(value: string | null): number {
  const requested = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(requested) || requested <= 0) return EDGE_TTL_SECONDS;
  return Math.min(Math.max(requested, 3_600), EDGE_TTL_SECONDS);
}

const MAX_REDIRECTS = 3;

async function fetchAllowlisted(
  method: 'GET' | 'HEAD',
  source: URL,
  signal: AbortSignal,
): Promise<Response | null> {
  let current = source;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), {
      method,
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
      },
      redirect: 'manual',
      signal,
      cf: { cacheTtl: EDGE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_REDIRECTS) return null;
      let resolved: string;
      try {
        resolved = new URL(location, current).toString();
      } catch {
        return null;
      }
      const next = parseSource(resolved);
      if (next === null) return null;
      current = next;
      continue;
    }

    return response;
  }
  return null;
}

async function forward(request: Request, env: MediaEnv, source: URL): Promise<Response> {
  const limit = maxBytes(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const upstream = await fetchAllowlisted(
      request.method === 'HEAD' ? 'HEAD' : 'GET',
      source,
      controller.signal,
    );

    if (upstream === null) {
      return problem(502, 'disallowed redirect target');
    }

    if (!upstream.ok) {
      return problem(upstream.status === 404 || upstream.status === 410 ? 404 : 502, 'upstream');
    }

    const type =
      (upstream.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_TYPES.includes(type)) {
      return problem(502, 'the source is not an image');
    }

    const declared = Number.parseInt(upstream.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(declared) && declared > limit) return problem(413, 'too large');

    if (request.method === 'HEAD') {
      const headHeaders: Record<string, string> = {
        'content-type': type,
        'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}, immutable`,
        'x-content-type-options': 'nosniff',
      };
      if (type === 'image/svg+xml') {
        headHeaders['content-security-policy'] =
          "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      }
      return new Response(null, { status: 200, headers: headHeaders });
    }

    const reader = upstream.body?.getReader();
    if (!reader) return problem(502, 'the source sent no body');

    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => undefined);
        return problem(413, 'too large');
      }
      chunks.push(value);
    }

    if (received === 0) return problem(502, 'the source sent an empty body');

    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // The bytes, not the label. A host answering an image URL with a 200 and an
    // HTML rate-limit page under `content-type: image/jpeg` would otherwise be
    // handed on — and cached here for a week, and in the member's browser for a
    // week — as the picture. That is the shape of "the images stopped loading".
    if (!looksLikeImageBytes(body.subarray(0, IMAGE_SNIFF_BYTES))) {
      return problem(502, 'the source is not a picture');
    }

    const ttl = clampTtl(
      upstream.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? null,
    );

    const responseHeaders: Record<string, string> = {
      'content-type': type,
      'content-length': String(received),
      'cache-control': `public, max-age=${Math.min(ttl, BROWSER_TTL_SECONDS)}, s-maxage=${ttl}, stale-while-revalidate=86400, immutable`,
      // The bytes are the same for every encoding, but the negotiation is
      // real: a cache that ignores it can hand a WebP-only client a format it
      // did not ask for.
      vary: 'accept',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'cross-origin',
      'access-control-allow-origin': '*',
      'x-bsdc-media-repair': '1',
    };
    if (type === 'image/svg+xml') {
      responseHeaders['content-security-policy'] =
        "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }

    return new Response(body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return problem(504, 'the source did not answer in time');
  } finally {
    clearTimeout(timeout);
  }
}

export const onRequestGet: PagesFunction<MediaEnv> = async (context) => {
  const source = parseSource(new URL(context.request.url).searchParams.get('u'));
  if (source === null) return problem(400, 'a picture url on this platform is required');
  return forward(context.request, context.env, source);
};

export const onRequestHead: PagesFunction<MediaEnv> = async (context) => {
  const source = parseSource(
    context.request ? new URL(context.request.url).searchParams.get('u') : null,
  );
  if (source === null) return problem(400, 'a picture url on this platform is required');
  return forward(context.request, context.env, source);
};
