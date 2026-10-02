import { rpc, type RpcEnv } from '../_rpc';

/**
 * Cloudflare Pages Function — POST /api/vitals
 *
 * The one endpoint an anonymous browser may write through. It answers 204
 * whatever happens: a beacon has nobody to tell, and a measurement endpoint
 * that returns errors teaches a page to retry, which is the opposite of the
 * point.
 *
 * It is deliberately small-minded. A payload larger than a few kilobytes is
 * dropped unread, more than twenty measurements are ignored, and nothing
 * about the sender is recorded beyond the country Cloudflare already knows.
 */
interface Measurement {
  route?: unknown;
  metric?: unknown;
  value?: unknown;
  device?: unknown;
  connection?: unknown;
  build?: unknown;
}

interface ClientError {
  fingerprint?: unknown;
  name?: unknown;
  message?: unknown;
  route?: unknown;
  build?: unknown;
}

const MAX_BODY = 8 * 1024;
const text = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';

const accepted = (): Response => new Response(null, { status: 204 });

export const onRequestPost: PagesFunction<RpcEnv> = async (context) => {
  const length = Number(context.request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY) return accepted();

  let payload: { measurements?: unknown; errors?: unknown };
  try {
    payload = (await context.request.json()) as typeof payload;
  } catch {
    return accepted();
  }

  const measurements = Array.isArray(payload.measurements)
    ? (payload.measurements as Measurement[]).slice(0, 20)
    : [];
  const errors = Array.isArray(payload.errors)
    ? (payload.errors as ClientError[]).slice(0, 10)
    : [];

  const work: Promise<unknown>[] = [];

  for (const item of measurements) {
    const value = typeof item.value === 'number' ? item.value : Number.NaN;
    if (!Number.isFinite(value) || value < 0) continue;
    work.push(
      rpc(context.env, 'record_vital', {
        p_route: text(item.route, 200),
        p_metric: text(item.metric, 8),
        p_value: value,
        p_device: text(item.device, 10) || 'mobile',
        p_connection: text(item.connection, 12),
        p_build: text(item.build, 40),
        p_app: 'main-site',
      }),
    );
  }

  for (const item of errors) {
    const fingerprint = text(item.fingerprint, 64);
    if (fingerprint === '') continue;
    work.push(
      rpc(context.env, 'record_client_error', {
        p_fingerprint: fingerprint,
        p_name: text(item.name, 80) || 'Error',
        p_message: text(item.message, 300),
        p_route: text(item.route, 200) || '/',
        p_build: text(item.build, 40),
        p_app: 'main-site',
      }),
    );
  }

  // The browser is not kept waiting for the database; the platform is told
  // to finish the work after the response has gone.
  if (work.length > 0) context.waitUntil(Promise.all(work));
  return accepted();
};
