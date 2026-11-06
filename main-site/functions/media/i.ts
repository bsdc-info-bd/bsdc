/**
 * The edge half of picture repair.
 *
 * ## What this is for
 *
 * Members reported that every picture loads for a few minutes and then none do,
 * until they clear site data. The service worker fix removes the cache that
 * caused it. This file removes the *second* cause, which no amount of caching
 * care can fix: a provider that stops serving a picture to this origin.
 *
 * Two shapes of that failure are common enough to design for:
 *
 *   1. **A signed delivery URL that expired.** A host that issues
 *      `?token=…&expires=…` for members' pictures hands out a URL that is valid
 *      for minutes. Store that URL in a post and the post is broken by lunch.
 *      Never store the URL and instead resolve it — which is what this endpoint
 *      does — and the post is never broken at all.
 *   2. **A host that refuses the page's origin.** A hotlink or referrer policy
 *      at the host, or a CORS change, answers `403` to an `<img>` request. The
 *      browser cannot argue; an edge fetch carries no `Referer` and no
 *      `Origin`, so the same bytes arrive.
 *
 * ## What this is not
 *
 * Not a proxy for the internet. It answers only for the three picture hosts the
 * platform itself uploads to, only for `GET`/`HEAD`, only for `http(s)`, only
 * for URLs with no credentials and no port tricks, and it caps the body it will
 * forward. A general-purpose fetch endpoint at an edge is an open redirect's
 * cousin: an SSRF primitive that somebody will find. The allowlist below is
 * exact-host, checked after normalisation, and there is no wildcard path.
 *
 * ## Caching
 *
 * The response is cached at the edge for a day and in the browser for an hour,
 * keyed by the encoded source URL. Providers are the ones who see the traffic,
 * not us, and a repair is only asked for when a picture has already failed.
 *
 * Route: `GET /media/i?u=<encoded absolute URL>`
 */
import { isRepairableMediaHost, looksLikeDocument } from '../../src/lib/media/hosts';

interface MediaEnv {
  MEDIA_PROXY_MAX_BYTES?: string;
  SITE_URL?: string;
}

/** The ceiling on one forwarded picture. Anything larger is not a feed image. */
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;

/** How long the edge keeps a repaired picture. */
const EDGE_TTL_SECONDS = 60 * 60 * 24;
/** How long the browser keeps one. */
const BROWSER_TTL_SECONDS = 60 * 60;

/** Only these content types are forwarded at all. */
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
 * Parses and validates a source URL.
 *
 * The checks are deliberately boring and all of them are necessary: a URL with a
 * different port, with credentials embedded, or with a scheme other than
 * `https:` is a request this endpoint must not make. `https:` only — a plaintext
 * fetch of somebody's picture is a downgrade nobody asked for.
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
  // A provider may say a picture is good for a week; the edge still caps it at a
  // day, because an edge hold is only a healing mechanism, not a CDN contract.
  return Math.min(requested, EDGE_TTL_SECONDS);
}

async function forward(request: Request, env: MediaEnv, source: URL): Promise<Response> {
  const limit = maxBytes(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const upstream = await fetch(source.toString(), {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        // No referrer means a hotlink check has nothing to reject. No cookies
        // means this request cannot borrow a member's session at the host.
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal,
      // The edge's own cache is managed below, explicitly.
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit);

    if (!upstream.ok) {
      // The provider's status is passed through so the browser's own ladder can
      // classify it (410 is an expired signature, 403 is a refusal, 404 is
      // gone) exactly as it would have for the direct request.
      return problem(upstream.status === 404 || upstream.status === 410 ? 404 : 502, 'upstream');
    }

    const type =
      (upstream.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_TYPES.includes(type)) {
      // An HTML error page under an image URL is the poisoning path. It is
      // never forwarded as if it were a picture.
      return problem(502, 'the source is not an image');
    }

    const declared = Number.parseInt(upstream.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(declared) && declared > limit) return problem(413, 'too large');

    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': type,
          'cache-control': `public, max-age=${BROWSER_TTL_SECONDS}`,
          'x-content-type-options': 'nosniff',
        },
      });
    }

    // A body is read through a reader rather than `arrayBuffer()` so the cap is
    // enforced on the bytes that actually arrive, not on a header that can lie.
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

    const ttl = clampTtl(
      upstream.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? null,
    );

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(received),
        'cache-control': `public, max-age=${Math.min(ttl, BROWSER_TTL_SECONDS)}, s-maxage=${ttl}, stale-while-revalidate=86400, immutable`,
        // No script runs from an image, and this response must never be read
        // as a type other than the picture it declares itself to be.
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'cross-origin',
        'access-control-allow-origin': '*',
        'x-bsdc-media-repair': '1',
      },
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
  const source = parseSource(new URL(context.request.url).searchParams.get('u'));
  if (source === null) return problem(400, 'a picture url on this platform is required');
  return forward(context.request, context.env, source);
};
