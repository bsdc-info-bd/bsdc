/**
 * BSDC — src/tests/unit/url.test.ts
 * Purpose : Unit coverage for canonical URL handling (PART 10.06).
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  localeFromPath,
  localePath,
  normalizePath,
  stripLocale,
  stripTracking,
  withQuery,
} from '@/shared/lib/url';

describe('url helpers', () => {
  it('normalises paths without a trailing slash', () => {
    expect(normalizePath('/About/')).toBe('/about');
    expect(normalizePath('//feed//new')).toBe('/feed/new');
    expect(normalizePath('')).toBe('/');
  });

  it('removes tracking parameters', () => {
    expect(stripTracking('/p/abc?utm_source=x&ref=y&keep=1')).toBe('/p/abc?keep=1');
  });

  it('builds and removes locale prefixes', () => {
    expect(localePath('bn', '/about')).toBe('/bn/about');
    expect(stripLocale('/bn/about')).toBe('/about');
    expect(localeFromPath('/en/')).toBe('en');
    expect(localeFromPath('/about')).toBeNull();
  });

  it('builds absolute canonical URLs', () => {
    expect(absoluteUrl('/about', 'https://www.bsdc.info.bd')).toBe(
      'https://www.bsdc.info.bd/about',
    );
  });

  it('skips empty query values', () => {
    expect(withQuery('/search', { q: 'bsd', page: undefined, sort: '' })).toBe('/search?q=bsd');
  });
});
