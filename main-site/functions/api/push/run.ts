/**
 * Cloudflare Pages Function — POST /api/push/run
 *
 * The scheduler's single entry point on this deployment:
 *
 *   1. If `PUSH_WORKER_URL` is set, forward to the Worker's `POST /run` so
 *      devices receive RFC 8291 encrypted Web Push and high-priority FCM.
 *   2. Otherwise, or if the Worker does not answer, run both RFC 8291 encrypted
 *      Web Push (falling back to empty wake-up pokes if subscription keys are
 *      absent) and FCM HTTP v1 fallback delivery locally in this Pages Function.
 */
import {
  PUSH_TTL_SECONDS,
  encryptWebPushPayload,
  endpointOrigin,
  isDeadEndpointStatus,
  signVapidJwt,
  vapidAuthorizationHeader,
  vapidSubject,
} from '../../../src/lib/push/webpush';
import {
  buildWordsForGroup,
  fcmFallbackDispatch,
  resolveFcmCredentials,
  type FcmEnv,
  type FcmPendingRow,
} from '../../_fcm';
import { rpc } from '../../_rpc';

export interface PushEnv extends FcmEnv {
  PUSH_FLUSH_SECRET?: string;
  PUSH_WORKER_URL?: string;
  PUSH_DISABLE_LOCAL_FALLBACK?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
}

