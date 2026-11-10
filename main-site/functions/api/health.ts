/**
 * Cloudflare Pages Function — GET /api/health
 *
 * Used by the status app and by uptime checks. It reports only whether the
 * deployment can answer, never any secret value.
 */
import { availabilityOf, type MediaEnv } from '../_media';

interface Env extends MediaEnv {
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_BRANCH?: string;
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  const media = availabilityOf(context.env);
  const body = {
    app: 'bsdc-main-site',
    status: 'ok',
    time: new Date().toISOString(),
    commit: context.env.CF_PAGES_COMMIT_SHA ?? null,
    branch: context.env.CF_PAGES_BRANCH ?? null,
    // Whether this deployment can accept a picture upload. A boolean, never a
    // key: it is the difference between "uploads are broken" and "uploads were
    // never configured", and only one of those is a code problem. An uptime
    // check that reads this can tell an operator in one line which it is.
    media: {
      upload: media.imgbb,
      host: media.imgbb ? 'imgbb' : null,
    },
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
