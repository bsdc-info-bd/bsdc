/**
 * Web push, the part that is arithmetic.
 *
 * Sending a push is a plain HTTPS POST to the endpoint the browser was given,
 * with a `VAPID` authorization header that proves this site is the one that
 * asked the device to be woken. The signature is ES256 over a three-field JSON
 * token; everything here is that, plus the two conversions the Web Push
 * specification insists on — base64url without padding, and the raw `r||s`
 * signature form rather than DER.
 *
 * The payload of the POST is deliberately empty. A body on the way to a push
 * service has to be encrypted for that one subscription (RFC 8291), and a device
 * that has been asleep is better served by being woken once and asking what it
 * missed — which is what `/api/push/content` is for — than by a queue of
 * encrypted buzzes. An empty body is the one case the specification sends
 * unencrypted, so there is nothing here that can be silently wrong.
 *
 * This module runs at the edge and in the browser, so it uses only Web Crypto.
 */

const textEncoder = new TextEncoder();

/** Decodes base64url — the alphabet Web Push uses, with or without padding. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '=');
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Encodes base64url without padding, the way the specification wants it. */
export function uint8ArrayToUrlBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodePart(value: Record<string, unknown>): string {
  return uint8ArrayToUrlBase64(textEncoder.encode(JSON.stringify(value)));
}

/**
 * The `aud` claim has to be the origin of the push service, so one VAPID key
 * signs differently for FCM, for Mozilla and for Apple. An endpoint that is not
 * a URL has no audience and must not be sent to.
 */
export function endpointOrigin(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export interface VapidClaims {
  aud: string;
  exp: number;
  sub: string;
}

/** The unsigned halves of the token, exposed so the shape can be checked. */
export function vapidJwtParts(claims: VapidClaims): { header: string; payload: string } {
  return {
    header: encodePart({ alg: 'ES256', typ: 'JWT' }),
    payload: encodePart({ aud: claims.aud, exp: claims.exp, sub: claims.sub }),
  };
}

export interface SignVapidInput {
  /** PKCS#8 DER of the P-256 private key, base64url encoded. */
  privateKey: string;
  /** The uncompressed point, base64url encoded: the `k=` half of the header. */
  publicKey: string;
  audience: string;
  subject: string;
  /** Seconds from now. Push services reject anything over 24 hours. */
  expiresInSeconds?: number;
  now?: number;
}

export const VAPID_MAX_TTL_SECONDS = 24 * 60 * 60;

async function importVapidPrivateKey(
  privateKey: string,
  publicKey: string,
): Promise<CryptoKey | null> {
  const privBytes = urlBase64ToUint8Array(privateKey);
  if (privBytes.byteLength === 32) {
    const pubBytes = uncompressedP256Point(urlBase64ToUint8Array(publicKey));
    if (pubBytes.byteLength === 65 && pubBytes[0] === 0x04) {
      const x = uint8ArrayToUrlBase64(pubBytes.subarray(1, 33));
      const y = uint8ArrayToUrlBase64(pubBytes.subarray(33, 65));
      try {
        return await crypto.subtle.importKey(
          'jwk',
          { kty: 'EC', crv: 'P-256', x, y, d: privateKey.trim(), ext: false },
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['sign'],
        );
      } catch {
        return null;
      }
    }
  }
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      privBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  } catch {
    return null;
  }
}

/** Signs the token. Returns null when the key cannot be read, so the caller
 *  can skip the send rather than POST an unsigned request. */
export async function signVapidJwt(input: SignVapidInput): Promise<string | null> {
  const lifetime = Math.min(
    Math.max(60, input.expiresInSeconds ?? 12 * 60 * 60),
    VAPID_MAX_TTL_SECONDS,
  );
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  try {
    const key = await importVapidPrivateKey(input.privateKey, input.publicKey);
    if (key === null) return null;
    const parts = vapidJwtParts({
      aud: input.audience,
      exp: nowSeconds + lifetime,
      sub: input.subject,
    });
    const signingInput = `${parts.header}.${parts.payload}`;
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      textEncoder.encode(signingInput),
    );
    return `${signingInput}.${uint8ArrayToUrlBase64(new Uint8Array(signature))}`;
  } catch {
    return null;
  }
}

