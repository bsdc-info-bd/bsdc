/**
 * Cloudflare Pages Function — POST /api/auth/claims
 *
 * Mints Firebase custom claims (role, vendor, staff) for a member. The Pages
 * runtime cannot use firebase-admin, so this verifies the caller's ID token
 * against Google's public certificates with Web Crypto and then calls the
 * Identity Toolkit REST API authenticated by a service-account JWT that is
 * signed here with RS256.
 *
 * Secrets (Cloudflare Pages encrypted environment variables):
 *   FB_PROJECT_ID            bsdc-bd
 *   FB_CLIENT_EMAIL          service account address
 *   FB_PRIVATE_KEY           PEM private key (literal \n escapes allowed)
 *   BSDC_OWNER_UIDS          comma separated uid allowlist that may call this
 */
interface Env {
  FB_PROJECT_ID?: string;
  FB_CLIENT_EMAIL?: string;
  FB_PRIVATE_KEY?: string;
  BSDC_OWNER_UIDS?: string;
}

const ROLES = ['member', 'creator', 'vendor', 'moderator', 'manager', 'admin', 'owner'] as const;
type Role = (typeof ROLES)[number];

/** JWK form of Google's secure-token keys — directly importable by Web Crypto. */
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as Record<string, unknown>;
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  return base64UrlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_')).buffer as ArrayBuffer;
}

/** Verifies a Firebase ID token: signature, issuer, audience and expiry. */
async function verifyIdToken(token: string, projectId: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed-token');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const header = decodeSegment(headerPart);
  const payload = decodeSegment(payloadPart);

  const jwks = (await (await fetch(JWKS_URL)).json()) as { keys?: JsonWebKey[] };
  const kid = typeof header['kid'] === 'string' ? header['kid'] : '';
  const jwk = (jwks.keys ?? []).find((candidate) => (candidate as { kid?: string }).kid === kid);
  if (!jwk) throw new Error('unknown-key');

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
  if (!valid) throw new Error('bad-signature');

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
  if (exp < now) throw new Error('expired');
  if (payload['aud'] !== projectId) throw new Error('bad-audience');
  if (payload['iss'] !== `https://securetoken.google.com/${projectId}`)
    throw new Error('bad-issuer');
  if (typeof payload['sub'] !== 'string' || payload['sub'].length === 0) throw new Error('bad-sub');

  return payload;
}

/** Exchanges a self-signed service-account JWT for an access token. */
async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).buffer as ArrayBuffer,
  );
  const claim = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: env.FB_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/identitytoolkit',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ).buffer as ArrayBuffer,
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(env.FB_PRIVATE_KEY ?? ''),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );

  const assertion = `${header}.${claim}.${bytesToBase64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error('token-exchange-failed');
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('token-missing');
  return body.access_token;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!env.FB_PROJECT_ID || !env.FB_CLIENT_EMAIL || !env.FB_PRIVATE_KEY) {
    return json({ error: 'not-configured' }, 503);
  }

  const authorization = request.headers.get('authorization') ?? '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (idToken.length === 0) return json({ error: 'unauthorized' }, 401);

  let callerUid: string;
  try {
    const payload = await verifyIdToken(idToken, env.FB_PROJECT_ID);
    callerUid = payload['sub'] as string;
  } catch {
    return json({ error: 'unauthorized' }, 401);
  }

  const owners = (env.BSDC_OWNER_UIDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (!owners.includes(callerUid)) return json({ error: 'forbidden' }, 403);

  let body: { uid?: unknown; role?: unknown; vendor?: unknown; staff?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'bad-request' }, 400);
  }

  const uid = typeof body.uid === 'string' ? body.uid : '';
  const role = ROLES.includes(body.role as Role) ? (body.role as Role) : null;
  if (uid.length === 0 || role === null) return json({ error: 'bad-request' }, 400);

  const claims = {
    role,
    vendor: body.vendor === true || role === 'vendor',
    staff: body.staff === true || ['moderator', 'manager', 'admin', 'owner'].includes(role),
  };

  try {
    const accessToken = await getAccessToken(env);
    const response = await fetch(`${IDENTITY_URL}/projects/${env.FB_PROJECT_ID}/accounts:update`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    });
    if (!response.ok) return json({ error: 'update-failed' }, 502);
  } catch {
    return json({ error: 'update-failed' }, 502);
  }

  return json({ uid, claims }, 200);
};
