import { describe, expect, it } from 'vitest';

import {
  BROKEN_TRANSPORT_COOLDOWN_MS,
  chooseTransport,
  firebaseWebConfigReady,
  isVapidPublicKey,
  transportCooldownKey,
  transportInCooldown,
  type TransportInput,
} from './transport';

/** 65 bytes base64url is 87 characters, which is what a P-256 point encodes to. */
const KEY = 'A'.repeat(87);
const OTHER = 'B'.repeat(87);

const READY = {
  apiKey: 'AIza-key',
  projectId: 'bsdc-bd',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcd',
};

function input(over: Partial<TransportInput> = {}): TransportInput {
  return {
    siteKey: '',
    firebaseKey: '',
    firebaseReady: false,
    firebaseSupported: false,
    firebaseWorker: false,
    requested: '',
    ...over,
  };
}

describe('VAPID key shape', () => {
  it('accepts a base64url P-256 point, with the whitespace a console copy leaves behind', () => {
    expect(isVapidPublicKey(KEY)).toBe(true);
    expect(isVapidPublicKey(`  ${KEY}\n`)).toBe(true);
  });

  it('refuses what cannot be a public key, because the browser refuses it worse', () => {
    // A key truncated in a copy-paste is the failure this catches; `subscribe`
    // answers it with a `DataError` that mentions neither the key nor its length.
    expect(isVapidPublicKey('A'.repeat(79))).toBe(false);
    expect(isVapidPublicKey('')).toBe(false);
    expect(isVapidPublicKey('   ')).toBe(false);
    expect(isVapidPublicKey(`${KEY}====`)).toBe(false);
    expect(isVapidPublicKey('https://www.bsdc.info.bd')).toBe(false);
    expect(isVapidPublicKey('A'.repeat(141))).toBe(false);
  });
});

describe('Firebase web config completeness', () => {
  it('needs all four values getToken sends, not the two isConfigured checks', () => {
    expect(firebaseWebConfigReady(READY)).toBe(true);
    for (const missing of Object.keys(READY)) {
      expect(firebaseWebConfigReady({ ...READY, [missing]: '  ' })).toBe(false);
    }
  });
});

