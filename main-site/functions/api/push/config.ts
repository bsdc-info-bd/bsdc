/**
 * Cloudflare Pages Function — GET /api/push/config
 *
 * Exposes ONLY public Web Push client configuration (`vapidPublicKey`) so the
 * browser can subscribe via PushManager even if `VITE_PUSH_VAPID_PUBLIC_KEY` was
 * rotated in Cloudflare Pages Secrets without rebuilding the static bundle.
 * Never exposes private keys or `PUSH_FLUSH_SECRET`.
 */
import { corsHeadersFor } from '../auth/claims-core';

export interface PushConfigEnv {
  PUSH_VAPID_PUBLIC_KEY?: string;
  VITE_PUSH_VAPID_PUBLIC_KEY?: string;
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
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

export const onRequestGet: PagesFunction<PushConfigEnv> = async (context) => {
  const origin = context.request.headers.get('origin');
  const key = (
    context.env.PUSH_VAPID_PUBLIC_KEY ??
    context.env.VITE_PUSH_VAPID_PUBLIC_KEY ??
    ''
  ).trim();
  return jsonResponse({ enabled: key.length > 0, vapidPublicKey: key || null }, 200, origin);
};

export const onRequestOptions: PagesFunction<PushConfigEnv> = async (context) => {
  const origin = context.request.headers.get('origin');
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
};
