/**
 * Turning a position into a place, without keeping the position.
 *
 * A member who says where they are gets more out of this site: events in their
 * city, people near them, a profile that says something. What they should not
 * have to give for that is a trail of coordinates, so two decisions are built in
 * here.
 *
 * The coordinates are rounded to two decimal places — about a kilometre — before
 * they are sent anywhere, which is far more precision than a city name needs and
 * far less than a house. And the rounded pair goes to one place, a reverse
 * geocoder, and comes back as words. The words are what is stored; the numbers
 * are never written to the database, never logged and never sent to this site's
 * own servers.
 *
 * OpenStreetMap's Nominatim is used because it needs no key, no account and no
 * billing, and its policy is a rate limit rather than a contract: one request per
 * member per button press, with a User-Agent that says where it came from.
 */

export const NOMINATIM_ORIGIN = 'https://nominatim.openstreetmap.org';

/** What Nominatim asks for, and what its policy asks of us. */
export const NOMINATIM_USER_AGENT = 'BSDC/1.0 (https://bsdc.info.bd; rrc@bsdc.info.bd)';

/** Two decimals is about 1.1 km at the equator: a neighbourhood, not a door. */
export const COORDINATE_PRECISION = 2;

export function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

export interface RoundedPosition {
  latitude: number;
  longitude: number;
}

export function roundedPosition(latitude: number, longitude: number): RoundedPosition {
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

/** The URL one press of the button is allowed to ask for. */
export function reverseGeocodeUrl(position: RoundedPosition, language: 'bn' | 'en' = 'bn'): string {
  const url = new URL('/reverse', NOMINATIM_ORIGIN);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(position.latitude));
  url.searchParams.set('lon', String(position.longitude));
  url.searchParams.set('zoom', '12');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', language === 'en' ? 'en' : 'bn');
  return url.toString();
}

/**
 * The most specific thing that is still a place somebody would say out loud. A
 * street or a house number is never used, even when Nominatim returns one,
 * because a profile field that reads "House 12, Road 4" is a member's address
 * wearing a costume.
 */
/** A city, a town, a municipality: a place somebody would say out loud. */
const CITY_KEYS = ['city', 'town', 'municipality'] as const;
/** Smaller than a city, and only worth naming with the state after it. */
const SMALL_KEYS = ['village', 'city_district', 'suburb', 'county', 'state_district'] as const;

function firstNamed(address: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = address[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

export function placeFromAddress(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return '';
  const response = payload as { address?: unknown };
  const address =
    response.address !== null && typeof response.address === 'object'
      ? (response.address as Record<string, unknown>)
      : null;
  if (address === null) return '';

  const state = firstNamed(address, ['state']);
  const parts: string[] = [];

  const city = firstNamed(address, CITY_KEYS);
  if (city.length > 0) {
    parts.push(city);
  } else {
    const small = firstNamed(address, SMALL_KEYS);
    if (small.length > 0) {
      parts.push(small);
      // A village on its own is not somewhere anybody can find; a village in its
      // division is. A city needs no help.
      if (state.length > 0 && state !== small) parts.push(state);
    } else if (state.length > 0) {
      parts.push(state);
    }
  }

  const country = firstNamed(address, ['country']);
  if (country.length > 0 && !parts.includes(country)) parts.push(country);

  // Two decimals can land in a river or on a border with nothing named for a
  // kilometre around. Rather than fall back to a full address — which is the
  // thing this module refuses to produce — say nothing and let the member type
  // it themselves.
  if (parts.length === 0) return '';

  // The same separator in both languages: a comma reads as a comma in Bangla,
  // and the parts themselves arrive in whichever language was asked for.
  return parts.join(', ');
}

/** The i18n key for each way a position request can fail. */
export type LocationBlock =
  | 'ok'
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'failed';

export const LOCATION_BLOCK_KEYS: Record<LocationBlock, string> = {
  ok: 'location.ready',
  unsupported: 'location.errors.unsupported',
  insecure: 'location.errors.insecure',
  denied: 'location.errors.denied',
  unavailable: 'location.errors.unavailable',
  timeout: 'location.errors.timeout',
  failed: 'location.errors.failed',
};

/**
 * `GeolocationPositionError.code` is 1, 2 or 3, and each one is a different
 * conversation: 1 is a decision the member made and can undo, 2 is hardware or a
 * network that has nothing to offer, 3 is worth trying again.
 */
export function blockFromPositionError(code: number): LocationBlock {
  switch (code) {
    case 1:
      return 'denied';
    case 2:
      return 'unavailable';
    case 3:
      return 'timeout';
    default:
      return 'failed';
  }
}

/** Whether this browser can be asked at all, and which reason it cannot. */
export function describeLocationSupport(env: {
  secureContext: boolean;
  geolocation: boolean;
}): LocationBlock {
  if (!env.secureContext) return 'insecure';
  if (!env.geolocation) return 'unsupported';
  return 'ok';
}

/** How long to wait for a fix before saying it is taking too long. */
export const POSITION_TIMEOUT_MS = 10_000;

/**
 * Cached, and never more precise than the device already knows. High accuracy
 * would drain a battery for a city name; the coarse fix is enough and is what the
 * rounding was designed around.
 */
export const POSITION_OPTIONS: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
} = {
  enableHighAccuracy: false,
  timeout: POSITION_TIMEOUT_MS,
  maximumAge: 5 * 60_000,
};