describe('transport choice', () => {
  it('prefers the site’s own key even where FCM could work', () => {
    // The whole point: one transport per browser, and it is the one this site's
    // worker and sender both implement. Preferring FCM here is what produced a
    // token this deployment's worker could not hear.
    expect(
      chooseTransport(
        input({
          siteKey: KEY,
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          firebaseWorker: true,
        }),
      ),
    ).toEqual({ transport: 'webpush', reason: 'site-key' });
  });

  it('falls back to FCM only when there is no key of our own and the worker can decode it', () => {
    expect(
      chooseTransport(
        input({
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          firebaseWorker: true,
        }),
      ),
    ).toEqual({ transport: 'fcm', reason: 'fcm-only' });

    // A worker without the Firebase code cannot read an FCM frame at all, so a
    // subscription through it would be silent forever.
    expect(
      chooseTransport(
        input({
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          firebaseWorker: false,
        }),
      ),
    ).toEqual({ transport: null, reason: 'no-key' });
  });

  it('offers nothing when neither transport can work', () => {
    expect(chooseTransport(input())).toEqual({ transport: null, reason: 'no-key' });
    expect(
      chooseTransport(input({ siteKey: 'short', firebaseKey: 'short', firebaseReady: true })),
    ).toEqual({ transport: null, reason: 'no-key' });
  });

  it('honours an explicit web push request and does not go looking at Firebase', () => {
    expect(chooseTransport(input({ siteKey: KEY, requested: 'webpush' }))).toEqual({
      transport: 'webpush',
      reason: 'requested-webpush',
    });
    // Asked for by name and unavailable: the answer is still "no", so a half-set-up
    // FCM never quietly replaces the transport an operator chose.
    expect(
      chooseTransport(input({ requested: 'webpush', firebaseKey: OTHER, firebaseReady: true })),
    ).toEqual({ transport: null, reason: 'no-key' });
  });

  it('honours an explicit FCM request only when the worker can hear it', () => {
    expect(
      chooseTransport(
        input({
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          firebaseWorker: true,
          requested: 'fcm',
        }),
      ),
    ).toEqual({ transport: 'fcm', reason: 'requested-fcm' });

    // Declined, but the member still gets notifications and support still gets the
    // reason: the transport is what works, the code is what is wrong.
    expect(
      chooseTransport(
        input({
          siteKey: KEY,
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          firebaseWorker: false,
          requested: 'fcm',
        }),
      ),
    ).toEqual({ transport: 'webpush', reason: 'requested-fcm-deaf-worker' });

    expect(
      chooseTransport(
        input({
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          requested: 'fcm',
        }),
      ),
    ).toEqual({ transport: null, reason: 'requested-fcm-deaf-worker' });

    expect(
      chooseTransport(input({ siteKey: KEY, requested: 'fcm', firebaseReady: false })),
    ).toEqual({ transport: 'webpush', reason: 'requested-fcm-unconfigured' });

    // The certificate uploaded to Firebase, or its shape in the environment, is
    // the usual missing half — and it is the message the member used to be shown.
    expect(
      chooseTransport(
        input({ siteKey: KEY, requested: 'fcm', firebaseReady: true, firebaseSupported: true }),
      ),
    ).toEqual({ transport: 'webpush', reason: 'requested-fcm-unconfigured' });
  });

  it('treats an unrecognised request as no request, so a typo cannot disable push', () => {
    expect(chooseTransport(input({ siteKey: KEY, requested: 'FCM-websocket' }))).toEqual({
      transport: 'webpush',
      reason: 'site-key',
    });
  });

  it('will not re-offer a transport the browser has been refused by', () => {
    expect(chooseTransport(input({ siteKey: KEY, disabled: ['webpush'] }))).toEqual({
      transport: null,
      reason: 'no-key',
    });
    expect(
      chooseTransport(
        input({
          siteKey: KEY,
          firebaseKey: OTHER,
          firebaseReady: true,
          firebaseSupported: true,
          firebaseWorker: true,
          disabled: ['webpush'],
        }),
      ),
    ).toEqual({ transport: 'fcm', reason: 'fcm-only' });
  });
});

describe('cooldown marks', () => {
  const now = 1_700_000_000_000;
  const read = (marks: Record<string, string>) => (key: string) => marks[key] ?? null;

  it('refuses a transport for six hours and looks again after', () => {
    expect(BROKEN_TRANSPORT_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
    const marks: Record<string, string> = { [transportCooldownKey('fcm')]: String(now - 60_000) };
    expect(transportInCooldown('fcm', read(marks), now)).toBe(true);
    expect(transportInCooldown('webpush', read(marks), now)).toBe(false);

    const stale = { [transportCooldownKey('fcm')]: String(now - BROKEN_TRANSPORT_COOLDOWN_MS - 1) };
    expect(transportInCooldown('fcm', read(stale), now)).toBe(false);
  });

  it('ignores a mark it cannot read as a time, which is what another tab leaves behind', () => {
    expect(
      transportInCooldown('fcm', read({ 'bsdc.push.transport.fcm.unavailable': 'yes' }), now),
    ).toBe(false);
    expect(
      transportInCooldown('fcm', read({ 'bsdc.push.transport.fcm.unavailable': '-5' }), now),
    ).toBe(false);
    expect(transportInCooldown('fcm', () => null, now)).toBe(false);
  });

  it('keys marks per transport, so a broken Firebase cannot disable web push', () => {
    expect(transportCooldownKey('fcm')).toBe('bsdc.push.transport.fcm.unavailable');
    expect(transportCooldownKey('webpush')).toBe('bsdc.push.transport.webpush.unavailable');
  });
});
