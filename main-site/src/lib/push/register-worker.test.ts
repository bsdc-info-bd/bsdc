import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupLegacyOfflineCaches } from './register-worker';

interface FakeCaches {
  keys: () => Promise<string[]>;
  delete: (name: string) => Promise<boolean>;
}

function installCaches(names: string[]): { deleted: string[] } {
  const deleted: string[] = [];
  const fake: FakeCaches = {
    keys: () => Promise.resolve([...names]),
    delete: (name: string) => {
      deleted.push(name);
      return Promise.resolve(true);
    },
  };
  vi.stubGlobal('caches', fake);
  return { deleted };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('legacy offline cache cleanup', () => {
  it('deletes leftover Workbox, picture, and font caches while sparing unrelated caches', async () => {
    window.localStorage.setItem('bsdc.media.healed', 'bsdc-images-v6');
    const { deleted } = installCaches([
      'bsdc-images-v6',
      'bsdc-images-v5',
      'bsdc-fonts-v2',
      'workbox-precache-v2-https://www.bsdc.info.bd/',
      'some-other-app-v1',
    ]);

    const removed = await cleanupLegacyOfflineCaches();

    expect(removed).toEqual([
      'bsdc-images-v6',
      'bsdc-images-v5',
      'bsdc-fonts-v2',
      'workbox-precache-v2-https://www.bsdc.info.bd/',
    ]);
    expect(deleted).toEqual(removed);
    expect(window.localStorage.getItem('bsdc.media.healed')).toBeNull();
  });

  it('survives restricted CacheStorage and localStorage environments', async () => {
    vi.stubGlobal('caches', {
      keys: () => Promise.reject(new Error('SecurityError')),
      delete: () => Promise.resolve(true),
    });
    expect(await cleanupLegacyOfflineCaches()).toEqual([]);

    vi.stubGlobal('caches', undefined);
    expect(await cleanupLegacyOfflineCaches()).toEqual([]);
  });
});
