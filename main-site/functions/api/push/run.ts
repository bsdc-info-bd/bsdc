/**
 * Cloudflare Pages Function — POST /api/push/run
 *
 * The scheduler's single entry point on this deployment:
 *
 *   1. If `PUSH_WORKER_URL` is set, forward to the Worker's `POST /run` so
 *      devices receive RFC 8291 encrypted Web Push and high-priority FCM.
 *   2. Otherwise, or if the Worker does not answer, run both Web Push and
 *      FCM HTTP v1 fallback delivery locally in this Pages Function.
 */
import {
  PUSH_TTL_SECONDS,
  endpointOrigin,
  isDeadEndpointStatus,
  signVapidJwt,
  vapidAuthorizationHeader,
  vapidSubject,
} from '../../../src/lib/push/webpush';
import { fcmFallbackDispatch, resolveFcmCredentials, type FcmEnv } from '../../_fcm';
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

async function sendOne(
  endpoint: string,
  keys: { privateKey: string; publicKey: string; subject: string },
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

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: '',
      headers: {
        authorization: vapidAuthorizationHeader(token, keys.publicKey),
        ttl: String(PUSH_TTL_SECONDS),
        urgency: 'high',
        topic: 'bsdc',
      },
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

/** The in-function flush: empty Web Push wake-ups + FCM HTTP v1 fallback. */
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
        outcomes.set(endpoint, await sendOne(endpoint, keys));
      });

      const dead = [...outcomes.entries()].filter(([, outcome]) => outcome === 'dead');
      await Promise.all(
        dead.map(([endpoint]) => rpc(env, 'push_kill', { p_secret: secret, p_endpoint: endpoint })),
      );

      const reached = pending.filter((row) => outcomes.get(row.endpoint) !== 'failed');
      const ids = [...new Set(reached.map((row) => row.notification_id))];
      const marked =
        ids.length > 0 ? await rpc<number>(env, 'push_mark', { p_secret: secret, p_ids: ids }) : 0;

      webSent = [...outcomes.values()].filter((o) => o === 'sent').length;
      webDead = dead.length;
      webFailed = [...outcomes.values()].filter((o) => o === 'failed').length;
      webMarked = typeof marked === 'number' ? marked : 0;
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
