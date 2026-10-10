/**
 * Cloudflare Pages Function — POST /api/geo/reverse
 *
 * One press of "use my location" turns a rounded coordinate into a place name.
 *
 * The browser does not talk to OpenStreetMap itself, for three reasons that all
 * matter. Nominatim's policy wants a User-Agent that says who is asking, and a
 * browser will not let a page set one. Its policy also wants the requests to be
 * rare, which an edge cache can guarantee and a thousand members' browsers
 * cannot. And keeping the call here means the site's content security policy
 * stays what it was: no third party is added to `connect-src` for the sake of a
 * city name, and the only thing that leaves a member's browser is a coordinate
 * rounded to about a kilometre, posted to this origin.
 *
 * The rounding happens again here, because a caller is not trusted to have done
 * it. Nothing about the position is stored: the answer is cached against the
 * rounded pair for a day and then forgotten.
 */
import {
  NOMINATIM_USER_AGENT,
  placeFromAddress,
  reverseGeocodeUrl,
  roundedPosition,
} from '../../../src/lib/geo/reverse';

interface ReverseRequest {
  latitude?: unknown;
  longitude?: unknown;
  language?: unknown;
}

/** How long one answer is reused. A city does not move. */
const CACHE_SECONDS = 24 * 60 * 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export const onRequestPost: PagesFunction = async (context) => {
  let payload: ReverseRequest = {};
  try {
    payload = (await context.request.json()) as ReverseRequest;
  } catch {
    return json({ error: 'a json body is required' }, 400);
  }

  if (!isCoordinate(payload.latitude) || !isCoordinate(payload.longitude)) {
    return json({ error: 'a latitude and a longitude are required' }, 400);
  }
  if (Math.abs(payload.latitude) > 90 || Math.abs(payload.longitude) > 180) {
    return json({ error: 'that is not a place on earth' }, 400);
  }

  const position = roundedPosition(payload.latitude, payload.longitude);
  const language = payload.language === 'en' ? 'en' : 'bn';
  const upstream = reverseGeocodeUrl(position, language);

  // Two members in the same neighbourhood ask the same question, and the answer
  // is the same for both. Serving it from the edge keeps the upstream request
  // count near zero without storing anything about either of them.
  const cache = caches.default;
  const cacheKey = new Request(
    `https://geo.bsdc.internal/${position.latitude},${position.longitude},${language}`,
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let answer: unknown;
  try {
    const response = await fetch(upstream, {
      headers: { accept: 'application/json', 'user-agent': NOMINATIM_USER_AGENT },
      // A geocoder that takes longer than this is not worth waiting for: the
      // member has a text field and a keyboard.
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return json({ error: 'the geocoder did not answer' }, 502);
    answer = await response.json();
  } catch {
    return json({ error: 'the geocoder could not be reached' }, 502);
  }

  const place = placeFromAddress(answer);
  const bodyText = JSON.stringify({
    place,
    latitude: position.latitude,
    longitude: position.longitude,
  });

  if (place.length > 0) {
    // `caches.default` will not store a `no-store` answer, and it is the same
    // cache the match above read from.
    await cache.put(
      cacheKey,
      new Response(bodyText, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, max-age=${CACHE_SECONDS}`,
        },
      }),
    );
  }

  // Nothing about a member's position is kept past this response.
  return new Response(bodyText, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export const onRequestGet: PagesFunction = () => json({ error: 'method not allowed' }, 405);
