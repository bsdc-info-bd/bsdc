import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { healMediaCaches, healMediaCachesOnce, IMAGE_CACHE_VERSION } from './pwa';

/**
 * The repair that fixes a browser which is *already* poisoned.
 *
 * A member who reported "images load, then stop, and clearing the cache brings
 * them back" has a cache full of bodies that are not pictures. Whatever the new
 * worker does, that cache is still there until something deletes it — and the
 * worker that would is waiting behind an update prompt. These checks prove the
 * page deletes it, once per build, and leaves everything it does not own alone.
 */

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

describe('healing a cache left by an older worker', () => {
  it('deletes every picture cache that is not the current one', async () => {
    const { deleted } = installCaches(['bsdc-images-v3', 'bsdc-images-v1', IMAGE_CACHE_VERSION]);
    const healed = await healMediaCaches();
    expect(healed).toEqual(['bsdc-images-v3', 'bsdc-images-v1']);
    expect(deleted).toEqual(['bsdc-images-v3', 'bsdc-images-v1']);
  });

  it('keeps the current cache, which is the one that works', async () => {
    const { deleted } = installCaches([IMAGE_CACHE_VERSION]);
    expect(await healMediaCaches()).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('never touches a cache that belongs to another application on the origin', async () => {
    const { deleted } = installCaches(['some-other-app-v1', 'bsdc-fonts-v1', 'bsdc-images-v9']);
    await healMediaCaches();
    expect(deleted).toEqual(['bsdc-images-v9']);
  });

  it('does nothing and says nothing when storage is forbidden', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await healMediaCaches()).toEqual([]);
  });

  it('survives a storage implementation that throws', async () => {
    vi.stubGlobal('caches', {
      keys: () => Promise.reject(new Error('SecurityError')),
      delete: () => Promise.resolve(true),
    });
    expect(await healMediaCaches()).toEqual([]);
  });
});

describe('running the repair once per build', () => {
  it('heals on the first load and records that it did', async () => {
    const { deleted } = installCaches(['bsdc-images-v2']);
    await healMediaCachesOnce();
    expect(deleted).toEqual(['bsdc-images-v2']);
    expect(window.localStorage.getItem('bsdc.media.healed')).toBe(IMAGE_CACHE_VERSION);
  });

  it('does not scan storage again on the next load of the same build', async () => {
    installCaches(['bsdc-images-v3']);
    window.localStorage.setItem('bsdc.media.healed', IMAGE_CACHE_VERSION);
    const { deleted } = installCaches(['bsdc-images-v2']);
    await healMediaCachesOnce();
    expect(deleted).toEqual([]);
  });

  it('heals again after a new build, because the marker no longer matches', async () => {
    window.localStorage.setItem('bsdc.media.healed', 'bsdc-images-v3');
    const { deleted } = installCaches(['bsdc-images-v3']);
    await healMediaCachesOnce();
    expect(deleted).toEqual(['bsdc-images-v3']);
  });

  it('still heals when the marker cannot be read, as in a locked-down browser', async () => {
    const { deleted } = installCaches(['bsdc-images-v2']);
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    try {
      await healMediaCachesOnce();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: original });
    }
    expect(deleted).toEqual(['bsdc-images-v2']);
  });
});
