/**
 * The one way a Pages Function talks to Postgres.
 *
 * Functions run at the edge with the anonymous/publishable key, exactly like a
 * browser, so every call here is subject to the same row level security a
 * visitor is. Nothing in `functions/` ever receives the privileged backend key:
 * an edge function that can bypass RLS is a public endpoint that can bypass RLS.
 */
export interface RpcEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  SITE_URL?: string;
}

export function resolveSupabasePublic(
  env: RpcEnv,
): { readonly base: string; readonly key: string } | null {
  const base = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (
    env.SUPABASE_ANON_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim();
  if (base === '' || key === '') return null;
  return { base, key };
}

/**
 * Builds PostgREST headers for an anonymous/publishable Supabase key.
 * Modern `sb_publishable_*` keys are non-JWT gateway keys and must NOT be sent
 * in `Authorization: Bearer ...` (which PostgREST rejects with PGRST301 401);
 * legacy `eyJ*` anon JWTs still travel in both `apikey` and `Authorization`.
 */
export function supabaseAnonHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_')) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
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
  const target = resolveSupabasePublic(env);
  if (target === null) return null;

  try {
    const response = await fetch(`${target.base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        ...supabaseAnonHeaders(target.key),
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
