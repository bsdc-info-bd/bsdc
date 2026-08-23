/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Location utilities powered by OpenStreetMap (OSM) — permission-based geolocation,
 * Nominatim reverse/forward geocoding and geo ranking for the personalized feed.
 *
 * Privacy: coordinates are stored only on the user's own profile document and are
 * optional. Everything works without location; enabling it improves feed relevance
 * ("nearby developers", geo-boosted ranking).
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ResolvedPlace {
  city: string;
  country: string;
  countryCode: string;
  displayName: string;
  point: GeoPoint;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

interface NominatimReverse {
  place_id?: number;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

interface NominatimSearch {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  address?: { country?: string; country_code?: string; city?: string; state?: string };
}

/** Browser geolocation permission → coordinates. Rejects with a friendly message. */
export function requestBrowserLocation(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location permission denied — you can type your city instead',
          2: 'Location unavailable — check your connection',
          3: 'Location request timed out — try again',
        };
        reject(new Error(messages[err.code] || 'Could not get your location'));
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  });
}

/** Reverse-geocode coordinates to a place via the OSM Nominatim API. */
export async function reverseGeocode(point: GeoPoint): Promise<ResolvedPlace> {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}&zoom=10&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Reverse geocoding failed');
  const json = (await res.json()) as NominatimReverse;
  const a = json.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.county || a.state || 'Unknown';
  return {
    city,
    country: a.country || '',
    countryCode: (a.country_code || '').toUpperCase(),
    displayName: [city, a.state, a.country].filter(Boolean).join(', '),
    point,
  };
}

/** Permission → place, in one step (the "Use my location" flow). */
export async function detectMyPlace(): Promise<ResolvedPlace> {
  const point = await requestBrowserLocation();
  return reverseGeocode(point);
}

/** Forward geocoding — city autocomplete for manual location entry. */
export async function searchPlaces(query: string, maxResults = 5): Promise<ResolvedPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=${maxResults}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = (await res.json()) as NominatimSearch[];
  return json.map((r) => ({
    city: r.address?.city || r.display_name?.split(',')[0] || q,
    country: r.address?.country || '',
    countryCode: (r.address?.country_code || '').toUpperCase(),
    displayName: r.display_name || q,
    point: { lat: Number(r.lat) || 0, lng: Number(r.lon) || 0 },
  }));
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Geo proximity multiplier for feed ranking:
 *   same city (< 60 km) → 1.35, same region (< 200 km) → 1.18,
 *   same country → 1.1, far/unknown → 1.0
 * Falls back to string matching when one side has no coordinates.
 */
export function geoBoost(
  viewerGeo: GeoPoint | null | undefined,
  viewerLocation: string | undefined,
  authorGeo: GeoPoint | null | undefined,
  authorLocation: string | undefined,
): number {
  if (viewerGeo && authorGeo) {
    const km = haversineKm(viewerGeo, authorGeo);
    if (km < 60) return 1.35;
    if (km < 200) return 1.18;
    if (km < 1500) return 1.08;
    return 1.0;
  }
  const v = (viewerLocation || '').toLowerCase();
  const a = (authorLocation || '').toLowerCase();
  if (!v || !a) return 1.0;
  if (v === a) return 1.2;
  const vCity = v.split(',')[0]?.trim();
  const aCity = a.split(',')[0]?.trim();
  if (vCity && aCity && vCity === aCity) return 1.2;
  // Same country (last comma segment) — only when both sides actually state one.
  const vCountry = v.split(',').pop()?.trim() || '';
  const aCountry = a.split(',').pop()?.trim() || '';
  if (vCountry && aCountry && vCountry === aCountry) return 1.1;
  return 1.0;
}
