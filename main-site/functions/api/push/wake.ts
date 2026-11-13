/**
 * Cloudflare Pages Function — POST /api/push/wake
 *
 * Authenticated instant wake-up triggered by web or Android clients right after
 * committing a message, comment, reaction, order, or review. Verifies the
 * caller's Firebase ID token against Google's JWKS and forwards a bounded push
 * flush using the server-held `PUSH_FLUSH_SECRET` (preferring the encrypted
 * push worker and falling back to local Web Push + FCM HTTP v1 delivery).
 */
import { verifyFirebaseIdToken } from '../../_fcm';
import { corsHeadersFor } from '../auth/claims-core';
import { executePushRun, type PushEnv } from './run';

const DEFAULT_WORKER_URL = 'https://push.api.bsdc.info.bd';

function wakeResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...corsHeadersFor(origin),
    },
  });
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 20 ? token : null;
}

export const onRequestOptions: PagesFunction<PushEnv> = async (context) => {
  const origin = context.request.headers.get('origin');
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
};

export const onRequestPost: PagesFunction<PushEnv> = async (context) => {
  const { env, request } = context;
  const origin = request.headers.get('origin');
  const token = bearer(request);
  if (token === null) {
    return wakeResponse({ error: 'unauthorized' }, 401, origin);
  }

  const allowedProjects = [
    (env.FB_PROJECT_ID ?? env.VITE_FB_PROJECT_ID ?? 'bsdc-bd').trim(),
    (env.FB2_PROJECT_ID ?? env.VITE_FB2_PROJECT_ID ?? 'bsdc-second').trim(),
  ].filter((p) => p.length > 0);

  try {
    await verifyFirebaseIdToken(token, allowedProjects);
  } catch {
    return wakeResponse({ error: 'unauthorized' }, 401, origin);
  }

  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
  if (secret.length < 32) {
    return wakeResponse({ ok: false, skipped: 'unconfigured' }, 202, origin);
  }

  const outcome = await executePushRun(env, {
    limit: 60,
    fallbackWorkerUrl: DEFAULT_WORKER_URL,
    workerTimeoutMs: 4_500,
  });

  return wakeResponse(
    {
      ok: outcome.status >= 200 && outcome.status < 300,
      path: outcome.path,
      ...outcome.body,
      milliseconds: outcome.milliseconds,
    },
    outcome.status >= 500 ? 202 : outcome.status,
    origin,
  );
};

export const onRequestGet: PagesFunction<PushEnv> = async (context) =>
  wakeResponse({ error: 'method not allowed' }, 405, context.request.headers.get('origin'));
