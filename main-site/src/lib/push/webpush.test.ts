import { describe, expect, it } from 'vitest';

import {
  PUSH_TTL_SECONDS,
  VAPID_MAX_TTL_SECONDS,
  endpointOrigin,
  isDeadEndpointStatus,
  signVapidJwt,
  uint8ArrayToUrlBase64,
  urlBase64ToUint8Array,
  vapidAuthorizationHeader,
  vapidJwtParts,
  vapidSubject,
} from './webpush';

const encoder = new TextEncoder();

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(urlBase64ToUint8Array(part))) as Record<
    string,
    unknown
  >;
}

async function keypair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, privateKey: uint8ArrayToUrlBase64(pkcs8), publicKey: uint8ArrayToUrlBase64(raw) };
}

describe('base64url, the alphabet Web Push uses', () => {
  it('round-trips bytes that would break plain base64', () => {
    for (const bytes of [
      new Uint8Array([0]),
      new Uint8Array([251, 255, 128]),
      new Uint8Array([62, 63, 251, 255, 0, 1]),
      crypto.getRandomValues(new Uint8Array(65)),
    ]) {
      expect(uint8ArrayToUrlBase64(bytes)).not.toContain('=');
      expect(uint8ArrayToUrlBase64(bytes)).not.toMatch(/[+/]/);
      expect(urlBase64ToUint8Array(uint8ArrayToUrlBase64(bytes))).toEqual(bytes);
    }
  });

  it('reads a key that arrives with padding and one that does not', () => {
    expect(urlBase64ToUint8Array('AQID')).toEqual(new Uint8Array([1, 2, 3]));
    expect(urlBase64ToUint8Array('AQIDBA==')).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(urlBase64ToUint8Array('-_8')).toEqual(new Uint8Array([251, 255]));
  });
});

describe('the audience', () => {
  it('is the origin of the push service, so one key signs for each', () => {
    expect(endpointOrigin('https://fcm.googleapis.com/fcm/send/abc-123')).toBe(
      'https://fcm.googleapis.com',
    );
    expect(endpointOrigin('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(
      'https://updates.push.services.mozilla.com',
    );
  });

  it('refuses an endpoint it should not send to', () => {
    expect(endpointOrigin('http://fcm.googleapis.com/x')).toBeNull();
    expect(endpointOrigin('not a url')).toBeNull();
    expect(endpointOrigin('')).toBeNull();
  });
});

describe('the token', () => {
  it('has the three claims the specification asks for', () => {
    const parts = vapidJwtParts({
      aud: 'https://fcm.googleapis.com',
      exp: 1_800_000_000,
      sub: 'mailto:admin@bsdc.info.bd',
    });
    expect(decodePart(parts.header)).toEqual({ alg: 'ES256', typ: 'JWT' });
    expect(decodePart(parts.payload)).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_800_000_000,
      sub: 'mailto:admin@bsdc.info.bd',
    });
  });

  it('signs something a push service would accept', async () => {
    const { pair, privateKey, publicKey } = await keypair();
    const now = 1_700_000_000_000;
    const jwt = await signVapidJwt({
      privateKey,
      publicKey,
      audience: 'https://fcm.googleapis.com',
      subject: 'mailto:admin@bsdc.info.bd',
      expiresInSeconds: 3600,
      now,
    });
    expect(jwt).not.toBeNull();
    const [header, payload, signature] = (jwt ?? '').split('.');
    expect(signature).toBeTruthy();

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      urlBase64ToUint8Array(signature ?? ''),
      encoder.encode(`${header}.${payload}`),
    );
    expect(valid).toBe(true);

    const claims = decodePart(payload ?? '');
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:admin@bsdc.info.bd');
    expect(claims.exp).toBe(Math.floor(now / 1000) + 3600);
    // The raw r||s form, not DER: 64 bytes and no more.
    expect(urlBase64ToUint8Array(signature ?? '').length).toBe(64);
  });

  it('will not sign with a lifetime a push service would reject', async () => {
    const { privateKey, publicKey } = await keypair();
    const now = 1_700_000_000_000;
    const jwt = await signVapidJwt({
      privateKey,
      publicKey,
      audience: 'https://fcm.googleapis.com',
      subject: 'mailto:admin@bsdc.info.bd',
      expiresInSeconds: 999_999_999,
      now,
    });
    const claims = decodePart((jwt ?? '').split('.')[1] ?? '');
    expect(claims.exp).toBe(Math.floor(now / 1000) + VAPID_MAX_TTL_SECONDS);
  });

  it('says nothing rather than sending an unsigned request', async () => {
    const jwt = await signVapidJwt({
      privateKey: 'this-is-not-a-key',
      publicKey: 'x',
      audience: 'https://fcm.googleapis.com',
      subject: 'mailto:admin@bsdc.info.bd',
    });
    expect(jwt).toBeNull();
  });

  it('carries both halves in one header', () => {
    expect(vapidAuthorizationHeader('a.b.c', 'public-key')).toBe('vapid t=a.b.c, k=public-key');
  });

  it('writes the subject as an address a push service can complain to', () => {
    expect(vapidSubject('admin@bsdc.info.bd')).toBe('mailto:admin@bsdc.info.bd');
    expect(vapidSubject('mailto:rrc@bsdc.info.bd')).toBe('mailto:rrc@bsdc.info.bd');
    expect(vapidSubject('  ')).toBe('mailto:admin@bsdc.info.bd');
  });
});

describe('what a status means', () => {
  it('retires a subscription the service no longer recognises', () => {
    expect(isDeadEndpointStatus(404)).toBe(true);
    expect(isDeadEndpointStatus(410)).toBe(true);
  });

  it('does not retire one that merely refused or throttled', () => {
    expect(isDeadEndpointStatus(201)).toBe(false);
    expect(isDeadEndpointStatus(429)).toBe(false);
    expect(isDeadEndpointStatus(500)).toBe(false);
    expect(isDeadEndpointStatus(400)).toBe(false);
  });

  it('keeps trying for a day', () => {
    expect(PUSH_TTL_SECONDS).toBe(86_400);
  });
});
