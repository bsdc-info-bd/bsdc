/**
 * BSDC push delivery worker.
 *
 * ## What it is
 *
 * A Cloudflare Worker, on the free plan, that is the reason a notification
 * arrives on a phone whose browser is closed. Three triggers, one engine:
 *
 *   - `scheduled` — a cron every minute. This is the real path: a member likes a
 *     post, the database writes a notification row, and within a minute the
 *     device that is allowed to know about it is woken with the words already
 *     encrypted into the push.
 *   - `queue` — an optional Cloudflare Queue for bursts. The cron is enough for
 *     this platform's volume; the queue exists so a viral post cannot make one
 *     minute's run longer than a minute.
 *   - `fetch` — an authenticated endpoint, for an operator who needs to flush
 *     now (`POST /run`) or check the deployment (`GET /health`), and a
 *     Cloudflare-friendly `POST /` that a Pages Function can call.
 *
 * ## Why it exists twice
 *
 * `main-site/functions/api/push/flush.ts` already wakes devices, and it is kept:
 * it is a Pages Function, so it runs on the same deployment as the site and is
 * the fallback if this worker is ever down. It sends an *empty* wake-up, so the
 * service worker has to ask what it missed. That costs a round trip and it means
 * the notification is written by the browser, not by the sender.
 *
 * This worker sends the *words*: an RFC 8291 encrypted payload with the title,
 * the body, the icon and the path to open already in it. The device shows it
 * without a network request, which is the difference between a notification in
 * under a second and one in however long the phone's radio takes to wake.
 *
 * ## What it never does
 *
 * It never holds a service key; every database call is a secret-gated function.
 * It never logs a subscription endpoint, a payload or a token. It never sends to
 * a device the database did not name for that notification, which is what stops
 * a bug here from becoming a leak there.
 *
 * ## Free tier
 *
 * One cron a minute is 1,440 invocations a day, well inside the Workers free
 * allowance, and each run exits in milliseconds when nothing is waiting. The
 * work is bounded per run so a backlog is drained over several minutes rather
 * than by one request that exceeds the subrequest limit.
 */
import { callRpc, DatabaseUnavailable, type DeviceRow, type FcmDeviceRow } from './api';
import { deliver, shouldRetry, type DeliveryKeys, type DeliveryOutcome } from './deliver';
import { adminOrigins, fcmCredentials, siteOrigin, vapidSubject, type Env } from './env';
import { getFcmAccessToken, sendFcmNotification } from './fcm';
import {
  summarise,
  wordsFor,
  cleanPreview,
  type NotificationKind,
  type NotificationSource,
} from './notifications';

export interface PushMessage {
  /** What to do. `flush` is the only one that sends. */
  type: 'flush';
  /** Cap on notifications picked up in this run. */
  limit?: number;
  /** Only send notifications created before this ISO timestamp (for replay). */
  before?: string;
}

/** The most one run will pick up. A backlog drains over several runs. */
const MAX_PER_RUN = 400;
/** How many push services are talked to at once. */
const CONCURRENCY = 10;
/** How far back a notification is worth waking somebody for. */
const LOOKBACK_HOURS = 72;

interface RunStats {
  waiting: number;
  devices: number;
  sent: number;
  dead: number;
  invalid: number;
  unauthorized: number;
  retry: number;
  failed: number;
  marked: number;
  skipped: number;
  milliseconds: number;
}

function emptyStats(): RunStats {
  return {
    waiting: 0,
    devices: 0,
    sent: 0,
    dead: 0,
    invalid: 0,
    unauthorized: 0,
    retry: 0,
    failed: 0,
    marked: 0,
    skipped: 0,
    milliseconds: 0,
  };
}

function json(body: unknown, status = 200): Response {
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

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

/** The number of notifications this run may pick up. */
export function runLimit(requested: unknown): number {
  const value =
    typeof requested === 'number' ? requested : Number.parseInt(String(requested ?? ''), 10);
  if (!Number.isFinite(value)) return MAX_PER_RUN / 2;
  return Math.min(Math.max(1, Math.trunc(value)), MAX_PER_RUN);
}

/** Runs work in bounded waves, so a subrequest limit is never approached. */
async function inWaves<T>(
  items: readonly T[],
  size: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(run));
  }
}

/** The signing material, or null when the deployment is not configured for it. */
export function deliveryKeys(env: Env): DeliveryKeys | null {
  const privateKey = (env.PUSH_VAPID_PRIVATE_KEY ?? '').trim();
  const publicKey = (env.PUSH_VAPID_PUBLIC_KEY ?? '').trim();
  if (privateKey.length === 0 || publicKey.length === 0) return null;
  return { privateKey, publicKey, subject: vapidSubject(env.PUSH_VAPID_SUBJECT) };
}

