/**
 * Cloudflare Pages Function — POST /api/media/purge
 *
 * The half of the picture promise that runs on a clock. ImgBB keeps a file
 * forever unless somebody asks it to stop, and a member who deletes a direct
 * message cannot reach i.ibb.co themselves. So the platform asks.
 *
 * What it is allowed to delete is decided by the database, not here:
 * `media_pending_purge(secret, limit)` returns rows that are either past the
 * expiry the host was given, or referenced by nothing on the platform and older
 * than a day. This function's whole job is to make the HTTP request the host
 * documents and to report honestly what came back.
 *
 * ## The three states of a delete
 *
 * A delete is not a boolean. It can be confirmed, refused, or unanswered, and
 * conflating the three is how a file ends up "deleted" in the database and still
 * on the internet:
 *
 *   - **confirmed** — the host said yes, or said 404 (already gone, which is the
 *     outcome that was wanted). `media_mark_purged` records it.
 *   - **refused** — the host said no, with a status that will not change on a
 *     retry (401/403: the token is not for this key any more). The claim is
 *     released and the row is left alone; the operator sees it in the response.
 *   - **unanswered** — a timeout, a 5xx, a network error. The claim is released
 *     and the next run tries again.
 *
 * ## Why the token is here and not in the browser
 *
 * `delete_token` is written to the table by the upload path, and the table denies
 * SELECT on that column to every client role (see 0072's grant notes and
 * `t43.mjs`). It is read here, by an endpoint holding the scheduler's secret,
 * and used once. A member cannot delete somebody else's file, because a member
 * never sees a token.
 */
import { rpc, type RpcEnv } from '../../_rpc';

interface PurgeEnv extends RpcEnv {
  PUSH_FLUSH_SECRET?: string;
}

interface PendingRow {
  id: string;
  owner_uid: string;
  provider: string;
  url: string;
  delete_token: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
}

type Verdict = 'confirmed' | 'refused' | 'unanswered';

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
function sameSecret(presented: string, expected: string): boolean {
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

/**
 * What a delete request is allowed to be.
 *
 * The token comes out of the database, but a token is data and data is not
 * trusted: an attacker who could write a `delete_token` (they cannot — the column
 * is not writable by any client role) or a provider that answered with something
 * unexpected would otherwise turn this endpoint into a request forwarder. So the
 * address must be the provider's own delete endpoint, over https, with no
 * credentials and no port.
 */
export function deletionRequest(
  row: Pick<PendingRow, 'provider' | 'delete_token'>,
): { url: string; method: 'GET' } | null {
  const token = row.delete_token.trim();
  if (token.length === 0) return null;

  if (row.provider === 'imgbb') {
    // ImgBB's delete_url is handed back by the upload response and already
    // contains the token. A bare token is not a URL, and guessing one would be
    // inventing a request the host never documented.
    if (!token.startsWith('https://')) return null;
    try {
      const parsed = new URL(token);
      if (parsed.protocol !== 'https:') return null;
      if (parsed.port.length > 0) return null;
      if (parsed.username.length > 0 || parsed.password.length > 0) return null;
      const host = parsed.hostname.toLowerCase();
      // ImgBB answers on i.ibb.co, ibb.co and i.ibb.co.com; anything else is not its endpoint.
      if (host !== 'i.ibb.co' && host !== 'ibb.co' && host !== 'i.ibb.co.com') return null;
      return { url: parsed.toString(), method: 'GET' };
    } catch {
      return null;
    }
  }

  return null;
}

async function askHost(row: PendingRow): Promise<{ verdict: Verdict; status: number | null }> {
  const request = deletionRequest(row);
  if (request === null) return { verdict: 'refused', status: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      signal: controller.signal,
      headers: { 'user-agent': 'bsdc-media-sweeper/1.0 (+https://www.bsdc.info.bd)' },
    });
    // 404/410 is the outcome that was wanted: the file is not there. It is a
    // confirmation, not a failure, and treating it as a failure would retry
    // forever.
    if (response.ok || response.status === 404 || response.status === 410) {
      return { verdict: 'confirmed', status: response.status };
    }
    // 401/403 will not change on a retry: the token and the key disagree. The
    // claim is released so an operator can see it, and the row is not retried
    // into a loop.
    if (response.status === 401 || response.status === 403) {
      return { verdict: 'refused', status: response.status };
    }
    return { verdict: 'unanswered', status: response.status };
  } catch {
    return { verdict: 'unanswered', status: null };
  } finally {
    clearTimeout(timer);
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

export const onRequestPost: PagesFunction<PurgeEnv> = async (context) => {
  const started = Date.now();
  const { env, request } = context;

  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
  if (secret.length < 32) {
    return json({ error: 'media clean-up is not configured on this deployment' }, 503);
  }
  if (!sameSecret(bearer(request), secret)) {
    return json({ error: 'forbidden' }, 403);
  }

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), 200) : 50;

  const pending = await rpc<PendingRow[]>(env, 'media_pending_purge', {
    p_secret: secret,
    p_limit: limit,
  });
  if (pending === null) return json({ error: 'the database did not answer' }, 502);
  if (pending.length === 0) {
    return json({
      waiting: 0,
      confirmed: 0,
      refused: 0,
      unanswered: 0,
      rows: 0,
      milliseconds: Date.now() - started,
    });
  }

  // Claim first, so a second run in the same minute does not ask twice.
  const ids = pending.map((row) => row.id);
  await rpc(env, 'media_claim_purge', { p_secret: secret, p_ids: ids });

  const confirmed: string[] = [];
  const release: string[] = [];
  let refused = 0;
  let unanswered = 0;

  await inBatches(pending, 6, async (row) => {
    const { verdict } = await askHost(row);
    if (verdict === 'confirmed') {
      confirmed.push(row.id);
      return;
    }
    if (verdict === 'refused') refused += 1;
    else unanswered += 1;
    // Both end with the claim released: one because a retry cannot help, the
    // other because a retry has not happened yet. Neither is marked purged.
    release.push(row.id);
  });

  if (confirmed.length > 0) {
    await rpc(env, 'media_mark_purged', { p_secret: secret, p_ids: confirmed });
  }
  if (release.length > 0) {
    await rpc(env, 'media_release_purge', { p_secret: secret, p_ids: release });
  }

  return json({
    waiting: pending.length,
    confirmed: confirmed.length,
    refused,
    unanswered,
    rows: pending.length,
    milliseconds: Date.now() - started,
  });
};

export const onRequestGet: PagesFunction<PurgeEnv> = () =>
  json({ error: 'method not allowed' }, 405);
