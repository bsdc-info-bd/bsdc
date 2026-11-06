/**
 * Cloudflare Pages Function — POST /api/push/run
 *
 * The scheduler's single entry point on this deployment. It exists so that
 * *where* push happens is a deployment decision rather than a fork in the code:
 *
 *   1. If `PUSH_WORKER_URL` is set, forward to the Worker's `POST /run`. The
 *      Worker sends the words — an RFC 8291 encrypted payload carrying the title,
 *      the body and the path to open — so a phone whose browser is closed shows
 *      the notification without waking the app first.
 *   2. Otherwise, or if the Worker does not answer, run the flush in this
 *      function. That path sends an empty wake-up and the service worker asks
 *      what it missed. It costs one round trip and it is the reason push still
 *      works on a deployment where the Worker has not been deployed, has been
 *      rolled back, or is having a bad minute at Cloudflare.
 *
 * Both paths are authorised by the same `PUSH_FLUSH_SECRET`, and the database
 * checks that secret itself, so a scheduler reaching the wrong one is refused
 * rather than trusted.
 *
 * Why a scheduler is needed at all: a notification is written by a member's
 * action, and the member is not going to wait for their own action to be
 * delivered. Something that is not a browser has to look for what is waiting, on
 * a clock. A Worker cron is that clock (see `push-worker/wrangler.toml`, every
 * minute); this endpoint is the other half of the pair, so an operator can also
 * make it happen now.
 *
 * Secrets (Cloudflare Pages encrypted environment variables):
 *   PUSH_FLUSH_SECRET   the same string stored in bsdc.push_settings (required)
 *   PUSH_WORKER_URL     e.g. https://bsdc-push.example.workers.dev (optional)
 *   PUSH_DISABLE_LOCAL_FALLBACK  set to "1" to refuse to send from here at all
 */
import {
  PUSH_TTL_SECONDS,
  endpointOrigin,
  isDeadEndpointStatus,
  signVapidJwt,
  vapidAuthorizationHeader,
  vapidSubject,
} from '../../../src/lib/push/webpush';
import { rpc, type RpcEnv } from '../../_rpc';

interface PushEnv extends RpcEnv {
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
    // The forward carries the flush secret. Refusing anything but https keeps a
    // typo in a Pages variable from sending it in the clear.
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

interface RunOutcome {
  /** Which half did the work. */
  path: 'worker' | 'local' | 'none';
  status: number;
  body: unknown;
  milliseconds: number;
}

const MAX_BATCH = 500;
const CONCURRENCY = 8;
/** A Worker that has not answered in this long is not going to help this minute. */
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
      // The one case the specification sends unencrypted. The service worker
      // asks `/api/push/content` for the words.
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
    // Unreachable is not dead. The row stays unmarked and is retried.
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

/** The in-function flush: an empty wake-up per device. The fallback path. */
async function runLocally(env: PushEnv, secret: string, limit: number): Promise<RunOutcome> {
  const started = Date.now();
  const privateKey = env.PUSH_VAPID_PRIVATE_KEY ?? '';
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY ?? '';
  if (privateKey.length === 0 || publicKey.length === 0) {
    return {
      path: 'local',
      status: 503,
      body: { error: 'the vapid keypair is not configured on this deployment' },
      milliseconds: Date.now() - started,
    };
  }
  const keys = { privateKey, publicKey, subject: vapidSubject(env.PUSH_VAPID_SUBJECT ?? '') };

  const pending = await rpc<PendingRow[]>(env, 'push_pending', {
    p_secret: secret,
    p_limit: limit,
  });
  if (pending === null) {
    return {
      path: 'local',
      status: 502,
      body: { error: 'the database did not answer' },
      milliseconds: Date.now() - started,
    };
  }
  if (pending.length === 0) {
    return {
      path: 'local',
      status: 200,
      body: { waiting: 0, endpoints: 0, sent: 0, dead: 0, failed: 0, marked: 0 },
      milliseconds: Date.now() - started,
    };
  }

  const endpoints = [...new Set(pending.map((row) => row.endpoint))];
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

  return {
    path: 'local',
    status: 200,
    body: {
      waiting: pending.length,
      endpoints: endpoints.length,
      sent: [...outcomes.values()].filter((outcome) => outcome === 'sent').length,
      dead: dead.length,
      failed: [...outcomes.values()].filter((outcome) => outcome === 'failed').length,
      marked: typeof marked === 'number' ? marked : 0,
    },
    milliseconds: Date.now() - started,
  };
}

/** The Worker path: ask it to run, and take its answer as-is when it succeeds. */
async function runAtWorker(
  root: string,
  secret: string,
  limit: number,
): Promise<RunOutcome | null> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const response = await fetch(`${root}/run?limit=${limit}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        // Nothing cached, and nothing a proxy should sit in front of.
        'cache-control': 'no-store',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      // A Worker that answered with something that is not JSON has failed in a
      // way this function cannot repair, so the fallback runs instead.
    }
    if (!response.ok) return null;
    return { path: 'worker', status: 200, body, milliseconds: Date.now() - started };
  } catch {
    // Timeout, DNS, Cloudflare itself. The fallback exists for exactly this.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestPost: PagesFunction<PushEnv> = async (context) => {
  const started = Date.now();
  const { env, request } = context;

  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
  if (secret.length < 32) {
    // A configuration answer, not a rejection: there is no password to look for.
    return json({ error: 'push is not configured on this deployment' }, 503);
  }

  const presented = bearer(request);
  if (presented === null || !sameSecret(presented, secret)) {
    return json({ error: 'forbidden' }, 403);
  }

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), MAX_BATCH) : 200;

  const root = workerUrl(env.PUSH_WORKER_URL);
  if (root !== null) {
    const viaWorker = await runAtWorker(root, secret, limit);
    if (viaWorker !== null) {
      return json({ ...(viaWorker.body as object), path: 'worker' }, 200);
    }
  }

  if ((env.PUSH_DISABLE_LOCAL_FALLBACK ?? '').trim() === '1') {
    return json(
      {
        error:
          root === null
            ? 'no push worker is configured and the local fallback is disabled'
            : 'the push worker did not answer and the local fallback is disabled',
        path: 'none',
        milliseconds: Date.now() - started,
      },
      502,
    );
  }

  const local = await runLocally(env, secret, limit);
  return json(
    {
      ...(local.body as object),
      path: 'local',
      ...(root !== null ? { workerUnavailable: true } : {}),
      milliseconds: Date.now() - started,
    },
    local.status,
  );
};

export const onRequestGet: PagesFunction<PushEnv> = () =>
  json({ error: 'method not allowed' }, 405);
