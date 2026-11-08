const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const encoder = new TextEncoder();

type ServiceAccount = { client_email: string; private_key: string; project_id: string };
type OAuthToken = { access_token: string; expires_at: number };
const accessTokens = new Map<string, OAuthToken>();

export type FcmInput = {
  token: string;
  title: string;
  body: string;
  path: string;
  eventId: string;
  kind?: string;
};
export type FcmResult = { kind: 'sent' } | { kind: 'invalid-token' };

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodePrivateKey(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('FCM signing key is not valid PKCS8 PEM');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseServiceAccount(raw: string): ServiceAccount {
  let value: Partial<ServiceAccount>;
  try {
    value = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new Error('FCM service account configuration is invalid');
  }
  if (!value.client_email || !value.private_key || !value.project_id) {
    throw new Error('FCM service account configuration is incomplete');
  }
  return value as ServiceAccount;
}

async function signedAssertion(
  account: ServiceAccount,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(
    encoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: FCM_SCOPE,
        aud: OAUTH_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const input = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePrivateKey(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

async function oauthToken(account: ServiceAccount): Promise<string> {
  const cached = accessTokens.get(account.client_email);
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;
  const assertion = await signedAssertion(account);
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error('FCM OAuth token request failed');
  }
  const result = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error('FCM OAuth response had no access token');
  accessTokens.set(account.client_email, {
    access_token: result.access_token,
    expires_at: Date.now() + (result.expires_in ?? 3600) * 1000,
  });
  return result.access_token;
}

/** No private data is put in the notification text; tap-through fetches authorized content. */
export function fcmMessage(input: FcmInput) {
  const path = input.path.startsWith('/') && !input.path.startsWith('//') ? input.path : '/';
  return {
    message: {
      token: input.token,
      notification: {
        title: input.title.slice(0, 120),
        body: input.kind === 'message' ? 'You have a new message.' : input.body.slice(0, 240),
      },
      data: {
        path,
        eventId: input.eventId.slice(0, 120),
        kind: (input.kind ?? 'activity').slice(0, 40),
      },
      android: {
        priority: 'HIGH',
        ttl: '3600s',
        notification: {
          channel_id: 'bsdc_activity',
          click_action: 'bd.info.bsdc.app.OPEN_NOTIFICATION',
        },
      },
    },
  };
}

/** Send through FCM HTTP v1. The service-account private key is only a Worker secret. */
export async function sendFcm(
  rawAccount: string,
  input: FcmInput,
  fetcher: typeof fetch = fetch,
): Promise<FcmResult> {
  if (!input.token || input.token.length > 4096)
    throw new Error('FCM registration token is invalid');
  const account = parseServiceAccount(rawAccount);
  const accessToken = await oauthTokenWithFetcher(account, fetcher);
  const response = await fetcher(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(fcmMessage(input)),
    },
  );
  if (response.ok) {
    await response.text().catch(() => '');
    return { kind: 'sent' };
  }
  let responseText = '';
  try {
    responseText = await response.text();
  } catch {
    /* fixed safe failure below */
  }
  if (response.status === 404 && /UNREGISTERED|NOT_FOUND/.test(responseText))
    return { kind: 'invalid-token' };
  throw new Error(`FCM send failed with status ${response.status}`);
}

async function oauthTokenWithFetcher(
  account: ServiceAccount,
  fetcher: typeof fetch,
): Promise<string> {
  if (fetcher === fetch) return oauthToken(account);
  const assertion = await signedAssertion(account);
  const response = await fetcher(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error('FCM OAuth token request failed');
  }
  const result = (await response.json()) as { access_token?: string };
  if (!result.access_token) throw new Error('FCM OAuth response had no access token');
  return result.access_token;
}