/** One notification row as the words module wants it. */
export function toSource(
  row: Pick<
    DeviceRow,
    'notification_id' | 'kind' | 'actor_name' | 'body' | 'url' | 'conversation_id' | 'post_id'
  >,
  language: 'bn' | 'en',
): NotificationSource {
  return {
    id: row.notification_id,
    kind: row.kind as NotificationKind,
    actorName: row.actor_name,
    preview: cleanPreview(row.body),
    url: row.url,
    language,
    ...(row.conversation_id !== null ? { conversationId: row.conversation_id } : {}),
    ...(row.post_id !== null ? { postId: row.post_id } : {}),
  };
}

export interface PlannedPush<T extends DeviceRow | FcmDeviceRow> {
  words: NonNullable<ReturnType<typeof summarise>>;
  rows: T[];
}

/**
 * Groups pending rows per device by topic (`c-<conv>`, `p-<post>`, `n-<id>`).
 * Up to 4 distinct topics stay separate so a direct message keeps its thread
 * URL, messenger channel, and inline reply action instead of being swallowed
 * into a low-priority generic summary beside a post like or reaction. Five or
 * more topics collapse cleanly into a single digest notification.
 */
export function planDeviceDeliveries<
  T extends Pick<
    DeviceRow,
    'notification_id' | 'kind' | 'actor_name' | 'body' | 'url' | 'conversation_id' | 'post_id'
  >,
>(rows: readonly T[], language: 'bn' | 'en'): PlannedPush<T & DeviceRow>[] {
  if (rows.length === 0) return [];
  const byTopic = new Map<string, { rows: T[]; sources: NotificationSource[] }>();
  for (const row of rows) {
    const src = toSource(row, language);
    const topic = wordsFor(src).topic;
    const bucket = byTopic.get(topic);
    if (bucket === undefined) {
      byTopic.set(topic, { rows: [row], sources: [src] });
    } else {
      bucket.rows.push(row);
      bucket.sources.push(src);
    }
  }

  if (byTopic.size <= 4) {
    const out: PlannedPush<T & DeviceRow>[] = [];
    for (const bucket of byTopic.values()) {
      const words = summarise(bucket.sources, language);
      if (words !== null) out.push({ words, rows: bucket.rows as (T & DeviceRow)[] });
    }
    return out;
  }

  const allSources = rows.map((row) => toSource(row, language));
  const summary = summarise(allSources, language);
  return summary === null ? [] : [{ words: summary, rows: rows as (T & DeviceRow)[] }];
}

/**
 * The engine.
 *
 * One run reads what is pending for Web Push (`push_pending_devices`) and
 * Firebase Cloud Messaging (`fcm_pending_devices`), groups per device by topic,
 * sends encrypted Web Push and high-priority FCM notifications, and marks what
 * was delivered.
 */
