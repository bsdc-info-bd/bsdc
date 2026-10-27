import { BodyError, readJsonObject } from '../../_body';
/**
 * Cloudflare Pages Function — POST /api/auth/claims
 *
 * Mints Firebase custom claims for one user in one project. The claims the
 * whole platform depends on are laid out in claims-core.ts: `role` is always
 * "authenticated" so PostgREST can switch roles, the application role travels
 * in `bsdc_role`, and `staff`/`vendor` follow from it.
 *
 * The Pages runtime cannot use firebase-admin, so this verifies the caller's
 * ID token against Google's public certificates with Web Crypto and then calls
 * the Identity Toolkit REST API authenticated by a service-account JWT that is
 * signed here with RS256.
 *
 * Two projects are served by the one endpoint. The caller's own token chooses
 * which one: its audience names the project. Owners may assign claims for
 * their own project; an ordinary member may only bootstrap the least-
 * privileged claim for their own signed-in account. A member-project owner
 * cannot mint console claims and vice versa.
 *
 * Secrets (Cloudflare Pages encrypted environment variables):
 *   FB_PROJECT_ID / FB_CLIENT_EMAIL / FB_PRIVATE_KEY     the member project, bsdc-bd
 *   FB2_PROJECT_ID / FB2_CLIENT_EMAIL / FB2_PRIVATE_KEY  the console project, bsdc-second
 *   BSDC_OWNER_UIDS    comma separated bsdc-bd uids allowed to mint member claims
 *   BSDC2_OWNER_UIDS   comma separated bsdc-second uids allowed to mint console claims
 *   BSDC_BOOTSTRAP_OWNER_EMAILS  optional; replaces the built-in list of
 *                      addresses that may mint an elevated claim for their own
 *                      account, which is how the first owner gets in
 */
import {
  bootstrapOwnerRole,
  buildClaims,
  corsHeadersFor,
  credentialsFor,
  databaseAuthorityRole,
  isAppRole,
  ownersFor,
  selfBootstrapRole,
  targetFromAudience,
  toClaimsRequest,
  type AppRole,
  type ClaimsEnv,
  type ProjectCredentials,
} from './claims-core';

export interface ClaimsRuntimeEnv extends ClaimsEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

/** JWK form of Google's secure-token keys — directly importable by Web Crypto. */
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1';

function json(body: unknown, status: number, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeadersFor(origin),
    },
  });
}

/**
 * Asks Postgres (`public.my_role()`) what rank the caller already holds, using
 * the caller's own verified Firebase ID token and the public Supabase key so
 * row-level security remains in force and no privileged backend key is needed.
 */
async function fetchCallerDbRole(env: ClaimsRuntimeEnv, idToken: string): Promise<AppRole | null> {
  const base = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (
    env.SUPABASE_ANON_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim();
  if (base === '' || key === '') return null;
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
    if (!response.ok) return null;
    const rows = (await response.json()) as { role?: unknown }[] | { role?: unknown } | null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row && isAppRole(row.role) ? row.role : null;
  } catch {
    return null;
  }
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

/**
 * Reads the audience out of a token without trusting it. Verification happens
 * later, against the project this audience selects; this exists only so the
 * right service account and owner list can be chosen first.
 */
function peekAudience(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = decodeSegment(parts[1] as string);
    return typeof payload['aud'] === 'string' ? payload['aud'] : '';
  } catch {
    return '';
  }
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
async function getAccessToken(credentials: ProjectCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).buffer as ArrayBuffer,
  );
  const claim = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: credentials.clientEmail,
        scope: 'https://www.googleapis.com/auth/identitytoolkit',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ).buffer as ArrayBuffer,
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(credentials.privateKey),
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

export const onRequestOptions: PagesFunction<ClaimsRuntimeEnv> = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeadersFor(request.headers.get('origin')) });

export const onRequestPost: PagesFunction<ClaimsRuntimeEnv> = async (context) => {
  const { env, request } = context;
  const origin = request.headers.get('origin');

  const authorization = request.headers.get('authorization') ?? '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (idToken.length === 0) return json({ error: 'unauthorized' }, 401, origin);

  // The caller's token names the project it belongs to. That decides which
  // service account signs the update and which owner list guards it.
  const target = targetFromAudience(env, peekAudience(idToken));
  if (target === null) return json({ error: 'not-configured' }, 503, origin);
  const credentials = credentialsFor(env, target);
  if (credentials === null) return json({ error: 'not-configured' }, 503, origin);

  let callerUid: string;
  let tokenClaims: Record<string, unknown>;
  try {
    tokenClaims = await verifyIdToken(idToken, credentials.projectId);
    callerUid = tokenClaims['sub'] as string;
  } catch {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  let body: unknown;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    return json({ error: 'bad-request' }, error instanceof BodyError ? error.status : 400, origin);
  }
  const input = toClaimsRequest(body);
  if (input === null) return json({ error: 'bad-request' }, 400, origin);

  const isOwner = ownersFor(env, target).includes(callerUid);
  const selfRole = selfBootstrapRole(callerUid, tokenClaims, input);
  const birthRole = bootstrapOwnerRole(env, callerUid, tokenClaims, input);
  let claims: ReturnType<typeof buildClaims>;
  if (isOwner) {
    // Owners may assign the requested application role.
    claims = buildClaims(input.role, input.vendor, input.staff);
  } else if (birthRole !== null) {
    // An administrator named by their verified address, for their own account
    // only. This is the branch that opens a fresh deployment, where no uid
    // list could have been arranged yet; privilege flags still follow the role.
    claims = buildClaims(birthRole);
  } else if (selfRole !== null) {
    claims = buildClaims(selfRole);
  } else {
    // Check whether Postgres (`my_role()`) already granted this caller the
    // requested rank (for instance an approved vendor or promoted moderator).
    const dbRole =
      input.uid === callerUid && tokenClaims['role'] === 'authenticated'
        ? await fetchCallerDbRole(env, idToken)
        : null;
    const syncedRole = databaseAuthorityRole(callerUid, input, dbRole);
    if (syncedRole === null) return json({ error: 'forbidden' }, 403, origin);
    claims = buildClaims(syncedRole);
  }

  try {
    const accessToken = await getAccessToken(credentials);
    const response = await fetch(
      `${IDENTITY_URL}/projects/${credentials.projectId}/accounts:update`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ localId: input.uid, customAttributes: JSON.stringify(claims) }),
      },
    );
    if (!response.ok) return json({ error: 'update-failed' }, 502, origin);
  } catch {
    return json({ error: 'update-failed' }, 502, origin);
  }

  return json({ uid: input.uid, project: credentials.projectId, claims }, 200, origin);
};

/** Deployment readiness only: never returns credentials or accepts role changes. */
export const onRequestGet: PagesFunction<ClaimsRuntimeEnv> = ({ env, request }) => {
  const ready = credentialsFor(env, 'main') !== null;
  return json({ ready }, ready ? 200 : 503, request.headers.get('origin'));
};
