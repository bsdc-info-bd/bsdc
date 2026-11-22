import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The manifest is part of the push system, not of the branding.
 *
 * iOS delivers a web push only to a web app the member added to the home screen, and
 * a page without a manifest cannot be added in that form at all — so a missing file
 * here silently turns off every iPhone while the settings page still says "on". Both
 * halves are checked: the document has to link a manifest, and the manifest it links
 * has to be the installable kind with icons the build actually writes.
 */
/** Paths are relative to `main-site/`, the way every file-reading test here does it. */
const read = (relative: string): string => readFileSync(relative, 'utf8');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: string;
  scope: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
  shortcuts: { name: string; url: string }[];
}

function manifest(): Manifest {
  return JSON.parse(read('public/manifest.webmanifest')) as Manifest;
}

describe('the installable web app', () => {
  it('is linked from the document head, where a browser looks first', () => {
    const html = read('index.html');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('name="mobile-web-app-capable"');
  });

  it('is valid JSON with the five fields installability is decided on', () => {
    const value = manifest();
    expect(value.display).toBe('standalone');
    expect(value.scope).toBe('/');
    expect(value.start_url).toBe('/');
    expect(value.id).toBe('https://www.bsdc.info.bd/');
    expect(value.name.length).toBeGreaterThan(10);
    expect(value.short_name).toBe('BSDC');
    expect(value.lang).toBe('bn');
    expect(value.dir).toBe('ltr');
    expect(value.description.length).toBeGreaterThan(40);
  });

  it('carries the icon set a home-screen tile and a notification both need', () => {
    const value = manifest();
    const sizes = value.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    // Android masks an `any` icon into a circle with its own shape, which clips the
    // shield; a `maskable` one is built for it. A tile without one looks broken.
    expect(value.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(value.theme_color.toLowerCase()).toBe('#1b4332');
  });

  it('names only icons the build writes, so the file cannot outlive its pictures', () => {
    const generator = read('scripts/generate-brand-assets.mjs');
    const pwaSizes = /const PWA_SIZES = \[([\d, ]+)]/.exec(generator)?.[1] ?? '';
    const written = new Set(pwaSizes.split(',').map((size) => `${size.trim()}x${size.trim()}`));
    expect(written.size).toBeGreaterThan(0);

    for (const icon of manifest().icons) {
      expect(icon.src.startsWith('/icons/')).toBe(true);
      if (icon.purpose === 'maskable') {
        expect(generator).toContain(`icons/maskable-${icon.sizes.split('x')[0]}.png`);
      } else {
        expect(written.has(icon.sizes), `${icon.src} is not generated`).toBe(true);
      }
    }
  });

  it('points its shortcuts at routes that exist', () => {
    const routes = read('src/lib/seo/app-routes.ts');
    for (const shortcut of manifest().shortcuts) {
      expect(shortcut.url.startsWith('/')).toBe(true);
      expect(routes).toContain(`'${shortcut.url}'`);
    }
  });
});
