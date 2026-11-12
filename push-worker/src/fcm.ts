/**
 * Firebase Cloud Messaging (FCM) HTTP v1 delivery using Web Crypto RSA-SHA256
 * service-account OAuth2 access tokens.
 */
import { base64UrlToBytes, bytesToBase64Url } from './crypto';
import type { DeliveryOutcome } from './deliver';
import type { FcmCredentials } from './env';
import type { PushWords } from './notifications';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_TTL_MS = 50 * 60 * 1000;

const cachedTokens = new Map<string, { token: string; expiresAt: number }>();

export function clearFcmTokenCache(): void {
  cachedTokens.clear();
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bytes = base64UrlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_'));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function getFcmAccessToken(
  credentials: FcmCredentials,
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  const cacheKey = `${credentials.projectId}:${credentials.clientEmail}`;
  const cached = cachedTokens.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.token;

  const iat = Math.floor(now / 1000);
  const encoder = new TextEncoder();
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: credentials.clientEmail,
        scope: FCM_SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    ),
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(credentials.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claim}`)),
  );
  const assertion = `${header}.${claim}.${bytesToBase64Url(signature)}`;

  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(`fcm-token-exchange-${response.status}`);
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error('fcm-token-missing');
  }
  cachedTokens.set(cacheKey, { token: body.access_token, expiresAt: now + TOKEN_TTL_MS });
  return body.access_token;
}

export function classifyFcmError(status: number, bodyText: string): DeliveryOutcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404) return 'dead';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429 || status >= 500) return 'retry';

  if (status === 400) {
    const upper = bodyText.toUpperCase();
    if (upper.includes('UNREGISTERED')) return 'dead';
    if (upper.includes('INVALID_ARGUMENT') && upper.includes('REGISTRATION')) return 'invalid';
  }
  return 'failed';
}

export interface FcmSendRequest {
  credentials: FcmCredentials;
  token: string;
  platform: 'web' | 'android' | 'ios';
  words: PushWords;
  siteUrl: string;
  urgency?: 'normal' | 'high';
  accessToken?: string;
  fetcher?: typeof fetch;
}

export type AndroidChannelId =
  | 'bsdc_messenger'
  | 'bsdc_social'
  | 'bsdc_orders'
  | 'bsdc_verify_alerts'
  | 'bsdc_general';

/** Maps push tag & topic to the exact Android O+ NotificationChannel created by the native app. */
export function resolveAndroidChannelId(words: Pick<PushWords, 'tag' | 'url'>): AndroidChannelId {
  const tag = words.tag.toLowerCase();
  if (tag.startsWith('bsdc-message-') || words.url.startsWith('/messages')) {
    return 'bsdc_messenger';
  }
  if (
    tag.startsWith('bsdc-order-') ||
    tag.startsWith('bsdc-review-') ||
    tag.startsWith('bsdc-payout-')
  ) {
    return 'bsdc_orders';
  }
  if (
    tag.startsWith('bsdc-moderation-') ||
    tag.startsWith('bsdc-certificate-') ||
    tag.startsWith('bsdc-course-') ||
    tag.startsWith('bsdc-job-') ||
    tag.startsWith('bsdc-event-')
  ) {
    return 'bsdc_verify_alerts';
  }
  if (
    tag.startsWith('bsdc-follow-') ||
    tag.startsWith('bsdc-reaction-') ||
    tag.startsWith('bsdc-comment-') ||
    tag.startsWith('bsdc-reply-') ||
    tag.startsWith('bsdc-mention-') ||
    tag.startsWith('bsdc-mention_group-') ||
    tag.startsWith('bsdc-bookmark-') ||
    tag.startsWith('bsdc-share-') ||
    tag.startsWith('bsdc-post_published-') ||
    tag.startsWith('bsdc-group_invite-')
  ) {
    return 'bsdc_social';
  }
  return 'bsdc_general';
}

export async function sendFcmNotification(request: FcmSendRequest): Promise<DeliveryOutcome> {
  const fetcher = request.fetcher ?? fetch;
  let bearerToken: string;
  try {
    bearerToken = request.accessToken ?? (await getFcmAccessToken(request.credentials, fetcher));
  } catch {
    return 'unauthorized';
  }

  const base = request.siteUrl.replace(/\/+$/, '');
  const urgency = request.urgency ?? 'normal';
  const link = `${base}${request.words.url}`;
  const channelId = resolveAndroidChannelId(request.words);

  const message = {
    token: request.token,
    notification: {
      title: request.words.title,
      body: request.words.body,
    },
    data: {
      url: request.words.url,
      path: request.words.url,
      tag: request.words.tag,
      title: request.words.title,
      body: request.words.body,
      icon: '/icons/icon-192.png',
      kind: request.words.topic,
      channel_id: channelId,
    },
    webpush: {
      headers: { Urgency: urgency },
      notification: {
        title: request.words.title,
        body: request.words.body,
        icon: `${base}/icons/icon-192.png`,
        badge: `${base}/icons/maskable-512.png`,
        tag: request.words.tag,
      },
      fcm_options: { link },
    },
    android: {
      priority: urgency === 'high' ? 'HIGH' : 'NORMAL',
      notification: {
        title: request.words.title,
        body: request.words.body,
        tag: request.words.tag,
        channel_id: channelId,
        click_action: 'OPEN_URL',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title: request.words.title, body: request.words.body },
          'thread-id': request.words.topic,
          sound: 'default',
        },
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(request.credentials.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      },
    );
    const bodyText = response.ok ? '' : await response.text().catch(() => '');
    return classifyFcmError(response.status, bodyText);
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}
