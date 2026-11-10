import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FONT_CACHE_NAME,
  IMAGE_CACHE_NAME,
  isManagedCacheName,
  isStaleFontCacheName,
  isStaleImageCacheName,
} from './cache-names';

/**
 * Two constants that must be equal, and the bug that proved it.
 *
 * `src/sw.ts` named the picture cache `bsdc-images-v5`; `src/pwa.ts` believed it
 * was `bsdc-images-v4` and deleted every picture cache that did not match. So
 * the page deleted the running worker's live cache — and wherever
 * `localStorage` was blocked, it deleted it on every single load. Pictures were
 * fetched twice, the cache never stayed warm, and the "repair" was the damage.
 *
 * A test cannot make two literals agree. It can make sure there are not two.
 */

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

describe('the picture cache has one name', () => {
  it('is versioned, so a bump abandons what an older worker stored', () => {
    expect(IMAGE_CACHE_NAME).toMatch(/^bsdc-images-v\d+$/);
    expect(FONT_CACHE_NAME).toMatch(/^bsdc-fonts-v\d+$/);
  });

  it('treats an older picture cache as stale and the current one as live', () => {
    expect(isStaleImageCacheName(IMAGE_CACHE_NAME)).toBe(false);
    expect(isStaleImageCacheName('bsdc-images-v1')).toBe(true);
    expect(isStaleImageCacheName('bsdc-images-v4')).toBe(true);
  });

  it('treats a font cache by its own name, and only that name', () => {
    expect(isStaleFontCacheName(FONT_CACHE_NAME)).toBe(false);
    expect(isStaleFontCacheName('bsdc-fonts-v1')).toBe(true);
    expect(isStaleFontCacheName('bsdc-images-v1')).toBe(false);
  });

  it('claims only its own prefixes, never another application on the origin', () => {
    expect(isManagedCacheName('bsdc-images-v9')).toBe(true);
    expect(isManagedCacheName('bsdc-fonts-v9')).toBe(true);
    expect(isManagedCacheName('some-other-app-v1')).toBe(false);
    expect(isManagedCacheName('workbox-precache-v2')).toBe(false);
  });
});

describe('neither the worker nor the page hard-codes a cache name', () => {
  const worker = source('../../sw.ts');
  const page = source('../../pwa.ts');

  it('the worker imports the name instead of writing one', () => {
    expect(worker).toContain('IMAGE_CACHE_NAME');
    expect(worker).not.toMatch(/['"]bsdc-images-v\d+['"]/);
    expect(worker).not.toMatch(/['"]bsdc-fonts-v\d+['"]/);
  });

  it('the page imports the same name instead of writing one', () => {
    expect(page).toContain('IMAGE_CACHE_NAME');
    expect(page).not.toMatch(/['"]bsdc-images-v\d+['"]/);
  });
});
