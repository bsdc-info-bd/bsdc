import { describe, expect, it } from 'vitest';
import { googleMapsDirectionsUrl, openStreetMapUrl } from './maps';

/**
 * These two strings are a driver's one tap from a delivery address. If they are
 * malformed the vendor does not discover it until the customer is waiting, so
 * the shape is pinned here rather than eyeballed in a browser.
 */
describe('delivery map links', () => {
  it('builds a Google Maps directions URL with the pin as the destination', () => {
    expect(googleMapsDirectionsUrl(24.8949, 91.8687)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=24.894900,91.868700',
    );
  });

  it('accepts southern and western hemispheres without mangling the sign', () => {
    expect(googleMapsDirectionsUrl(-33.8688, -151.2093)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.868800,-151.209300',
    );
  });

  it('rounds to six decimals, which is street-level precision', () => {
    const url = googleMapsDirectionsUrl(23.123456789, 90.987654321);
    expect(url).toContain('23.123457,90.987654');
    // No scientific notation, which Maps would not parse.
    expect(url).not.toMatch(/e[+-]/i);
  });

  it('builds an OpenStreetMap permalink that centres on the same pin', () => {
    const url = openStreetMapUrl(24.8949, 91.8687);
    expect(url).toContain('mlat=24.894900');
    expect(url).toContain('mlon=91.868700');
    expect(url).toContain('#map=17/24.894900/91.868700');
  });

  it('never emits a non-HTTPS or keyless third-party host', () => {
    for (const url of [googleMapsDirectionsUrl(23.8, 90.4), openStreetMapUrl(23.8, 90.4)]) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).not.toContain('key=');
      expect(url).not.toContain('api_key');
    }
  });
});
