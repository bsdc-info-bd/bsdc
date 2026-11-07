import { describe, expect, it } from 'vitest';

import {
  IMAGE_WIDTHS,
  optimisedCloudinaryUrl,
  placeholderColour,
  proxiedUrl,
  responsiveSource,
  shouldProxyForSpeed,
  widthFor,
} from '@/lib/media/optimise';

/**
 * The picture-speed work, pinned.
 *
 * The claim being tested is a byte claim: a feed of twenty pictures used to
 * download twenty originals — several megabytes each — and now downloads twenty
 * properly sized ones. The tests below are the properties that make that true, and
 * the refusals that keep it from becoming a bug: a host that cannot be resized
 * must not be rewritten, and a transform that already exists must not be doubled.
 */

const CLOUD = 'https://res.cloudinary.com/dpemuwrpz/image/upload/v1712/bsdc/avatar/me.jpg';

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
    // A 5x ratio on a big slot would ask for 9600px of a picture nobody can see.
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

describe('a Cloudinary address', () => {
  it('gains a width, an automatic format and an automatic quality', () => {
    const url = optimisedCloudinaryUrl(CLOUD, 480);
    expect(url).toContain('/upload/c_fill,g_auto,w_480,f_auto,q_auto/');
    expect(url).toContain('bsdc/avatar/me.jpg');
  });

  it('keeps the rest of the address exactly as it was', () => {
    const withQuery = `${CLOUD}?v=7`;
    const url = optimisedCloudinaryUrl(withQuery, 256);
    expect(url.endsWith('?v=7')).toBe(true);
    expect(url).toContain('dpemuwrpz');
  });

  it('is left alone when it already carries a transform', () => {
    const thumb =
      'https://res.cloudinary.com/dpemuwrpz/image/upload/c_fill,w_256,h_256,f_auto/x.jpg';
    expect(optimisedCloudinaryUrl(thumb, 960)).toBe(thumb);
    // A comma-separated transform with no `c_` prefix is still a transform.
    const other = 'https://res.cloudinary.com/dpemuwrpz/image/upload/w_400,q_80/x.jpg';
    expect(optimisedCloudinaryUrl(other, 960)).toBe(other);
  });

  it('is left alone on any other host, because it is not ours to rewrite', () => {
    for (const url of [
      'https://i.ibb.co/abc/photo.jpg',
      'https://lh3.googleusercontent.com/a/photo.jpg',
      'https://avatars.githubusercontent.com/u/1',
      'https://res.cloudinary.com.evil.test/image/upload/x.jpg',
    ]) {
      expect(optimisedCloudinaryUrl(url, 480)).toBe(url);
    }
  });

  it('is left alone when it is not an image upload at all', () => {
    const raw = 'https://res.cloudinary.com/dpemuwrpz/raw/upload/bsdc/report.pdf';
    expect(optimisedCloudinaryUrl(raw, 480)).toBe(raw);
    const video = 'https://res.cloudinary.com/dpemuwrpz/video/upload/bsdc/clip.mp4';
    expect(optimisedCloudinaryUrl(video, 480)).toBe(video);
  });

  it('returns nonsense unchanged rather than throwing in a render', () => {
    expect(optimisedCloudinaryUrl('', 480)).toBe('');
    expect(optimisedCloudinaryUrl('not a url', 480)).toBe('not a url');
  });
});

describe('the srcset a browser uses to choose before it downloads', () => {
  it('lists real widths up to twice the slot, so a 3x screen has a candidate', () => {
    const source = responsiveSource(CLOUD, 360);
    expect(source.srcset).toContain(' 384w');
    expect(source.srcset).toContain(' 960w');
    expect(source.srcset).toContain(' 1280w');
    expect(source.srcset).not.toContain(' 1920w');
  });

  it('states a sizes attribute that matches the slot, or the browser picks wrongly', () => {
    expect(responsiveSource(CLOUD, 360).sizes).toContain('360px');
    expect(responsiveSource(CLOUD, 1200).sizes).toContain('640px');
  });

  it('is empty for a host that cannot be resized, rather than fiction', () => {
    const source = responsiveSource('https://i.ibb.co/abc/photo.jpg', 360);
    expect(source.srcset).toBe('');
    expect(source.sizes).toBe('');
    expect(source.src).toBe('https://i.ibb.co/abc/photo.jpg');
  });

  it('never puts a wider candidate than the slot can show', () => {
    // Three times a 200px slot is 640: beyond that nothing can display the extra
    // pixels, and asking for them is a download for nobody.
    const source = responsiveSource(CLOUD, 200, { devicePixelRatio: 1 });
    const widths = [...source.srcset.matchAll(/ (\d+)w/g)].map((match) => Number(match[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) expect(width).toBeLessThanOrEqual(640);
  });
});

describe('when a picture goes through this origin instead', () => {
  it('proxies a large ImgBB picture, so the edge caches it once for everybody', () => {
    expect(shouldProxyForSpeed('https://i.ibb.co/abc/big.jpg', 3_000_000)).toBe(true);
  });

  it('leaves a small one alone, where the extra hop costs more than it saves', () => {
    expect(shouldProxyForSpeed('https://i.ibb.co/abc/small.jpg', 40_000)).toBe(false);
  });

  it('leaves an unknown size alone, because guessing is how a fast path becomes slow', () => {
    expect(shouldProxyForSpeed('https://i.ibb.co/abc/unknown.jpg', null)).toBe(false);
  });

  it('never proxies a host it does not own the credentials for', () => {
    expect(
      shouldProxyForSpeed('https://res.cloudinary.com/dpemuwrpz/image/upload/x.jpg', 5_000_000),
    ).toBe(false);
    expect(shouldProxyForSpeed('https://lh3.googleusercontent.com/a/x.jpg', 5_000_000)).toBe(false);
  });

  it('builds an address that survives every character a URL can contain', () => {
    const url = 'https://i.ibb.co/abc/a photo.jpg?x=1&y=2';
    const proxied = proxiedUrl(url);
    expect(proxied.startsWith('/media/i?u=')).toBe(true);
    expect(new URL(proxied, 'https://www.bsdc.info.bd').searchParams.get('u')).toBe(url);
  });

  it('does not proxy an address it already proxied', () => {
    const once = proxiedUrl('https://i.ibb.co/abc/x.jpg');
    expect(proxiedUrl(once)).toBe(once);
  });
});

describe('the colour a card paints while it waits', () => {
  it('accepts the two hex forms a row can carry', () => {
    expect(placeholderColour('#1B4332')).toBe('#1B4332');
    expect(placeholderColour('#abc')).toBe('#abc');
    expect(placeholderColour('  #fff  ')).toBe('#fff');
  });

  it('refuses anything that is not a colour, because a database value is not CSS', () => {
    for (const value of [
      'red',
      'rgb(1,2,3)',
      '#12345',
      'url(https://evil.test/x.png)',
      'expression(alert(1))',
      '#fff; background-image: url(x)',
      '',
      null,
      undefined,
    ]) {
      expect(placeholderColour(value)).toBe('transparent');
    }
  });
});
