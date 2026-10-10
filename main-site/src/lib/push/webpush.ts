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

/** Signs the token. Returns null when the key cannot be read, so the caller
 *  can skip the send rather than POST an unsigned request. */
export async function signVapidJwt(input: SignVapidInput): Promise<string | null> {
  const lifetime = Math.min(
    Math.max(60, input.expiresInSeconds ?? 12 * 60 * 60),
    VAPID_MAX_TTL_SECONDS,
  );
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      urlBase64ToUint8Array(input.privateKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
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