export async function runPush(env: Env, options: { limit?: number } = {}): Promise<RunStats> {
  const started = Date.now();
  const stats = emptyStats();
  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();

  if (secret.length < 32) {
    throw new DatabaseUnavailable(503, 'PUSH_FLUSH_SECRET is not set to a long enough value');
  }
  const keys = deliveryKeys(env);
  const fcm = fcmCredentials(env);
  if (keys === null && fcm === null) {
    throw new DatabaseUnavailable(503, 'the VAPID key pair is not configured');
  }

  const limit = runLimit(options.limit);

  // ---------------------------------------------------------------- Web Push
  if (keys !== null) {
    const pending = await callRpc<DeviceRow[] | null>(env, 'push_pending_devices', {
      p_secret: secret,
      p_limit: limit,
      p_lookback_hours: LOOKBACK_HOURS,
    });

    const rows = Array.isArray(pending) ? pending : [];
    stats.waiting += rows.length;
    if (rows.length > 0) {
      const byEndpoint = new Map<string, DeviceRow[]>();
      for (const row of rows) {
        if (typeof row.endpoint !== 'string' || row.endpoint.length < 20) {
          stats.skipped += 1;
          continue;
        }
        const list = byEndpoint.get(row.endpoint);
        if (list === undefined) byEndpoint.set(row.endpoint, [row]);
        else list.push(row);
      }
      stats.devices += byEndpoint.size;

      const reached = new Set<string>();
      const dead = new Set<string>();
      const invalid = new Set<string>();

      await inWaves([...byEndpoint.entries()], CONCURRENCY, async ([endpoint, deviceRows]) => {
        const first = deviceRows[0];
        if (first === undefined) return;
        const language: 'bn' | 'en' = first.language === 'en' ? 'en' : 'bn';
        const plans = planDeviceDeliveries(deviceRows, language);
        if (plans.length === 0) {
          stats.skipped += deviceRows.length;
          return;
        }

        for (const plan of plans) {
          const { words } = plan;
          const payload = {
            title: words.title,
            body: words.body,
            url: words.url,
            tag: words.tag,
            icon: '/icons/icon-192.png',
            badge: '/icons/maskable-512.png',
            ts: Date.now(),
          };

          const outcome: DeliveryOutcome = await deliver({
            target: { endpoint, p256dh: first.p256dh ?? '', auth: first.auth ?? '' },
            keys,
            payload,
            topic: words.topic,
            urgency: plans.length > 1 ? 'normal' : 'high',
          });

          switch (outcome) {
            case 'sent':
              stats.sent += 1;
              for (const row of plan.rows) reached.add(row.notification_id);
              break;
            case 'dead':
              stats.dead += 1;
              dead.add(endpoint);
              return;
            case 'invalid':
              stats.invalid += 1;
              invalid.add(endpoint);
              return;
            case 'unauthorized':
              stats.unauthorized += 1;
              break;
            case 'retry':
              stats.retry += 1;
              break;
            default:
              stats.failed += 1;
              break;
          }

          if (shouldRetry(outcome)) return;
        }
      });

      await Promise.all(
        [...dead].map((endpoint) =>
          callRpc(env, 'push_kill_device', { p_secret: secret, p_endpoint: endpoint }).catch(
            () => null,
          ),
        ),
      );

      const ids = [...reached];
      if (ids.length > 0) {
        const marked = await callRpc<number>(env, 'push_mark_devices', {
          p_secret: secret,
          p_ids: ids,
        });
        stats.marked += typeof marked === 'number' ? marked : 0;
      }

      await Promise.all(
        [...invalid].map((endpoint) =>
          callRpc(env, 'push_flag_invalid_device', {
            p_secret: secret,
            p_endpoint: endpoint,
          }).catch(() => null),
        ),
      );
    }
  }

  // ----------------------------------------------------------- FCM HTTP v1
  if (fcm !== null) {
    let fcmRows: FcmDeviceRow[] = [];
    try {
      const pendingFcm = await callRpc<FcmDeviceRow[] | null>(env, 'fcm_pending_devices', {
        p_secret: secret,
        p_limit: limit,
        p_lookback_hours: LOOKBACK_HOURS,
      });
      if (Array.isArray(pendingFcm)) fcmRows = pendingFcm;
    } catch (error) {
      // A database that has not had 0085 applied yet answers 404 for
      // fcm_pending_devices; keep Web Push working when VAPID is configured.
      if (!(error instanceof DatabaseUnavailable && error.status === 404) && keys === null) {
        throw error;
      }
    }

    stats.waiting += fcmRows.length;
    if (fcmRows.length > 0) {
      const byToken = new Map<string, FcmDeviceRow[]>();
      for (const row of fcmRows) {
        if (typeof row.token !== 'string' || row.token.length < 20) {
          stats.skipped += 1;
          continue;
        }
        const list = byToken.get(row.token);
        if (list === undefined) byToken.set(row.token, [row]);
        else list.push(row);
      }
      stats.devices += byToken.size;

      let accessToken: string | undefined;
      try {
        accessToken = await getFcmAccessToken(fcm);
      } catch {
        accessToken = undefined;
      }

      const fcmReached = new Set<string>();
      const fcmDead = new Set<string>();
      const fcmInvalid = new Set<string>();
      const siteUrl = siteOrigin(env.SITE_URL);

      await inWaves([...byToken.entries()], CONCURRENCY, async ([token, deviceRows]) => {
        const first = deviceRows[0];
        if (first === undefined) return;
        const language: 'bn' | 'en' = first.language === 'en' ? 'en' : 'bn';
        const plans = planDeviceDeliveries(deviceRows, language);
        if (plans.length === 0) {
          stats.skipped += deviceRows.length;
          return;
        }

        for (const plan of plans) {
          const newest = plan.rows[plan.rows.length - 1] ?? first;
          const outcome =
            accessToken === undefined
              ? ('unauthorized' as const)
              : await sendFcmNotification({
                  credentials: fcm,
                  token,
                  platform: first.platform,
                  words: plan.words,
                  siteUrl,
                  urgency:
                    first.platform === 'android' ? 'high' : plans.length > 1 ? 'normal' : 'high',
                  notificationId: newest.notification_id,
                  actorName: newest.actor_name,
                  ...(plan.words.conversationId
                    ? { conversationId: plan.words.conversationId }
                    : newest.conversation_id
                      ? { conversationId: newest.conversation_id }
                      : {}),
                  ...(newest.post_id ? { postId: newest.post_id } : {}),
                  accessToken,
                });

          switch (outcome) {
            case 'sent':
              stats.sent += 1;
              for (const row of plan.rows) fcmReached.add(row.notification_id);
              break;
            case 'dead':
              stats.dead += 1;
              fcmDead.add(token);
              return;
            case 'invalid':
              stats.invalid += 1;
              fcmInvalid.add(token);
              return;
            case 'unauthorized':
              stats.unauthorized += 1;
              return;
            case 'retry':
              stats.retry += 1;
              break;
            default:
              stats.failed += 1;
              break;
          }
        }
      });

      await Promise.all(
        [...fcmDead].map((token) =>
          callRpc(env, 'fcm_kill_device', { p_secret: secret, p_token: token }).catch(() => null),
        ),
      );

      const fcmIds = [...fcmReached];
      if (fcmIds.length > 0) {
        const marked = await callRpc<number>(env, 'fcm_mark_devices', {
          p_secret: secret,
          p_ids: fcmIds,
        });
        stats.marked += typeof marked === 'number' ? marked : 0;
      }

      await Promise.all(
        [...fcmInvalid].map((token) =>
          callRpc(env, 'fcm_flag_invalid_device', { p_secret: secret, p_token: token }).catch(
            () => null,
          ),
        ),
      );
    }
  }

  stats.milliseconds = Date.now() - started;
  return stats;
}

