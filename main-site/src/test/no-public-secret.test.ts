import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the one class of mistake that leaks a credential: a value that is a
 * secret being compiled into the public bundle. Vite inlines every VITE_* the
 * build can see, so the rule is simple to state and easy to break by accident.
 *
 * The ImgBB key is a secret. It belongs to the Pages Function (IMGBB_API_KEY),
 * which reads it at request time. The bundle must never name it, and the
 * browser must never be allowed to call the host directly.
 */

// Vitest runs from main-site/, the app root; the workflow lives one level up.
const read = (path: string) => readFileSync(path, 'utf8');

describe('no secret is compiled into the public bundle', () => {
  it('the client environment does not read the ImgBB key', () => {
    expect(read('src/lib/env.ts')).not.toMatch(/VITE_IMGBB/);
  });

  it('the deploy build neither requires nor passes the ImgBB key', () => {
    const deploy = read('../.github/workflows/deploy.yml');
    // A comment may name the Pages variable; no step may read the ImgBB secret.
    expect(deploy).not.toMatch(/VITE_IMGBB/);
    expect(deploy).not.toMatch(/secrets\.[A-Z_]*IMGBB/);
    expect(deploy).not.toMatch(/BSDC_REQUIRED_ENV[^\n]*IMGBB/);
  });

  it('the browser may not call ImgBB, so the policy does not allow it', () => {
    const csp =
      read('public/_headers')
        .split('\n')
        .find((line) => line.includes('Content-Security-Policy:')) ?? '';
    const connect = csp.split(';').find((part) => part.trim().startsWith('connect-src ')) ?? '';
    expect(connect.length).toBeGreaterThan(0);
    expect(connect).not.toContain('api.imgbb.com');
  });

  it('the client has no direct ImgBB transport', () => {
    expect(read('src/lib/storage/upload.ts')).not.toMatch(/api\.imgbb\.com/);
  });
});
