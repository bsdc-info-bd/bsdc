/**
 * The one way a Pages Function talks to Postgres.
 *
 * Functions run at the edge with the anonymous key, exactly like a browser,
 * so every call here is subject to the same row level security a visitor is.
 * Nothing in `functions/` ever receives the service key: an edge function
 * that can bypass RLS is a public endpoint that can bypass RLS.
 */
export interface RpcEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SITE_URL?: string;
}

export function siteOrigin(env: RpcEnv, request: Request): string {
  if (env.SITE_URL && env.SITE_URL !== '') return env.SITE_URL.replace(/\/+$/, '');
  return new URL(request.url).origin;
}

/** Calls a database function. Returns null rather than throwing at the edge. */
export async function rpc<T>(
  env: RpcEnv,
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // A page that cannot reach the database still has to be served; the
    // caller falls back to what the site can say without it.
    return null;
  }
}

export function xmlResponse(body: string, maxAge = 3600): Response {
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}`,
    },
  });
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
