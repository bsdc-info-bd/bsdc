/**
 * Outbound map links for a delivery pin.
 *
 * Both are plain HTTPS URLs on purpose. They open the native app when one is
 * installed and the website when one is not, they need no API key, no billing
 * account and no JavaScript SDK, and neither can leak a location to a third
 * party until the member actually taps it. A paid maps SDK would be the only
 * part of this stack with a bill attached.
 */

/** `google.com/maps/dir` for the pin: one tap hands the trip to Google Maps. */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** An `openstreetmap.org` permalink for the same pin, as a free fallback. */
export function openStreetMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=17/${lat.toFixed(6)}/${lng.toFixed(6)}`;
}