/** The single-header form: `vapid t=<token>, k=<public key>`. */
export function vapidAuthorizationHeader(token: string, publicKey: string): string {
  return `vapid t=${token}, k=${publicKey}`;
}

/** How long the push service should keep trying to reach the device. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

/**
 * 404 and 410 mean the subscription no longer exists; the row should be retired
 * so the next flush does not wake a device that is gone. 429 means slow down,
 * which is not the same thing at all.
 */
export function isDeadEndpointStatus(status: number): boolean {
  return status === 404 || status === 410;
}

/** A subject the push service can complain to. */
export function vapidSubject(contactEmail: string): string {
  const trimmed = contactEmail.trim();
  const address = trimmed.length > 0 ? trimmed : 'admin@bsdc.info.bd';
  return address.startsWith('mailto:') ? address : `mailto:${address}`;
}

const RECORD_SIZE = 4096;
const HEADER_SALT_BYTES = 16;
const HEADER_RS_BYTES = 4;
const HEADER_IDLEN_BYTES = 1;

function concatUint8(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function uncompressedP256Point(raw: Uint8Array): Uint8Array {
  if (raw.byteLength === 65 && raw[0] === 0x04) return raw;
  if (raw.byteLength === 64) return concatUint8(new Uint8Array([0x04]), raw);
  return raw;
}

async function hkdfSha256(
  salt: Uint8Array | null,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt ?? new Uint8Array(0),
      info,
    } as unknown as Parameters<SubtleCrypto['deriveBits']>[0],
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * RFC 8291 (`aes128gcm`) payload encryption for Web Push subscriptions that carry
 * `p256dh` + `auth` key material, allowing Pages Functions local fallback to deliver
 * notification title/body/url directly without requiring a separate `/api/push/content`
 * round-trip on wake.
 */
export async function encryptWebPushPayload(input: {
  p256dh: string;
  auth: string;
  plaintext: string;
}): Promise<{ body: Uint8Array; contentEncoding: 'aes128gcm' } | null> {
  if (!input.p256dh.trim() || !input.auth.trim()) return null;
  try {
    const uaPublic = uncompressedP256Point(urlBase64ToUint8Array(input.p256dh.trim()));
    const authSecret = urlBase64ToUint8Array(input.auth.trim());

    const receiverKey = await crypto.subtle.importKey(
      'raw',
      uaPublic,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const ephemeralRaw = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
    if (!('privateKey' in ephemeralRaw) || !('publicKey' in ephemeralRaw)) return null;

    const ecdhSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'ECDH', public: receiverKey } as unknown as Parameters<
          SubtleCrypto['deriveBits']
        >[0],
        ephemeralRaw.privateKey,
        256,
      ),
    );
    const exportedSender = await crypto.subtle.exportKey('raw', ephemeralRaw.publicKey);
    if (!(exportedSender instanceof ArrayBuffer)) return null;
    const senderPublicRaw = uncompressedP256Point(new Uint8Array(exportedSender));
    const salt = crypto.getRandomValues(new Uint8Array(HEADER_SALT_BYTES));

    const keyInfo = concatUint8(textEncoder.encode('WebPush: info\0'), uaPublic, senderPublicRaw);
    const ikm = await hkdfSha256(authSecret, ecdhSecret, keyInfo, 32);
    const cek = await hkdfSha256(
      salt,
      ikm,
      textEncoder.encode('Content-Encoding: aes128gcm\0'),
      16,
    );
    const nonce = await hkdfSha256(salt, ikm, textEncoder.encode('Content-Encoding: nonce\0'), 12);

    const record = concatUint8(textEncoder.encode(input.plaintext), new Uint8Array([0x02]));
    const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record),
    );

    const header = new Uint8Array(HEADER_SALT_BYTES + HEADER_RS_BYTES + HEADER_IDLEN_BYTES);
    header.set(salt, 0);
    new DataView(header.buffer).setUint32(HEADER_SALT_BYTES, RECORD_SIZE, false);
    header[HEADER_SALT_BYTES + HEADER_RS_BYTES] = senderPublicRaw.byteLength;

    return {
      body: concatUint8(header, senderPublicRaw, ciphertext),
      contentEncoding: 'aes128gcm',
    };
  } catch {
    return null;
  }
}
