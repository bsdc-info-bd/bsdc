/**
 * The cryptography a push that carries words requires.
 *
 * A wake-up with no body is a plain POST with a VAPID header — see
 * `main-site/functions/api/push/flush.ts`, which is what this worker used to be
 * limited to. A wake-up that *says something while the browser is closed* is a
 * different animal: RFC 8291, "Message Encryption for Web Push", on top of
 * RFC 8188, "Encrypted Content-Encoding for HTTP". The message is encrypted for
 * exactly one subscription, with two keys that subscription handed the browser,
 * and the push service in the middle cannot read it.
 *
 * Doing it properly is three steps and no shortcuts:
 *
 *   1. A single-use ECDH P-256 key pair is generated per message. Its public
 *      point travels in the `aes128gcm` header.
 *   2. The shared secret from that pair and the subscription's `p256dh` key is
 *      run through HKDF-SHA-256 twice: once with a salt to make the 16-byte
 *      content encryption key, once to make the 12-byte nonce. The subscription's
 *      `auth` secret is mixed into the input keying material, which is what stops
 *      a push service from reading or forging the message.
 *   3. The plaintext is padded and sealed with AES-128-GCM, and the record is
 *      framed as `salt | rs | idlen | keyid | ciphertext`.
 *
 * Anything less is a notification that arrives empty, or a 400 from the push
 * service with no explanation. The functions below are Web Crypto only, so they
 * run unchanged in a Worker and in a test.
 */

const encoder = new TextEncoder();

/** The record size every push service accepts for a small payload. */
const RECORD_SIZE = 4096;
/** aes128gcm: 16-byte salt, 4-byte record size, 1-byte key id length, key id. */
const HEADER_SALT_BYTES = 16;
const HEADER_RS_BYTES = 4;
const HEADER_IDLEN_BYTES = 1;

export function base64UrlToBytes(value: string): Uint8Array {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Concatenates byte arrays, which is most of what the framing here is. */
export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/**
 * The uncompressed form of a P-256 point: `0x04 || X || Y`.
 *
 * Web Crypto exports an ECDH public key as the raw point and imports it the same
 * way, but the browser's `PushSubscription` also gives `0x04`-prefixed points.
 * Both sides normalise through here so a subscription whose key arrived with or
 * without the prefix encrypts identically.
 */
export function uncompressedPoint(raw: Uint8Array): Uint8Array {
  if (raw.byteLength === 65 && raw[0] === 0x04) return raw;
  if (raw.byteLength === 64) return concatBytes(new Uint8Array([0x04]), raw);
  return raw;
}

async function hkdf(
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
    } as unknown as HkdfParams,
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface EncryptInput {
  /** The subscription's `p256dh` key, base64url. */
  p256dh: string;
  /** The subscription's `auth` secret, base64url. */
  auth: string;
  /** The words, already JSON-encoded by the caller. */
  plaintext: string;
  /** Test seam: a fixed salt. Never supply one in production. */
  salt?: Uint8Array;
}

export interface EncryptedPush {
  /** The whole `aes128gcm` body, ready to POST. */
  body: Uint8Array;
  /** Value for the `Content-Encoding` header. */
  contentEncoding: 'aes128gcm';
}

/**
 * Encrypts a payload for one subscription.
 *
 * Throws rather than returning a partial result: a message that cannot be
 * encrypted for a device must not be sent to that device as a wake-up that says
 * nothing, because the member would then have a notification with no words and
 * no way to know they were meant to get one.
 */
export async function encryptPushPayload(input: EncryptInput): Promise<EncryptedPush> {
  const uaPublic = uncompressedPoint(base64UrlToBytes(input.p256dh));
  const authSecret = base64UrlToBytes(input.auth);

  const asPublic = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );

  const ephemeral = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asPublic } as unknown as EcdhKeyDeriveParams,
      ephemeral.privateKey,
      256,
    ),
  );

  const asPublicRaw = new Uint8Array(
    (await crypto.subtle.exportKey('raw', ephemeral.publicKey)) as ArrayBuffer,
  );
  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(HEADER_SALT_BYTES));

  // RFC 8291 §3.3/§3.4: the authentication secret is mixed into the IKM first,
  // then the result is expanded twice with different info strings.
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info\0'),
    uncompressedPoint(uaPublic),
    uncompressedPoint(asPublicRaw),
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // A single record: the payload, then the 0x02 delimiter that says "this is the
  // last record and there is no padding after it".
  const payload = concatBytes(encoder.encode(input.plaintext), new Uint8Array([0x02]));

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, payload),
  );

  const header = new Uint8Array(HEADER_SALT_BYTES + HEADER_RS_BYTES + HEADER_IDLEN_BYTES);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(HEADER_SALT_BYTES, RECORD_SIZE, false);
  header[HEADER_SALT_BYTES + HEADER_RS_BYTES] = uncompressedPoint(asPublicRaw).byteLength;

  return {
    body: concatBytes(header, uncompressedPoint(asPublicRaw), ciphertext),
    contentEncoding: 'aes128gcm',
  };
}

// ------------------------------------------------------------------- vapid ---

export interface VapidInput {
  privateKey: string;
  publicKey: string;
  audience: string;
  subject: string;
  expiresInSeconds?: number;
  now?: number;
}

const VAPID_MAX_TTL_SECONDS = 24 * 60 * 60;

/**
 * The VAPID JWT: ES256 over `{alg,typ}.{aud,exp,sub}`, signed with the raw
 * `r||s` form rather than DER, which is what the specification requires and what
 * a naive implementation gets wrong on the first try.
 */
export async function signVapidJwt(input: VapidInput): Promise<string> {
  const lifetime = Math.min(
    Math.max(60, input.expiresInSeconds ?? 12 * 60 * 60),
    VAPID_MAX_TTL_SECONDS,
  );
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);

  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({ aud: input.audience, exp: nowSeconds + lifetime, sub: input.subject }),
    ),
  );
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64UrlToBytes(input.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput)),
  );

  // Web Crypto returns the raw 64-byte r||s form, which is also what JWS wants.
  // Some runtimes have been known to return DER; converting here removes the
  // dependency on which one this is.
  const raw = signature.byteLength === 64 ? signature : derToRaw(signature);
  return `${signingInput}.${bytesToBase64Url(raw)}`;
}

/** Converts a DER ECDSA signature to the raw r||s form JWS requires. */
export function derToRaw(der: Uint8Array): Uint8Array {
  // 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
  if (der.byteLength < 8 || der[0] !== 0x30) return der;
  let offset = 2;
  if ((der[1] ?? 0) & 0x80) offset += (der[1] ?? 0) & 0x7f;
  if (der[offset] !== 0x02) return der;
  const rLength = der[offset + 1] ?? 0;
  const r = der.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  if (der[offset] !== 0x02) return der;
  const sLength = der[offset + 1] ?? 0;
  const s = der.slice(offset + 2, offset + 2 + sLength);

  const out = new Uint8Array(64);
  // A leading zero byte is DER's sign marker and is not part of the integer.
  const rTrimmed = r.byteLength > 32 ? r.slice(r.byteLength - 32) : r;
  const sTrimmed = s.byteLength > 32 ? s.slice(s.byteLength - 32) : s;
  out.set(rTrimmed, 32 - rTrimmed.byteLength);
  out.set(sTrimmed, 64 - sTrimmed.byteLength);
  return out;
}

/** The `Authorization` header value a push service expects. */
export function vapidHeader(token: string, publicKey: string): string {
  return `vapid t=${token}, k=${publicKey}`;
}

/** The origin of a push endpoint, which is the JWT's `aud`. */
export function endpointAudience(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}
