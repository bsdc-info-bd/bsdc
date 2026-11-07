import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  concatBytes,
  derToRaw,
  encryptPushPayload,
  endpointAudience,
  signVapidJwt,
  uncompressedPoint,
  vapidHeader,
} from './crypto';

/**
 * A push that says something only works if the bytes are exactly what RFC 8291
 * describes. These checks decrypt what this module produced, the way a browser's
 * push service would, rather than asserting on the ciphertext — a test that
 * asserts on bytes only proves the bytes did not change, not that they are right.
 */

const encoder = new TextEncoder();

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function makeSubscriptionKeys(): Promise<{
  p256dh: string;
  auth: string;
  privateKey: CryptoKey;
}> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return {
    p256dh: bytesToBase64Url(raw),
    auth: bytesToBase64Url(randomBytes(16)),
    privateKey: pair.privateKey,
  };
}

describe('web push encryption', () => {
  it('round-trips a message through the specification', async () => {
    const keys = await makeSubscriptionKeys();
    const plaintext = JSON.stringify({
      title: 'নতুন বার্তা',
      body: 'আপনার জন্য একটি বার্তা এসেছে',
    });
    const encrypted = await encryptPushPayload({
      p256dh: keys.p256dh,
      auth: keys.auth,
      plaintext,
    });

    // Parse the header the way a push service does.
    const salt = encrypted.body.slice(0, 16);
    const idLength = encrypted.body[20] ?? 0;
    const senderPublic = encrypted.body.slice(21, 21 + idLength);
    const ciphertext = encrypted.body.slice(21 + idLength);
    expect(idLength).toBe(65);
    expect(senderPublic[0]).toBe(0x04);

    // Rebuild the shared secret and the two HKDF outputs.
    const senderKey = await crypto.subtle.importKey(
      'raw',
      senderPublic as BufferSource,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'ECDH', public: senderKey } as unknown as EcdhKeyDeriveParams,
        keys.privateKey,
        256,
      ),
    );
    const ownPublic = base64UrlToBytes(keys.p256dh);

    const hkdf = async (
      saltBytes: Uint8Array,
      ikm: Uint8Array,
      info: Uint8Array,
      length: number,
    ) => {
      const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
      return new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info } as unknown as HkdfParams,
          key,
          length * 8,
        ),
      );
    };

    const ikm = await hkdf(
      base64UrlToBytes(keys.auth),
      shared,
      concatBytes(encoder.encode('WebPush: info\0'), ownPublic, senderPublic),
      32,
    );
    const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

    const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const sealed = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, tagLength: 128 },
        cekKey,
        ciphertext,
      ),
    );

    // The last byte is the record delimiter; what precedes it is the message.
    expect(sealed[sealed.length - 1]).toBe(0x02);
    expect(new TextDecoder().decode(sealed.slice(0, -1))).toBe(plaintext);
  });

  it('never produces the same ciphertext twice for the same message', async () => {
    const keys = await makeSubscriptionKeys();
    const first = await encryptPushPayload({
      p256dh: keys.p256dh,
      auth: keys.auth,
      plaintext: 'same',
    });
    const second = await encryptPushPayload({
      p256dh: keys.p256dh,
      auth: keys.auth,
      plaintext: 'same',
    });
    expect(bytesToBase64Url(first.body)).not.toBe(bytesToBase64Url(second.body));
  });

  it('refuses a key that is not a point on the curve', async () => {
    await expect(
      encryptPushPayload({
        p256dh: bytesToBase64Url(new Uint8Array(65)),
        auth: 'AAAAAAAAAAAAAAAAAAAAAA',
        plaintext: 'x',
      }),
    ).rejects.toThrow();
  });
});

describe('base64url', () => {
  it('round-trips without padding or unsafe characters', () => {
    const bytes = randomBytes(48);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it('accepts a padded and an unpadded value alike', () => {
    expect(Array.from(base64UrlToBytes('YQ'))).toEqual([0x61]);
    expect(Array.from(base64UrlToBytes('YQ=='))).toEqual([0x61]);
  });
});

describe('points and signatures', () => {
  it('normalises a raw 64-byte point to the uncompressed form', () => {
    const point = uncompressedPoint(new Uint8Array(64).fill(7));
    expect(point.byteLength).toBe(65);
    expect(point[0]).toBe(0x04);
  });

  it('leaves an already uncompressed point alone', () => {
    const point = new Uint8Array(65);
    point[0] = 0x04;
    expect(uncompressedPoint(point)).toBe(point);
  });

  it('converts a DER signature with a larger r into 64 raw bytes', () => {
    const r = new Uint8Array(33);
    r[0] = 0x00;
    r[1] = 0xff;
    const s = new Uint8Array(32).fill(0x11);
    const der = concatBytes(
      new Uint8Array([0x30, 0x00 + 2 + r.byteLength + 2 + s.byteLength, 0x02, r.byteLength]),
      r,
      new Uint8Array([0x02, s.byteLength]),
      s,
    );
    const raw = derToRaw(der);
    expect(raw.byteLength).toBe(64);
    expect(raw[0]).toBe(0xff);
    expect(raw[63]).toBe(0x11);
  });
});

describe('vapid signing', () => {
  it('signs a verifiable ES256 token with the right claims', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(
      (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer,
    );
    const publicRaw = new Uint8Array(
      (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
    );

    const token = await signVapidJwt({
      privateKey: bytesToBase64Url(pkcs8),
      publicKey: bytesToBase64Url(publicRaw),
      audience: 'https://fcm.googleapis.com',
      subject: 'mailto:admin@bsdc.info.bd',
      now: 1_700_000_000_000,
    });

    const [header, payload, signature] = token.split('.');
    expect(header).toBeTruthy();
    expect(
      JSON.parse(atob((header ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as unknown,
    ).toEqual({
      alg: 'ES256',
      typ: 'JWT',
    });

    const decoded = JSON.parse(atob((payload ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(decoded.aud).toBe('https://fcm.googleapis.com');
    expect(decoded.sub).toBe('mailto:admin@bsdc.info.bd');
    expect(decoded.exp).toBeGreaterThan(1_700_000_000);

    // The signature verifies against the public key, which is the only thing
    // that makes the token worth sending.
    const key = await crypto.subtle.importKey(
      'raw',
      publicRaw as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(signature ?? ''),
      encoder.encode(`${header}.${payload}`),
    );
    expect(verified).toBe(true);
  });

  it('never lets a token outlive a day', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(
      (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer,
    );
    const now = 1_700_000_000_000;
    const token = await signVapidJwt({
      privateKey: bytesToBase64Url(pkcs8),
      publicKey: '',
      audience: 'https://fcm.googleapis.com',
      subject: 'mailto:admin@bsdc.info.bd',
      expiresInSeconds: 60 * 60 * 24 * 30,
      now,
    });
    const payload = JSON.parse(
      atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')),
    ) as {
      exp: number;
    };
    expect(payload.exp - now / 1000).toBeLessThanOrEqual(86_400);
  });

  it('builds the single-header form push services expect', () => {
    expect(vapidHeader('abc', 'key')).toBe('vapid t=abc, k=key');
  });

  it('refuses an endpoint that is not https, which has no audience', () => {
    expect(endpointAudience('https://fcm.googleapis.com/wp/1')).toBe('https://fcm.googleapis.com');
    expect(endpointAudience('http://fcm.googleapis.com/wp/1')).toBeNull();
    expect(endpointAudience('not a url')).toBeNull();
  });
});
