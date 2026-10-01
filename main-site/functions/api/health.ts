/**
 * Cloudflare Pages Function — GET /api/health
 *
 * Used by the status app and by uptime checks. It reports only whether the
 * deployment can answer, never any secret value.
 */
interface Env {
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_BRANCH?: string;
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  const body = {
    app: 'bsdc-main-site',
    status: 'ok',
    time: new Date().toISOString(),
    commit: context.env.CF_PAGES_COMMIT_SHA ?? null,
    branch: context.env.CF_PAGES_BRANCH ?? null,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
