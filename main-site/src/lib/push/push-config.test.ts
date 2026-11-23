import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    siteUrl: 'https://www.bsdc.info.bd',
    firebase: {
      apiKey: 'AIza-key',
      authDomain: 'bsdc-bd.firebaseapp.com',
      projectId: 'bsdc-bd',
      storageBucket: '',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abcd',
      databaseURL: '',
    },
    supabase: { url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x' },
    push: { vapidPublicKey: '', webPushPublicKey: '', transport: '' },
    oneSignalAppId: '',
  },
  isConfigured: { firebase: true, supabase: true, push: true },
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return state.env;
  },
  get isConfigured() {
    return state.isConfigured;
  },
}));

const fcmSupport = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const workerTransports = vi.hoisted(() => vi.fn().mockResolvedValue(['webpush']));
const readyServiceWorker = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('./fcm', () => ({ supportsFcmBrowser: fcmSupport }));
vi.mock('./ready-worker', () => ({ workerTransports, readyServiceWorker }));

import {
  clearTransportCooldowns,
  markTransportUnavailable,
  resolvePushConfig,
  resolvePushConfigWith,
} from './push-config';
import { transportCooldownKey } from './transport';

/** 65 bytes base64url: the shape of a P-256 public key. */
const SITE = 'A'.repeat(87);
const FIREBASE = 'B'.repeat(87);

const NOW = 1_700_000_000_000;

function deps(over: Record<string, unknown> = {}) {
  const marks: Record<string, string> = {};
  return {
    deps: {
      firebaseSupported: vi.fn().mockResolvedValue(true),
      workerTransports: vi.fn().mockResolvedValue(['webpush', 'fcm']),
      fetchSiteKey: vi.fn().mockResolvedValue(SITE),
      cooldownRead: (key: string) => marks[key] ?? null,
      now: NOW,
      ...over,
    },
    marks,
  };
}

function envFor(over: Partial<(typeof state.env)['push']> = {}) {
  state.env.push = { vapidPublicKey: '', webPushPublicKey: '', transport: '', ...over };
}

