import { describe, expect, it } from 'vitest';

import {
  IMAGE_WIDTHS,
  placeholderColour,
  proxiedUrl,
  responsiveSource,
  shouldProxyForSpeed,
  widthFor,
} from '@/lib/media/optimise';

const FULL = 'https://i.ibb.co/full/photo.webp';
const MEDIUM = 'https://i.ibb.co/medium/photo.webp';

describe('which width a slot asks for', () => {
  it('rounds up to a real layout width, so a picture is never upscaled', () => {
    expect(widthFor(100, 1)).toBe(128);
    expect(widthFor(300, 1)).toBe(384);
    expect(widthFor(360, 2)).toBe(960);
  });

  it('accounts for the screen density, because a 3x phone needs three times the pixels', () => {
    expect(widthFor(360, 1)).toBe(384);
    expect(widthFor(360, 2)).toBe(960);
    expect(widthFor(360, 3)).toBe(1280);
  });

  it('refuses a ratio that would ask for a pointless download', () => {
    expect(widthFor(360, 5)).toBe(widthFor(360, 3));
    expect(widthFor(1200, 3)).toBe(1920);
  });

  it('survives a zero width, which is what a hidden container measures', () => {
    expect(widthFor(0, 2)).toBe(128);
    expect(widthFor(-40, 2)).toBe(128);
  });

  it('only ever returns a width from the ladder', () => {
    for (const slot of [1, 50, 200, 333, 640, 1000, 5000]) {
      expect(IMAGE_WIDTHS).toContain(widthFor(slot, 2));
    }
  });
});

describe('the srcset a browser uses to choose between ImgBB variants', () => {
  it('advertises both 640w medium and full WebP variants for feed cards', () => {
    const source = responsiveSource(FULL, 384, { variantUrl: MEDIUM, fullWidth: 1600 });
    expect(source.src).toBe(MEDIUM);
    expect(source.srcset).toBe(`${MEDIUM} 640w, ${FULL} 1600w`);
    expect(source.sizes).toContain('384px');
  });

  it('selects the full URL as primary src on wide hero slots', () => {
    const source = responsiveSource(FULL, 960, { variantUrl: MEDIUM, fullWidth: 1600 });
    expect(source.src).toBe(FULL);
    expect(source.srcset).toContain(`${MEDIUM} 640w`);
    expect(source.srcset).toContain(`${FULL} 1600w`);
    expect(source.sizes).toContain('640px');
  });

  it('emits no synthetic srcset when no distinct variant exists', () => {
    const source = responsiveSource(FULL, 360);
    expect(source.srcset).toBe('');
    expect(source.sizes).toBe('');
    expect(source.src).toBe(FULL);
  });

  it('caps tiny tiles at the 640w medium variant so phones do not over-fetch', () => {
    const source = responsiveSource(FULL, 200, {
      devicePixelRatio: 1,
      variantUrl: MEDIUM,
      fullWidth: 1600,
    });
    const widths = [...source.srcset.matchAll(/ (\d+)w/g)].map((match) => Number(match[1]));
    expect(widths).toEqual([640]);
  });
});

describe('when a picture goes through this origin instead', () => {
  it('proxies a large ImgBB picture so the Cloudflare edge caches it once for everybody', () => {
    expect(shouldProxyForSpeed('https://i.ibb.co/abc/big.jpg', 3_000_000)).toBe(true);
    expect(shouldProxyForSpeed('https://i.ibb.co.com/abc/big.jpg', 3_000_000)).toBe(true);
  });

  it('leaves a small compressed WebP alone, where direct CDN is fastest', () => {
    expect(shouldProxyForSpeed('https://i.ibb.co/abc/small.webp', 80_000)).toBe(false);
  });

  it('leaves an unknown size alone', () => {
    expect(shouldProxyForSpeed('https://i.ibb.co/abc/unknown.jpg', null)).toBe(false);
  });

  it('never proxies an external host', () => {
    expect(shouldProxyForSpeed('https://lh3.googleusercontent.com/a/photo.jpg', 5_000_000)).toBe(
      false,
    );
    expect(shouldProxyForSpeed('not a url', 5_000_000)).toBe(false);
  });

  it('encodes the source URL once and never wraps an already-proxied URL', () => {
    const once = proxiedUrl('https://i.ibb.co/abc/big.jpg?x=1');
    expect(once).toBe('/media/i?u=https%3A%2F%2Fi.ibb.co%2Fabc%2Fbig.jpg%3Fx%3D1');
    expect(proxiedUrl(once)).toBe(once);
    expect(proxiedUrl('')).toBe('');
  });
});

describe('dominant-colour placeholder validation', () => {
  it('accepts 3-digit and 6-digit hex colours and rejects arbitrary CSS', () => {
    expect(placeholderColour('#1b4332')).toBe('#1b4332');
    expect(placeholderColour('#fff')).toBe('#fff');
    expect(placeholderColour('url(javascript:alert(1))')).toBe('transparent');
    expect(placeholderColour(null)).toBe('transparent');
  });
});