/** Where the Worker lives, or null when this deployment has not set one. */
export function workerUrl(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (raw.length === 0) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username.length > 0 || parsed.password.length > 0) return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Equal in the same time whether the strings match or not. */
export function sameSecret(presented: string, expected: string): boolean {
  if (expected.length === 0 || presented.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= presented.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

interface PendingRow {
  notification_id: string;
  uid: string;
  endpoint: string;
  created_at: string;
}

interface PendingDeviceRow {
  notification_id: string;
  uid: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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

export interface RunOutcome {
  path: 'worker' | 'local' | 'none';
  status: number;
  body: Record<string, unknown>;
  milliseconds: number;
  workerUnavailable?: boolean;
}

const MAX_BATCH = 500;
const CONCURRENCY = 8;
const WORKER_TIMEOUT_MS = 25_000;

async function sendWebPush(
  endpoint: string,
  keys: { privateKey: string; publicKey: string; subject: string },
  options: {
    p256dh?: string;
    auth?: string;
    payload?: Record<string, unknown>;
    topic?: string;
  } = {},
): Promise<'sent' | 'dead' | 'failed'> {
  const audience = endpointOrigin(endpoint);
  if (audience === null) return 'failed';

  const token = await signVapidJwt({
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    audience,
    subject: keys.subject,
    expiresInSeconds: 12 * 60 * 60,
  });
  if (token === null) return 'failed';

  const safeTopic = (options.topic ?? 'bsdc').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'bsdc';
  const headers: Record<string, string> = {
    authorization: vapidAuthorizationHeader(token, keys.publicKey),
    ttl: String(PUSH_TTL_SECONDS),
    urgency: 'high',
    topic: safeTopic,
  };

  let body: BodyInit = '';
  if (options.payload && options.p256dh && options.auth) {
    const encrypted = await encryptWebPushPayload({
      p256dh: options.p256dh,
      auth: options.auth,
      plaintext: JSON.stringify(options.payload).slice(0, 3_600),
    });
    if (encrypted !== null) {
      headers['content-encoding'] = encrypted.contentEncoding;
      headers['content-type'] = 'application/octet-stream';
      body = encrypted.body;
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body,
      headers,
    });
    if (isDeadEndpointStatus(response.status)) return 'dead';
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

async function inBatches<T>(
  items: readonly T[],
  size: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(run));
  }
}

function toFcmShape(row: PendingDeviceRow): FcmPendingRow {
  return {
    notification_id: row.notification_id,
    uid: row.uid,
    token: row.endpoint,
    platform: 'web',
    language: row.language,
    kind: row.kind,
    body: row.body,
    actor_name: row.actor_name,
    actor_avatar: row.actor_avatar,
    url: row.url,
    post_id: row.post_id,
    conversation_id: row.conversation_id,
    created_at: row.created_at,
  };
}

/** The in-function flush: RFC 8291 encrypted Web Push + FCM HTTP v1 fallback. */
async function runLocally(env: PushEnv, secret: string, limit: number): Promise<RunOutcome> {
  const started = Date.now();
  const privateKey = (env.PUSH_VAPID_PRIVATE_KEY ?? '').trim();
  const publicKey = (env.PUSH_VAPID_PUBLIC_KEY ?? '').trim();
  const hasVapid = privateKey.length > 0 && publicKey.length > 0;
  const hasFcm = resolveFcmCredentials(env) !== null;

  if (!hasVapid && !hasFcm) {
    return {
      path: 'local',
      status: 503,
      body: { error: 'neither vapid nor fcm credentials are configured on this deployment' },
      milliseconds: Date.now() - started,
    };
  }

  let webWaiting = 0;
  let webEndpoints = 0;
  let webSent = 0;
  let webDead = 0;
  let webFailed = 0;
  let webMarked = 0;
  let webPushError = false;

  if (hasVapid) {
    const keys = { privateKey, publicKey, subject: vapidSubject(env.PUSH_VAPID_SUBJECT ?? '') };
    const richRows = await rpc<PendingDeviceRow[]>(env, 'push_pending_devices', {
      p_secret: secret,
      p_limit: limit,
      p_lookback_hours: 72,
    });

    if (Array.isArray(richRows) && richRows.length > 0) {
      webWaiting = richRows.length;
      const byEndpoint = new Map<string, PendingDeviceRow[]>();
      for (const row of richRows) {
        const list = byEndpoint.get(row.endpoint);
        if (list) list.push(row);
        else byEndpoint.set(row.endpoint, [row]);
      }
      webEndpoints = byEndpoint.size;

      const deadEndpoints = new Set<string>();
      const reachedPairs: { id: string; endpoint: string }[] = [];
      let sentCount = 0;
      let failedCount = 0;

      await inBatches(
        [...byEndpoint.entries()],
        CONCURRENCY,
        async ([endpoint, rowsForEndpoint]) => {
          const latest = rowsForEndpoint[rowsForEndpoint.length - 1]!;
          const words = buildWordsForGroup(rowsForEndpoint.map(toFcmShape));
          const outcome = await sendWebPush(endpoint, keys, {
            p256dh: latest.p256dh,
            auth: latest.auth,
            topic: words.topic,
            payload: {
              title: words.title,
              body: words.body,
              url: words.url,
              tag: words.tag,
              icon: '/icons/icon-192.png',
              badge: '/icons/maskable-512.png',
            },
          });
          if (outcome === 'sent') {
            sentCount += 1;
            for (const row of rowsForEndpoint) {
              reachedPairs.push({ id: row.notification_id, endpoint });
            }
          } else if (outcome === 'dead') {
            deadEndpoints.add(endpoint);
          } else {
            failedCount += 1;
          }
        },
      );

      await Promise.all(
        [...deadEndpoints].map((endpoint) =>
          rpc(env, 'push_kill', { p_secret: secret, p_endpoint: endpoint }),
        ),
      );

      let marked: number | null = 0;
      if (failedCount > 0 || richRows.length >= limit) {
        if (reachedPairs.length > 0) {
          const perDevice = await rpc<number>(env, 'push_mark_device_deliveries', {
            p_secret: secret,
            p_pairs: reachedPairs,
          });
          marked =
            typeof perDevice === 'number'
              ? perDevice
              : await rpc<number>(env, 'push_mark', {
                  p_secret: secret,
                  p_ids: [...new Set(reachedPairs.map((p) => p.id))],
                });
        }
      } else if (reachedPairs.length > 0 || deadEndpoints.size > 0) {
        const ids = [
          ...new Set(
            richRows
              .filter(
                (r) =>
                  deadEndpoints.has(r.endpoint) ||
                  reachedPairs.some((p) => p.id === r.notification_id && p.endpoint === r.endpoint),
              )
              .map((r) => r.notification_id),
          ),
        ];
        if (ids.length > 0) {
          marked = await rpc<number>(env, 'push_mark', { p_secret: secret, p_ids: ids });
        }
      }

      webSent = sentCount;
      webDead = deadEndpoints.size;
      webFailed = failedCount;
      webMarked = typeof marked === 'number' ? marked : 0;
    } else if (richRows === null) {
      // Backwards-compatible fallback to `push_pending` if `push_pending_devices` is unavailable.
      const pending = await rpc<PendingRow[]>(env, 'push_pending', {
        p_secret: secret,
        p_limit: limit,
      });
      if (pending === null) {
        webPushError = true;
      } else if (pending.length > 0) {
        webWaiting = pending.length;
        const endpoints = [...new Set(pending.map((row) => row.endpoint))];
        webEndpoints = endpoints.length;
        const outcomes = new Map<string, 'sent' | 'dead' | 'failed'>();
        await inBatches(endpoints, CONCURRENCY, async (endpoint) => {
          outcomes.set(endpoint, await sendWebPush(endpoint, keys));
        });

        const dead = [...outcomes.entries()].filter(([, outcome]) => outcome === 'dead');
        await Promise.all(
          dead.map(([endpoint]) =>
            rpc(env, 'push_kill', { p_secret: secret, p_endpoint: endpoint }),
          ),
        );

        const reachedSent = pending.filter((row) => outcomes.get(row.endpoint) === 'sent');
        const reachedAll = pending.filter((row) => outcomes.get(row.endpoint) !== 'failed');
        const webFailedCount = [...outcomes.values()].filter((o) => o === 'failed').length;
        let marked: number | null = 0;
        if (webFailedCount > 0 || pending.length >= limit) {
          if (reachedSent.length > 0) {
            const perDevice = await rpc<number>(env, 'push_mark_device_deliveries', {
              p_secret: secret,
              p_pairs: reachedSent.map((row) => ({
                id: row.notification_id,
                endpoint: row.endpoint,
              })),
            });
            marked =
              typeof perDevice === 'number'
                ? perDevice
                : await rpc<number>(env, 'push_mark', {
                    p_secret: secret,
                    p_ids: [...new Set(reachedSent.map((row) => row.notification_id))],
                  });
          }
        } else if (reachedAll.length > 0) {
          const ids = [...new Set(reachedAll.map((row) => row.notification_id))];
          marked = await rpc<number>(env, 'push_mark', { p_secret: secret, p_ids: ids });
        }

        webSent = [...outcomes.values()].filter((o) => o === 'sent').length;
        webDead = dead.length;
        webFailed = webFailedCount;
        webMarked = typeof marked === 'number' ? marked : 0;
      }
    }
  }

  const fcm = await fcmFallbackDispatch(env, secret, limit);

  if (webPushError && !hasFcm) {
    return {
      path: 'local',
      status: 502,
      body: { error: 'the database did not answer' },
      milliseconds: Date.now() - started,
    };
  }

  return {
    path: 'local',
    status: 200,
    body: {
      waiting: webWaiting + fcm.waiting,
      endpoints: webEndpoints + fcm.devices,
      sent: webSent + fcm.sent,
      dead: webDead + fcm.dead,
      failed: webFailed + fcm.failed,
      marked: webMarked + fcm.marked,
      fcm,
    },
    milliseconds: Date.now() - started,
  };
}

/** The Worker path: ask it to run, and take its answer as-is when it succeeds. */
async function runAtWorker(
  root: string,
  secret: string,
  limit: number,
  timeoutMs: number,
): Promise<RunOutcome | null> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${root}/run?limit=${limit}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'cache-control': 'no-store',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: Record<string, unknown> = { raw: text };
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch {
      // Non-JSON response triggers fallback below.
    }
    if (!response.ok) return null;
    return { path: 'worker', status: 200, body, milliseconds: Date.now() - started };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function executePushRun(
  env: PushEnv,
  options: { limit?: number; fallbackWorkerUrl?: string; workerTimeoutMs?: number } = {},
): Promise<RunOutcome> {
  const started = Date.now();
  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
  const limit = Math.min(Math.max(1, Math.trunc(options.limit ?? 200)), MAX_BATCH);
  const configuredRoot = workerUrl(env.PUSH_WORKER_URL);
  const root = configuredRoot ?? workerUrl(options.fallbackWorkerUrl);

  if (root !== null) {
    const viaWorker = await runAtWorker(
      root,
      secret,
      limit,
      options.workerTimeoutMs ?? WORKER_TIMEOUT_MS,
    );
    if (viaWorker !== null) return viaWorker;
  }

  if ((env.PUSH_DISABLE_LOCAL_FALLBACK ?? '').trim() === '1') {
    return {
      path: 'none',
      status: 502,
      body: {
        error:
          root === null
            ? 'no push worker is configured and the local fallback is disabled'
            : 'the push worker did not answer and the local fallback is disabled',
      },
      milliseconds: Date.now() - started,
    };
  }

  const local = await runLocally(env, secret, limit);
  return {
    ...local,
    ...(configuredRoot !== null ? { workerUnavailable: true } : {}),
  };
}

export const onRequestPost: PagesFunction<PushEnv> = async (context) => {
  const { env, request } = context;

  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
  if (secret.length < 32) {
    return json({ error: 'push is not configured on this deployment' }, 503);
  }

  const presented = bearer(request);
  if (presented === null || !sameSecret(presented, secret)) {
    return json({ error: 'forbidden' }, 403);
  }

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), MAX_BATCH) : 200;

  const result = await executePushRun(env, { limit });
  return json(
    {
      ...result.body,
      path: result.path,
      ...(result.workerUnavailable ? { workerUnavailable: true } : {}),
      milliseconds: result.milliseconds,
    },
    result.status,
  );
};

export const onRequestGet: PagesFunction<PushEnv> = () =>
  json({ error: 'method not allowed' }, 405);
