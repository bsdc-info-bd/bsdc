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

/** Canonical member Firebase project when no runtime override is bound. */
const DEFAULT_MEMBER_PROJECT_ID = 'bsdc-bd';

/** Canonical corporate staff Firebase project for the admin consoles. */
const DEFAULT_CORPORATE_PROJECT_ID = 'bsdc-second';

const STAFF_ROLES: ReadonlySet<string> = new Set(['moderator', 'manager', 'admin', 'owner']);

export interface MemberEnv {
  /** The Firebase project whose members this deployment serves. */
  FB_PROJECT_ID?: string;
  VITE_FB_PROJECT_ID?: string;
  /** The corporate staff Firebase project (used by sibling consoles like admin-site). */
  FB2_PROJECT_ID?: string;
  VITE_FB2_PROJECT_ID?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface VerifiedMember {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** The application role the token carries, when one has been minted. */
  appRole: string;
  claims: Record<string, unknown>;
}

export interface VerifiedMediaCaller extends VerifiedMember {
  project: 'main' | 'second';
  isStaff: boolean;
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

/** Reads the `Authorization: Bearer …` header (case-insensitive), or an empty string. */
export function bearerToken(request: Request): string {
  const authorization = (request.headers.get('authorization') ?? '').trim();
  const match = /^bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? '';
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

async function fetchJwkByKid(kid: string): Promise<JsonWebKey | null> {
  const findKey = async (url: string): Promise<JsonWebKey | null> => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const jwks = (await response.json()) as { keys?: JsonWebKey[] };
    return (
      (jwks.keys ?? []).find((candidate) => (candidate as { kid?: string }).kid === kid) ?? null
    );
  };

  const cached = await findKey(JWKS_URL);
  if (cached !== null) return cached;
  // Google rotates signing certs periodically; bypass stale CDN caches once on miss.
  return await findKey(`${JWKS_URL}?t=${Date.now()}`);
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

    const kid = typeof header['kid'] === 'string' ? header['kid'] : '';
    const jwk = await fetchJwkByKid(kid);
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
    // Allow minor edge clock skew; tokens past this window are rejected outright.
    if (expiry + 60 < now) return null;
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
  const configuredProjectId = (env.FB_PROJECT_ID ?? env.VITE_FB_PROJECT_ID ?? '').trim();
  const projectId =
    configuredProjectId.length > 0 ? configuredProjectId : DEFAULT_MEMBER_PROJECT_ID;
  const token = bearerToken(request);
  if (token.length === 0) return null;
  return verifyMember(token, projectId);
}

async function hasDatabaseStaffRole(env: MemberEnv, idToken: string): Promise<boolean> {
  const base = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (
    env.SUPABASE_ANON_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim();
  if (base === '' || key === '') return false;
  try {
    const response = await fetch(`${base}/rest/v1/rpc/my_role`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) return false;
    const rows = (await response.json()) as
      | { role?: unknown; staff?: unknown }[]
      | { role?: unknown; staff?: unknown }
      | null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return false;
    return row.staff === true || (typeof row.role === 'string' && STAFF_ROLES.has(row.role));
  } catch {
    return false;
  }
}

function hasStaffTokenClaim(verified: VerifiedMember): boolean {
  return verified.claims['staff'] === true || STAFF_ROLES.has(verified.appRole);
}

/**
 * Verifies an uploader for `/api/media/upload`: accepts either signed-in
 * `bsdc-bd` members (all member media purposes) or verified `bsdc-second`
 * corporate staff (ad creative uploads from `admin-site`).
 */
export async function mediaUploaderOf(
  request: Request,
  env: MemberEnv,
  verifiedMember?: VerifiedMember | null,
): Promise<VerifiedMediaCaller | null> {
  const token = bearerToken(request);
  if (token.length === 0) return null;

  const memberProjectId =
    (env.FB_PROJECT_ID ?? env.VITE_FB_PROJECT_ID ?? '').trim() || DEFAULT_MEMBER_PROJECT_ID;
  const corporateProjectId =
    (env.FB2_PROJECT_ID ?? env.VITE_FB2_PROJECT_ID ?? '').trim() || DEFAULT_CORPORATE_PROJECT_ID;

  if (verifiedMember !== undefined && verifiedMember !== null) {
    const isStaff =
      hasStaffTokenClaim(verifiedMember) ||
      (verifiedMember.claims['role'] === 'authenticated' &&
        (await hasDatabaseStaffRole(env, token)));
    return { ...verifiedMember, project: 'main', isStaff };
  }

  const audience = peekAudience(token);
  if (audience === memberProjectId) {
    const verified = await verifyMember(token, memberProjectId);
    if (verified === null) return null;
    const isStaff =
      hasStaffTokenClaim(verified) ||
      (verified.claims['role'] === 'authenticated' && (await hasDatabaseStaffRole(env, token)));
    return { ...verified, project: 'main', isStaff };
  }

  if (audience === corporateProjectId) {
    const verified = await verifyMember(token, corporateProjectId);
    if (verified === null) return null;
    const isStaff =
      hasStaffTokenClaim(verified) ||
      (verified.claims['role'] === 'authenticated' && (await hasDatabaseStaffRole(env, token)));
    if (!isStaff) return null;
    return { ...verified, project: 'second', isStaff: true };
  }

  return null;
}