beforeEach(() => {
  state.isConfigured = { firebase: true, supabase: true, push: true };
  fcmSupport.mockReset();
  fcmSupport.mockResolvedValue(true);
  workerTransports.mockReset();
  workerTransports.mockResolvedValue(['webpush']);
  readyServiceWorker.mockReset();
  readyServiceWorker.mockResolvedValue({});
  envFor({ webPushPublicKey: SITE });
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resolvePushConfigWith', () => {
  it('takes the site’s own key from the bundle and asks the browser nothing', async () => {
    const { deps: d } = deps();
    const config = await resolvePushConfigWith(d);
    expect(config).toEqual({ mode: 'webpush', publicKey: SITE, reason: 'site-key' });
    expect(d.fetchSiteKey).not.toHaveBeenCalled();
  });

  it('asks the deployment for a key when the bundle was built without one', async () => {
    envFor({ webPushPublicKey: '' });
    const { deps: d } = deps({ fetchSiteKey: vi.fn().mockResolvedValue(`  ${SITE}  `) });
    expect(await resolvePushConfigWith(d)).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      reason: 'site-key',
    });
    expect(d.fetchSiteKey).toHaveBeenCalledTimes(1);
  });

  it('offers nothing when neither the bundle nor the deployment has a key', async () => {
    envFor({ webPushPublicKey: '' });
    state.isConfigured = { firebase: false, supabase: false, push: false };
    const { deps: d } = deps({ fetchSiteKey: vi.fn().mockResolvedValue(null) });
    expect(await resolvePushConfigWith(d)).toBeNull();
  });

  it('survives a deployment that cannot answer, which is a page load not an outage', async () => {
    envFor({ webPushPublicKey: '' });
    state.isConfigured = { firebase: false, supabase: false, push: false };
    const { deps: d } = deps({
      fetchSiteKey: vi.fn().mockRejectedValue(new TypeError('network down')),
    });
    expect(await resolvePushConfigWith(d)).toBeNull();
  });

  it('never downloads the Firebase SDK for a deployment that asked for web push', async () => {
    envFor({ webPushPublicKey: SITE, vapidPublicKey: FIREBASE, transport: 'webpush' });
    const { deps: d } = deps();
    expect(await resolvePushConfigWith(d)).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      reason: 'requested-webpush',
    });
    expect(d.firebaseSupported).not.toHaveBeenCalled();
    expect(d.workerTransports).not.toHaveBeenCalled();
  });

  it('uses Firebase only when it is configured, supported and heard by the worker', async () => {
    envFor({ webPushPublicKey: '', vapidPublicKey: FIREBASE, transport: 'fcm' });
    const { deps: d } = deps({ fetchSiteKey: vi.fn().mockResolvedValue(null) });
    expect(await resolvePushConfigWith(d)).toEqual({
      mode: 'fcm',
      publicKey: FIREBASE,
      reason: 'requested-fcm',
    });

    // Same deployment, worker compiled without the Firebase code: declined, and the
    // member still gets push through the key the endpoint does have.
    d.workerTransports.mockResolvedValueOnce(['webpush']);
    envFor({ webPushPublicKey: SITE, vapidPublicKey: FIREBASE, transport: 'fcm' });
    expect(await resolvePushConfigWith(d)).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      reason: 'requested-fcm-deaf-worker',
    });
  });

  it('does not call Firebase a browser without push would refuse anyway', async () => {
    envFor({ webPushPublicKey: '', vapidPublicKey: FIREBASE });
    const { deps: d } = deps({
      fetchSiteKey: vi.fn().mockResolvedValue(null),
      firebaseSupported: vi.fn().mockResolvedValue(false),
    });
    expect(await resolvePushConfigWith(d)).toBeNull();
    expect(d.workerTransports).not.toHaveBeenCalled();
  });

  it('steps around a transport this browser was just refused by', async () => {
    envFor({ webPushPublicKey: '', vapidPublicKey: FIREBASE, transport: 'fcm' });
    const { deps: d, marks } = deps({ fetchSiteKey: vi.fn().mockResolvedValue(SITE) });
    expect((await resolvePushConfigWith(d))?.mode).toBe('fcm');

    marks[transportCooldownKey('fcm')] = String(NOW - 1000);
    expect(await resolvePushConfigWith(d)).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      // Not `requested-fcm-unconfigured`: Firebase is configured here, it simply
      // gave up in this browser, and support reads the difference.
      reason: 'fallback-site-key',
    });
  });

  it('keeps the only transport it has when that one is marked, rather than offering nothing', async () => {
    const { deps: d, marks } = deps();
    marks[transportCooldownKey('webpush')] = String(NOW - 1000);
    expect(await resolvePushConfigWith(d)).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      reason: 'site-key',
    });
  });

  it('counts a mark from another tab as a mark', async () => {
    envFor({ webPushPublicKey: '', vapidPublicKey: FIREBASE, transport: 'fcm' });
    const { deps: d } = deps({
      fetchSiteKey: vi.fn().mockResolvedValue(SITE),
      cooldownRead: () => String(NOW - 1000),
    });
    expect(await resolvePushConfigWith(d)).toMatchObject({ mode: 'webpush' });
    // …and the other transport cannot be rescued by the same read function, which
    // is why the mark is keyed per transport.
    envFor({ webPushPublicKey: SITE, vapidPublicKey: '', transport: 'fcm' });
    expect(await resolvePushConfigWith(d)).toMatchObject({ reason: 'requested-fcm-unconfigured' });
  });
});

describe('cooldown marks in storage', () => {
  it('writes and clears one mark per transport', () => {
    markTransportUnavailable('fcm');
    expect(window.localStorage.getItem(transportCooldownKey('fcm'))).toMatch(/^\d+$/);
    expect(window.localStorage.getItem(transportCooldownKey('webpush'))).toBeNull();

    clearTransportCooldowns();
    expect(window.localStorage.getItem(transportCooldownKey('fcm'))).toBeNull();
  });

  it('survives a browser that refuses storage outright', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => markTransportUnavailable('fcm')).not.toThrow();
    expect(() => clearTransportCooldowns()).not.toThrow();
  });
});

describe('resolvePushConfig against a live-looking page', () => {
  it('reads the key from the edge endpoint when the build has none', async () => {
    envFor({ webPushPublicKey: '' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ enabled: true, vapidPublicKey: SITE }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolvePushConfig()).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      reason: 'site-key',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/config',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('falls through to the database when the endpoint is not there', async () => {
    envFor({ webPushPublicKey: '' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    const db = vi.fn().mockResolvedValue(SITE);
    vi.doMock('./push-repository', () => ({ fetchPublicPushConfigFromDb: db }));
    const fresh = await import('./push-config');
    expect(await fresh.resolvePushConfig()).toEqual({
      mode: 'webpush',
      publicKey: SITE,
      reason: 'site-key',
    });
    expect(db).toHaveBeenCalled();
    vi.doUnmock('./push-repository');
  });
});
