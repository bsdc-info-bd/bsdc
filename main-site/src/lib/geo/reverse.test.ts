import { describe, expect, it } from 'vitest';

import {
  COORDINATE_PRECISION,
  LOCATION_BLOCK_KEYS,
  NOMINATIM_ORIGIN,
  POSITION_OPTIONS,
  blockFromPositionError,
  describeLocationSupport,
  placeFromAddress,
  reverseGeocodeUrl,
  roundCoordinate,
  roundedPosition,
} from './reverse';

describe('a position that is not kept', () => {
  it('rounds to a neighbourhood rather than a door', () => {
    expect(COORDINATE_PRECISION).toBe(2);
    expect(roundCoordinate(24.8952113)).toBe(24.9);
    expect(roundCoordinate(91.8671234)).toBe(91.87);
    expect(roundCoordinate(-24.8952)).toBe(-24.9);
    expect(roundedPosition(24.8952113, 91.8671234)).toEqual({
      latitude: 24.9,
      longitude: 91.87,
    });
  });

  it('asks one service, for one thing, in the member\u2019s language', () => {
    const url = new URL(reverseGeocodeUrl({ latitude: 24.9, longitude: 91.87 }, 'bn'));
    expect(url.origin).toBe(NOMINATIM_ORIGIN);
    expect(url.pathname).toBe('/reverse');
    expect(url.searchParams.get('lat')).toBe('24.9');
    expect(url.searchParams.get('lon')).toBe('91.87');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('accept-language')).toBe('bn');
    expect(reverseGeocodeUrl({ latitude: 1, longitude: 2 }, 'en')).toContain('accept-language=en');
  });
});

describe('the place that comes back', () => {
  it('says the city and the country and nothing smaller', () => {
    expect(
      placeFromAddress({
        address: {
          house_number: '12',
          road: 'Zindabazar Road',
          city: 'Sylhet',
          state: 'Sylhet Division',
          country: 'Bangladesh',
        },
      }),
    ).toBe('Sylhet, Bangladesh');
  });

  it('falls back through what a country calls the next thing down', () => {
    expect(placeFromAddress({ address: { town: 'Golapganj', country: 'Bangladesh' } })).toBe(
      'Golapganj, Bangladesh',
    );
    expect(placeFromAddress({ address: { municipality: 'Fenchuganj' } })).toBe('Fenchuganj');
    expect(placeFromAddress({ address: { village: 'Kamalpur', state: 'Sylhet' } })).toBe(
      'Kamalpur, Sylhet',
    );
    // A street on its own is an address, and an address is not what was asked
    // for, so nothing is produced rather than something too precise.
    expect(placeFromAddress({ address: { road: 'Zindabazar Road', house_number: '12' } })).toBe('');
  });

  it('is not fooled by an answer that is not an answer', () => {
    expect(placeFromAddress(null)).toBe('');
    expect(placeFromAddress('Sylhet')).toBe('');
    expect(placeFromAddress({})).toBe('');
    expect(placeFromAddress({ address: null })).toBe('');
    expect(placeFromAddress({ error: 'unable to geocode' })).toBe('');
  });
});

describe('what a refusal means', () => {
  it('tells a decision from a missing signal from a slow one', () => {
    expect(blockFromPositionError(1)).toBe('denied');
    expect(blockFromPositionError(2)).toBe('unavailable');
    expect(blockFromPositionError(3)).toBe('timeout');
    expect(blockFromPositionError(99)).toBe('failed');
  });

  it('knows a browser that cannot be asked', () => {
    expect(describeLocationSupport({ secureContext: true, geolocation: true })).toBe('ok');
    expect(describeLocationSupport({ secureContext: false, geolocation: true })).toBe('insecure');
    expect(describeLocationSupport({ secureContext: true, geolocation: false })).toBe(
      'unsupported',
    );
  });

  it('has a sentence for every way it can fail', () => {
    for (const key of Object.values(LOCATION_BLOCK_KEYS))
      expect(key.startsWith('location.')).toBe(true);
    expect(Object.keys(LOCATION_BLOCK_KEYS)).toHaveLength(7);
  });

  it('does not burn a battery for a city name', () => {
    expect(POSITION_OPTIONS.enableHighAccuracy).toBe(false);
    expect(POSITION_OPTIONS.timeout).toBe(10_000);
    expect(POSITION_OPTIONS.maximumAge).toBe(300_000);
  });
});
