/**
 * Shared Firebase JWT verification and FCM HTTP v1 dispatch helper for Pages Functions.
 * Underscore-prefixed so Cloudflare Pages never exposes it as an HTTP endpoint.
 */
import { rpc, type RpcEnv } from './_rpc';

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface CachedJwks {
  keys: JsonWebKey[];
  expiresAt: number;
}

let cachedJwks: CachedJwks | null = null;
const cachedOAuthTokens = new Map<string, { token: string; expiresAt: number }>();

export interface FcmEnv extends RpcEnv {
  FB_PROJECT_ID?: string;
  FB_CLIENT_EMAIL?: string;
  FB_PRIVATE_KEY?: string;
  FB2_PROJECT_ID?: string;
  VITE_FB_PROJECT_ID?: string;
  VITE_FB2_PROJECT_ID?: string;
}

export interface FcmPendingRow {
  notification_id: string;
  uid: string;
  token: string;
  platform: 'web' | 'android' | 'ios';
  language: string;
  kind: string;
  body: string;
  actor_name: string;
  actor_avatar: string;
  url: string;
  post_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

export interface FcmFallbackResult {
  configured: boolean;
  waiting: number;
  devices: number;
  sent: number;
  dead: number;
  invalid: number;
  failed: number;
  marked: number;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
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
  const bytes = base64UrlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_'));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function fetchJwks(): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.keys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error('jwks-fetch-failed');
  const data = (await response.json()) as { keys?: JsonWebKey[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  cachedJwks = { keys, expiresAt: now + 10 * 60 * 1000 };
  return keys;
}

/** Verifies a Firebase ID token against Google's secure-token JWKS. */
export async function verifyFirebaseIdToken(
  token: string,
  allowedProjects: readonly string[],
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed-token');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const header = decodeSegment(headerPart);
  const payload = decodeSegment(payloadPart);
  const aud = typeof payload['aud'] === 'string' ? payload['aud'] : '';
  if (!allowedProjects.includes(aud)) throw new Error('bad-audience');

  const kid = typeof header['kid'] === 'string' ? header['kid'] : '';
  let keys = await fetchJwks();
  let jwk = keys.find((c) => (c as { kid?: string }).kid === kid);
  if (!jwk) {
    cachedJwks = null;
    keys = await fetchJwks();
    jwk = keys.find((c) => (c as { kid?: string }).kid === kid);
  }
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
  if (payload['iss'] !== `https://securetoken.google.com/${aud}`) throw new Error('bad-issuer');
  if (typeof payload['sub'] !== 'string' || payload['sub'].length === 0) throw new Error('bad-sub');

  return payload;
}

export function resolveFcmCredentials(
  env: FcmEnv,
): { projectId: string; clientEmail: string; privateKey: string } | null {
  const projectId = (env.FB_PROJECT_ID ?? env.VITE_FB_PROJECT_ID ?? '').trim();
  const clientEmail = (env.FB_CLIENT_EMAIL ?? '').trim();
  const privateKey = (env.FB_PRIVATE_KEY ?? '').trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

async function getOAuthAccessToken(creds: {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}): Promise<string> {
  const keyName = `${creds.projectId}:${creds.clientEmail}`;
  const cached = cachedOAuthTokens.get(keyName);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const iat = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: creds.clientEmail,
        scope: FCM_SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    ),
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(creds.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claim}`)),
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
  if (!response.ok) throw new Error(`fcm-token-${response.status}`);
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('fcm-token-empty');
  }
  cachedOAuthTokens.set(keyName, {
    token: payload.access_token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  });
  return payload.access_token;
}

const NAMES_EN: Record<string, string> = {
  message: 'New message',
  comment: 'New comment',
  reply: 'New reply',
  reaction: 'New reaction',
  mention: 'You were mentioned',
  mention_group: 'Mentioned in group',
  follow: 'New follower',
  share: 'Shared your post',
  bookmark: 'Saved your post',
  post_published: 'New post',
  moderation: 'Moderation alert',
  order: 'Order update',
  review: 'New review',
  payout: 'Payout update',
  course: 'Course update',
  job: 'New opportunity',
  event: 'Event update',
  certificate: 'Certificate issued',
  group_invite: 'Group invitation',
  feedback: 'Feedback update',
};

const NAMES_BN: Record<string, string> = {
  message: 'নতুন বার্তা',
  comment: 'নতুন মন্তব্য',
  reply: 'নতুন উত্তর',
  reaction: 'নতুন প্রতিক্রিয়া',
  mention: 'আপনাকে উল্লেখ করা হয়েছে',
  mention_group: 'গ্রুপে উল্লেখ',
  follow: 'নতুন অনুসারী',
  share: 'পোস্ট শেয়ার',
  bookmark: 'পোস্ট সংরক্ষণ',
  post_published: 'নতুন পোস্ট',
  moderation: 'মডারেশন সতর্কতা',
  order: 'অর্ডার আপডেট',
  review: 'নতুন রিভিউ',
  payout: 'পেমেন্ট আপডেট',
  course: 'কোর্স আপডেট',
  job: 'নতুন সুযোগ',
  event: 'ইভেন্ট আপডেট',
  certificate: 'সার্টিফিকেট প্রস্তুত',
  group_invite: 'গ্রুপ আমন্ত্রণ',
  feedback: 'মতামত আপডেট',
};

function channelIdFor(kind: string, url: string): string {
  if (kind === 'message' || url.startsWith('/messages')) return 'bsdc_messenger';
  if (kind === 'order' || kind === 'review' || kind === 'payout') return 'bsdc_orders';
  if (
    kind === 'moderation' ||
    kind === 'certificate' ||
    kind === 'course' ||
    kind === 'job' ||
    kind === 'event'
  ) {
    return 'bsdc_verify_alerts';
  }
  if (
    kind === 'follow' ||
    kind === 'reaction' ||
    kind === 'comment' ||
    kind === 'reply' ||
    kind === 'mention' ||
    kind === 'mention_group' ||
    kind === 'bookmark' ||
    kind === 'share' ||
    kind === 'post_published' ||
    kind === 'group_invite' ||
    kind === 'feedback'
  ) {
    return 'bsdc_social';
  }
  return 'bsdc_general';
}

function buildWordsForGroup(rows: readonly FcmPendingRow[]) {
  const newest = rows[rows.length - 1]!;
  const en = newest.language === 'en';
  const kind = newest.kind || 'general';
  const label = (en ? NAMES_EN[kind] : NAMES_BN[kind]) ?? (en ? 'Notification' : 'বিজ্ঞপ্তি');
  const actor = newest.actor_name.trim();
  const preview = newest.body.replace(/\s+/g, ' ').trim().slice(0, 140);
  const url = newest.url.startsWith('/') ? newest.url : '/notifications';
  const topic = newest.conversation_id
    ? `c-${newest.conversation_id}`
    : newest.post_id
      ? `p-${newest.post_id}`
      : `n-${newest.notification_id}`;

  const title =
    kind === 'message' && actor
      ? rows.length > 1
        ? `${actor} (${rows.length}) · BSDC`
        : `${actor} · BSDC`
      : `${label} · BSDC`;
  const body = preview || (actor ? `${actor} — ${label}` : label);
  return {
    title,
    body,
    url,
    tag: `bsdc-${kind}-${topic}`,
    topic,
    kind,
    channelId: channelIdFor(kind, url),
    conversationId: newest.conversation_id ?? '',
    postId: newest.post_id ?? '',
    notificationId: newest.notification_id,
    actorName: actor,
  };
}

function classifyStatus(status: number, bodyText: string): 'sent' | 'dead' | 'invalid' | 'failed' {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404) return 'dead';
  if (status === 400) {
    const upper = bodyText.toUpperCase();
    if (upper.includes('UNREGISTERED')) return 'dead';
    if (upper.includes('INVALID_ARGUMENT') && upper.includes('REGISTRATION')) return 'invalid';
  }
  return 'failed';
}

/** Fallback FCM delivery executed by Pages Functions when Worker is unavailable. */
export async function fcmFallbackDispatch(
  env: FcmEnv,
  secret: string,
  limit: number,
): Promise<FcmFallbackResult> {
  const creds = resolveFcmCredentials(env);
  if (!creds) {
    return {
      configured: false,
      waiting: 0,
      devices: 0,
      sent: 0,
      dead: 0,
      invalid: 0,
      failed: 0,
      marked: 0,
    };
  }

  const pending = await rpc<FcmPendingRow[] | null>(env, 'fcm_pending_devices', {
    p_secret: secret,
    p_limit: limit,
    p_lookback_hours: 48,
  });
  const rows = Array.isArray(pending) ? pending : [];
  if (rows.length === 0) {
    return {
      configured: true,
      waiting: 0,
      devices: 0,
      sent: 0,
      dead: 0,
      invalid: 0,
      failed: 0,
      marked: 0,
    };
  }

  let accessToken: string;
  try {
    accessToken = await getOAuthAccessToken(creds);
  } catch {
    return {
      configured: true,
      waiting: rows.length,
      devices: 0,
      sent: 0,
      dead: 0,
      invalid: 0,
      failed: rows.length,
      marked: 0,
    };
  }

  const byToken = new Map<string, FcmPendingRow[]>();
  for (const row of rows) {
    if (typeof row.token !== 'string' || row.token.length < 20) continue;
    const list = byToken.get(row.token);
    if (list) list.push(row);
    else byToken.set(row.token, [row]);
  }

  const siteBase = (env.SITE_URL ?? 'https://www.bsdc.info.bd').replace(/\/+$/, '');
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(creds.projectId)}/messages:send`;

  const reached = new Set<string>();
  const dead = new Set<string>();
  const invalid = new Set<string>();
  let sent = 0;
  let failed = 0;

  for (const [token, deviceRows] of byToken.entries()) {
    const first = deviceRows[0]!;
    const byTopic = new Map<string, FcmPendingRow[]>();
    for (const row of deviceRows) {
      const topic = row.conversation_id
        ? `c-${row.conversation_id}`
        : row.post_id
          ? `p-${row.post_id}`
          : `n-${row.notification_id}`;
      const bucket = byTopic.get(topic);
      if (bucket) bucket.push(row);
      else byTopic.set(topic, [row]);
    }

    const groups =
      byTopic.size <= 4
        ? [...byTopic.values()].map((bucket) => ({
            rows: bucket,
            words: buildWordsForGroup(bucket),
          }))
        : [
            {
              rows: deviceRows,
              words: {
                title:
                  first.language === 'en'
                    ? `${deviceRows.length} new notifications · BSDC`
                    : `${deviceRows.length}টি নতুন বিজ্ঞপ্তি · BSDC`,
                body: first.actor_name.trim() || (first.language === 'en' ? 'Open BSDC' : 'বিএসডিসি খুলুন'),
                url: '/notifications',
                tag: 'bsdc-summary',
                topic: 'bsdc-summary',
                kind: 'general',
                channelId: 'bsdc_general',
                conversationId: '',
                postId: '',
                notificationId: deviceRows[deviceRows.length - 1]!.notification_id,
                actorName: '',
              },
            },
          ];

    for (const group of groups) {
      const w = group.words;
      const data: Record<string, string> = {
        url: w.url,
        path: w.url,
        tag: w.tag,
        topic: w.topic,
        title: w.title,
        body: w.body,
        icon: '/icons/icon-192.png',
        kind: w.kind,
        channel_id: w.channelId,
        sent_at: String(Date.now()),
        notification_id: w.notificationId,
      };
      if (w.actorName) data.actor_name = w.actorName;
      if (w.conversationId) data.conversation_id = w.conversationId;
      if (w.postId) data.post_id = w.postId;

      // Pure data-only HIGH priority payload for native Android devices.
      const message =
        first.platform === 'android'
          ? {
              token,
              data,
              android: { priority: 'HIGH', ttl: '86400s', direct_boot_ok: true },
            }
          : {
              token,
              notification: { title: w.title, body: w.body },
              data,
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  title: w.title,
                  body: w.body,
                  icon: `${siteBase}/icons/icon-192.png`,
                  badge: `${siteBase}/icons/maskable-512.png`,
                  tag: w.tag,
                },
                fcm_options: { link: `${siteBase}${w.url}` },
              },
              apns: {
                payload: {
                  aps: {
                    alert: { title: w.title, body: w.body },
                    'thread-id': w.topic,
                    sound: 'default',
                  },
                },
              },
            };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ message }),
        });
        const text = res.ok ? '' : await res.text().catch(() => '');
        const outcome = classifyStatus(res.status, text);
        if (outcome === 'sent') {
          sent += 1;
          for (const row of group.rows) reached.add(row.notification_id);
        } else if (outcome === 'dead') {
          dead.add(token);
          break;
        } else if (outcome === 'invalid') {
          invalid.add(token);
          break;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(
    [...dead].map((t) => rpc(env, 'fcm_kill_device', { p_secret: secret, p_token: t })),
  );
  await Promise.all(
    [...invalid].map((t) =>
      rpc(env, 'fcm_flag_invalid_device', { p_secret: secret, p_token: t }),
    ),
  );
  const reachedIds = [...reached];
  const marked =
    reachedIds.length > 0
      ? await rpc<number>(env, 'fcm_mark_devices', { p_secret: secret, p_ids: reachedIds })
      : 0;

  return {
    configured: true,
    waiting: rows.length,
    devices: byToken.size,
    sent,
    dead: dead.size,
    invalid: invalid.size,
    failed,
    marked: typeof marked === 'number' ? marked : 0,
  };
}
