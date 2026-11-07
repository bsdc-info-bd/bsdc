/**
 * The thin client this worker needs to reach the database.
 *
 * Every call goes through one of the secret-gated functions in the database, so
 * this worker must never hold a privileged key. That is not a limitation here;
 * it is the design. The set of things a delivery worker may do is small and
 * enumerated — read what is pending, read a device's words, mark what was
 * delivered, retire a subscription — and each one is a function whose body was
 * reviewed when the migration was written.
 *
 * Nothing in this file logs a secret, echoes one back, or includes one in an
 * error. A response body from Postgres is used only when it is JSON that matches
 * the expected shape.
 */
import type { Env } from './env';

export interface DeviceRow {
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

/**
 * The headers PostgREST wants.
 *
 * A modern `sb_publishable_*` key is a gateway key and must not be sent as a
 * bearer token; a legacy `eyJ*` anon JWT travels in both. Sending it the wrong
 * way answers 401 from a deployment that is configured perfectly, which is the
 * kind of failure that gets blamed on the worker.
 */
export function postgrestHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_')) headers.authorization = `Bearer ${key}`;
  return headers;
}

export class DatabaseUnavailable extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'DatabaseUnavailable';
    this.status = status;
  }
}

/**
 * Calls one of the worker-gated database functions.
 *
 * The secret is passed in the JSON body of a POST rather than in a header: a URL
 * and a header both end up in more logs than a body does, and this body is never
 * logged. Anything but a 2xx is reported as a number and a fixed sentence —
 * never as Postgres's own message, which can quote the argument back.
 */
export async function callRpc<T>(
  env: Env,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const base = env.SUPABASE_URL.trim().replace(/\/+$/, '');
  if (base.length === 0) throw new DatabaseUnavailable(503, 'SUPABASE_URL is not set');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        ...postgrestHeaders(env.SUPABASE_ANON_KEY),
        'content-type': 'application/json',
        'x-bsdc-app': 'push-worker',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Read and discard: an unconsumed body keeps a connection in the pool.
      await response.text().catch(() => '');
      throw new DatabaseUnavailable(response.status, `the database answered ${response.status}`);
    }

    const text = await response.text();
    if (text.length === 0) return null as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof DatabaseUnavailable) throw error;
    throw new DatabaseUnavailable(502, 'the database did not answer');
  } finally {
    clearTimeout(timeout);
  }
}
