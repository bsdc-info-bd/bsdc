/**
 * Cloudflare Pages Function — POST /api/push/content
 *
 * What a woken device is told. The push that woke it carried no body, so the
 * service worker posts the endpoint it was given and gets back the notifications
 * that arrived for that device since it was last told anything: the kind, the
 * line the database already wrote, the actor's name and picture, the language
 * the device asked for, and the path to open.
 *
 * The endpoint is the authority here, and that is deliberate. A service worker
 * wakes with no session, no token and nobody signed in — a browser that was
 * closed for a day does not authenticate itself to a push. What it does hold is
 * an address that is long, random and known only to that browser, its push
 * service and this database, so the answer is scoped to its owner and an address
 * nobody was given is told nothing at all. Reading also moves the watermark, so
 * the same device is not told the same thing twice.
 *
 * No secret is involved and no secret is returned. This endpoint cannot be used
 * to enumerate: an answer of "nothing" is indistinguishable from an endpoint that
 * does not exist.
 */
import { rpc, type RpcEnv } from '../../_rpc';

interface ContentRow {
  id: string;
  kind: string;
  body: string;
  url: string;
  actor_name: string;
  actor_avatar: string;
  language: string;
  created_at: string;
}

interface ContentRequest {
  endpoint?: unknown;
  limit?: unknown;
}

/** The most a single wake-up will show before the worker summarises instead. */
const MAX_ITEMS = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<RpcEnv> = async (context) => {
  let payload: ContentRequest = {};
  try {
    payload = (await context.request.json()) as ContentRequest;
  } catch {
    return json({ error: 'a json body is required' }, 400);
  }

  const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : '';
  if (endpoint.length < 20 || !endpoint.startsWith('https://')) {
    return json({ notifications: [] });
  }

  const requested = typeof payload.limit === 'number' ? payload.limit : 5;
  const limit = Math.min(Math.max(1, Math.trunc(requested)), MAX_ITEMS);

  const rows = await rpc<ContentRow[]>(context.env, 'push_content', {
    p_endpoint: endpoint,
    p_limit: limit,
  });
  if (rows === null) return json({ error: 'the database did not answer' }, 502);

  return json({ notifications: rows });
};

export const onRequestGet: PagesFunction<RpcEnv> = () => json({ error: 'method not allowed' }, 405);
