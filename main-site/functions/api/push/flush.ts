/**
 * Cloudflare Pages Function — POST /api/push/flush
 *
 * The delivery half of push. Everything a member does already writes a row into
 * `notifications`; this hands those rows to the devices that asked to be woken,
 * including devices whose browser is closed, which is the only reason any of it
 * matters.
 *
 * It is called on a schedule, not by a browser. Pages Functions have no cron
 * handler of their own, so a Cloudflare Worker with a cron trigger — or any
 * scheduler at all — posts here with the secret in an `Authorization: Bearer`
 * header. Five minutes is a good interval: often enough that a notification
 * feels immediate, rarely enough that a member with nothing waiting is never
 * woken at all.
 *
 * The request to a push service carries no body. A payload would have to be
 * encrypted for that one subscription, and one wake-up that asks what it missed
 * beats nine encrypted buzzes, so the worker asks `/api/push/content` when it
 * wakes and writes the notification there. What is signed here is only the
 * VAPID token that proves this site is the one that asked.
 *
 * This function never holds the Supabase service key, like every function in
 * this directory: the database decides who may read another member's inbox, and
 * it decides by the secret below.
 *
 * Secrets (Cloudflare Pages encrypted environment variables):
 *   PUSH_FLUSH_SECRET       the same string stored in bsdc.push_settings
 *   PUSH_VAPID_PRIVATE_KEY  PKCS#8 DER of the P-256 key, base64url
 *   PUSH_VAPID_PUBLIC_KEY   the uncompressed point, base64url — the `k=` half
 *   PUSH_VAPID_SUBJECT      optional contact address, defaults to admin@bsdc.info.bd
 *
 * `npm run push:keys` generates all four and prints where each one goes.
 */
import { rpc, type RpcEnv } from '../../_rpc';
import {
  PUSH_TTL_SECONDS,
  endpointOrigin,
  isDeadEndpointStatus,
  signVapidJwt,
  vapidAuthorizationHeader,
  vapidSubject,
} from '../../../src/lib/push/webpush';

interface PushEnv extends RpcEnv {
  PUSH_FLUSH_SECRET?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
}

interface PendingRow {
  notification_id: string;
  uid: string;
  endpoint: string;
  created_at: string;
}

/** How many notifications one run will pick up. The database caps it too. */
const MAX_BATCH = 500;
/** How many push services this function talks to at once. */
const CONCURRENCY = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Equal in the same time whether the strings match or not. */
function sameSecret(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
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
      // An empty body is the one case the specification sends unencrypted.
      body: '',
      headers: {
        authorization: vapidAuthorizationHeader(token, keys.publicKey),
        ttl: String(PUSH_TTL_SECONDS),
        urgency: 'normal',
        topic: 'bsdc',
      },
    });
    if (isDeadEndpointStatus(response.status)) return 'dead';
    return response.ok ? 'sent' : 'failed';
  } catch {
    // A push service that cannot be reached is not a dead subscription. Leaving
    // the notification unmarked means the next run tries again.
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

export const onRequestPost: PagesFunction<PushEnv> = async (context) => {
  const started = Date.now();
  const { env, request } = context;

  const secret = env.PUSH_FLUSH_SECRET ?? '';
  if (secret.length < 32) {
    return json({ error: 'push is not configured on this deployment' }, 503);
  }

  const presented = bearer(request);
  if (presented === null || !sameSecret(presented, secret)) {
    return json({ error: 'forbidden' }, 403);
  }

  const privateKey = env.PUSH_VAPID_PRIVATE_KEY ?? '';
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY ?? '';
  if (privateKey.length === 0 || publicKey.length === 0) {
    return json({ error: 'the vapid keypair is not configured on this deployment' }, 503);
  }
  const keys = {
    privateKey,
    publicKey,
    subject: vapidSubject(env.PUSH_VAPID_SUBJECT ?? ''),
  };

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(1, requested), MAX_BATCH)
    : MAX_BATCH / 2;

  const pending = await rpc<PendingRow[]>(env, 'push_pending', {
    p_secret: secret,
    p_limit: limit,
  });
  if (pending === null) return json({ error: 'the database did not answer' }, 502);
  if (pending.length === 0) {
    return json({
      waiting: 0,
      endpoints: 0,
      sent: 0,
      dead: 0,
      failed: 0,
      marked: 0,
      milliseconds: Date.now() - started,
    });
  }

  // One wake-up per device, however many notifications are waiting for it: the
  // device asks what it missed and is told all of it at once.
  const endpoints = [...new Set(pending.map((row) => row.endpoint))];
  const outcomes = new Map<string, 'sent' | 'dead' | 'failed'>();
  await inBatches(endpoints, CONCURRENCY, async (endpoint) => {
    outcomes.set(endpoint, await sendOne(endpoint, keys));
  });

  const dead = [...outcomes.entries()].filter(([, outcome]) => outcome === 'dead');
  await Promise.all(
    dead.map(([endpoint]) => rpc(env, 'push_kill', { p_secret: secret, p_endpoint: endpoint })),
  );

  // Marked only where the device was reached. A notification whose device was
  // merely unreachable stays waiting and is tried again by the next run.
  const reached = pending.filter((row) => outcomes.get(row.endpoint) !== 'failed');
  const ids = [...new Set(reached.map((row) => row.notification_id))];
  const marked =
    ids.length > 0 ? await rpc<number>(env, 'push_mark', { p_secret: secret, p_ids: ids }) : 0;

  return json({
    waiting: pending.length,
    endpoints: endpoints.length,
    sent: [...outcomes.values()].filter((outcome) => outcome === 'sent').length,
    dead: dead.length,
    failed: [...outcomes.values()].filter((outcome) => outcome === 'failed').length,
    marked: typeof marked === 'number' ? marked : 0,
    milliseconds: Date.now() - started,
  });
};

export const onRequestGet: PagesFunction<PushEnv> = () =>
  json({ error: 'method not allowed' }, 405);
