import { describe, expect, it } from 'vitest';
import { getFirebaseConfig, isFirebaseConfigured } from '@/lib/env';

describe('env', () => {
  it('degrades gracefully when Firebase env vars are absent', () => {
    // CI builds run without a .env; the app must build and boot anyway.
    // (jsdom test env has no VITE_ vars defined.)
    if (import.meta.env.VITE_FIREBASE_API_KEY) {
      expect(isFirebaseConfigured).toBe(true);
      expect(getFirebaseConfig()).not.toBeNull();
    } else {
      expect(isFirebaseConfigured).toBe(false);
      expect(getFirebaseConfig()).toBeNull();
    }
  });

  it('exposes no server-side secret surface', () => {
    // Guard against someone adding a VITE_ secret later: the env module
    // must only ever export the client-safe config fields.
    const config = getFirebaseConfig();
    if (config) {
      const keys = Object.keys(config);
      expect(keys).toEqual(expect.arrayContaining(['apiKey', 'authDomain', 'projectId', 'appId']));
      expect(keys).not.toContain('apiSecret');
    }
  });
});