// -------------------------------------------------------------- the handler ---

export default {
  /** The cron. Every minute, and it costs nothing when nothing is waiting. */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runPush(env)
        .then((stats) => {
          if (stats.waiting > 0) {
            console.warn(
              `push run: waiting=${stats.waiting} devices=${stats.devices} sent=${stats.sent} dead=${stats.dead} invalid=${stats.invalid} unauthorized=${stats.unauthorized} retry=${stats.retry} failed=${stats.failed} marked=${stats.marked} ms=${stats.milliseconds} cron=${controller.cron}`,
            );
          }
        })
        .catch((error: unknown) => {
          // Awaited by `waitUntil`, so it reaches the Workers log. It carries a
          // message and never a payload, an endpoint or a token.
          console.error(
            `push run failed: ${error instanceof DatabaseUnavailable ? `${error.status} ${error.message}` : 'unexpected error'}`,
          );
        }),
    );
  },

  /** The optional queue, for a burst the cron should not have to wait a minute for. */
  async queue(batch: MessageBatch<PushMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body.type !== 'flush') {
          message.ack();
          continue;
        }
        await runPush(env, {
          ...(message.body.limit !== undefined ? { limit: message.body.limit } : {}),
        });
        message.ack();
      } catch (error) {
        // `retry` puts it back on the queue with its own backoff. A message that
        // cannot be delivered is retried by the queue, not by a loop here.
        void error;
        message.retry({ delaySeconds: 30 });
      }
    }
  },

  /** The HTTP trigger: health for a monitor, and a manual run for an operator. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') ?? '';
    const allowed = adminOrigins(env.ADMIN_ORIGINS);
    const corsHeaders: Record<string, string> = {
      vary: 'origin',
      ...(allowed.includes(origin)
        ? {
            'access-control-allow-origin': origin,
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-max-age': '600',
          }
        : {}),
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      const keys = deliveryKeys(env);
      const fcm = fcmCredentials(env);
      return json(
        {
          worker: 'bsdc-push',
          status: keys === null && fcm === null ? 'unconfigured' : 'ok',
          vapid: keys !== null,
          fcm: fcm !== null,
          secret: (env.PUSH_FLUSH_SECRET ?? '').trim().length >= 32,
          database: env.SUPABASE_URL.trim().length > 0 && env.SUPABASE_ANON_KEY.trim().length > 0,
          time: new Date().toISOString(),
        },
        200,
      );
    }

    if ((url.pathname === '/' || url.pathname === '/run') && request.method === 'POST') {
      const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
      if (secret.length < 32) {
        // Nothing can be authorised on a deployment that has no secret, so this
        // is a configuration answer, not a rejection: saying "forbidden" would
        // send an operator looking for a wrong password that does not exist.
        return json({ error: 'push is not configured on this deployment' }, 503);
      }
      if (!sameSecret(bearer(request), secret)) {
        return json({ error: 'forbidden' }, 403);
      }
      try {
        const stats = await runPush(env, {
          ...(url.searchParams.get('limit')
            ? { limit: Number(url.searchParams.get('limit')) }
            : {}),
        });
        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...corsHeaders,
          },
        });
      } catch (error) {
        const status = error instanceof DatabaseUnavailable ? error.status : 500;
        return json(
          { error: error instanceof DatabaseUnavailable ? error.message : 'unexpected error' },
          status,
        );
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
