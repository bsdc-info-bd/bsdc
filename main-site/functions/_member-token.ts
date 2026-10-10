/**
 * Who is calling, verified at the edge.
 *
 * Every endpoint under `/api/` that writes something needs to know the member
 * behind the request, and the Pages runtime cannot use `firebase-admin`. This
 * module does the same job with Web Crypto: it checks an ID token's signature
 * against Google's published secure-token certificates, then its issuer,
 * audience and expiry, and hands back the uid the token was issued to.
 *
 * It is deliberately separate from the verification inside
 * `api/auth/claims.ts`, which also has to choose between two Firebase projects
 * and sign a service-account assertion. An endpoint that only needs "which
 * member is this" should not carry that machinery, and the machinery should not
 * be copied a third time when the next endpoint needs it.
 *
 * Nothing here trusts a claim it has not verified: the uid is only returned
 * after the signature check passes, so a forged token cannot name a member.
 */

/** Google's secure-token keys, in a form Web Crypto can import directly. */
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface MemberEnv {
  /** The Firebase project whose members this deployment serves. */
  FB_PROJECT_ID?: string;
}

export interface VerifiedMember {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** The application role the token carries, when one has been minted. */
  appRole: string;
  claims: Record<string, unknown>;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as Record<string, unknown>;
}

/** Reads the `Authorization: Bearer …` header, or an empty string. */
export function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

/** The project a token claims, read without trusting it. Verification follows. */
export function peekAudience(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = decodeSegment(parts[1] as string);
    return typeof payload['aud'] === 'string' ? payload['aud'] : '';
  } catch {
    return '';
  }
}

/**
 * Verifies an ID token and returns the member it names.
 *
 * Returns null rather than throwing: an endpoint answers 401 the same way
 * whatever was wrong with the token, so a malformed token, an expired one and a
 * token for another project are not distinguishable from the outside.
 */
export async function verifyMember(
  token: string,
  projectId: string,
): Promise<VerifiedMember | null> {
  if (token.length === 0 || projectId.length === 0) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  try {
    const header = decodeSegment(headerPart);
    const payload = decodeSegment(payloadPart);

    const response = await fetch(JWKS_URL);
    if (!response.ok) return null;
    const jwks = (await response.json()) as { keys?: JsonWebKey[] };

    const kid = typeof header['kid'] === 'string' ? header['kid'] : '';
    const jwk = (jwks.keys ?? []).find((candidate) => (candidate as { kid?: string }).kid === kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) return null;

    const now = Math.floor(Date.now() / 1000);
    const expiry = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
    // A small clock skew allowance; the token is otherwise rejected outright.
    if (expiry + 30 < now) return null;
    if (payload['aud'] !== projectId) return null;
    if (payload['iss'] !== `https://securetoken.google.com/${projectId}`) return null;

    const uid = typeof payload['sub'] === 'string' ? payload['sub'] : '';
    if (uid.length === 0) return null;

    return {
      uid,
      email: typeof payload['email'] === 'string' ? payload['email'] : null,
      emailVerified: payload['email_verified'] === true,
      appRole: typeof payload['bsdc_role'] === 'string' ? payload['bsdc_role'] : 'member',
      claims: payload,
    };
  } catch {
    return null;
  }
}

/** The member behind a request, or null when the caller is not signed in. */
export async function memberOf(request: Request, env: MemberEnv): Promise<VerifiedMember | null> {
  const projectId = env.FB_PROJECT_ID ?? '';
  const token = bearerToken(request);
  if (token.length === 0) return null;
  return verifyMember(token, projectId);
}
