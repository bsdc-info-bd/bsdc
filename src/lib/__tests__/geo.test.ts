/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { describe, expect, it } from 'vitest';
import { geoBoost, haversineKm } from '../geo';

const Sylhet = { lat: 24.8949, lng: 91.8687 };
const Dhaka = { lat: 23.8103, lng: 90.4125 };
const London = { lat: 51.5072, lng: -0.1276 };

describe('haversineKm', () => {
  it('computes the Sylhet–Dhaka distance (~197 km)', () => {
    const km = haversineKm(Sylhet, Dhaka);
    expect(km).toBeGreaterThan(180);
    expect(km).toBeLessThan(215);
  });
  it('returns 0 for identical points', () => {
    expect(haversineKm(Sylhet, Sylhet)).toBeCloseTo(0, 5);
  });
});

describe('geoBoost', () => {
  it('strongly boosts same-city coordinates', () => {
    expect(geoBoost(Sylhet, 'Sylhet', { lat: 24.9, lng: 91.87 }, 'Sylhet')).toBeCloseTo(1.35, 5);
  });
  it('moderately boosts same-region (Bangladesh)', () => {
    expect(geoBoost(Sylhet, 'Sylhet, Bangladesh', Dhaka, 'Dhaka, Bangladesh')).toBeCloseTo(1.18, 5);
  });
  it('does not boost far-away authors', () => {
    expect(geoBoost(Sylhet, 'Sylhet', London, 'London')).toBe(1.0);
  });
  it('falls back to string matching without coordinates', () => {
    expect(geoBoost(null, 'Sylhet, Bangladesh', null, 'Sylhet, Bangladesh')).toBeCloseTo(1.2, 5);
    expect(geoBoost(null, 'Dhaka', null, 'London')).toBe(1.0);
  });
  it('is neutral when either side has no location at all', () => {
    expect(geoBoost(null, '', null, 'Dhaka')).toBe(1.0);
  });
});
