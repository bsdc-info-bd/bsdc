import { env, isConfigured } from '@/lib/env';

export async function resolvePushConfig(): Promise<{
  mode: 'webpush' | 'fcm';
  publicKey: string;
} | null> {
  const fcmKey = env.push.vapidPublicKey.trim();
  if (fcmKey && isConfigured.firebase && (await (await import('./fcm')).supportsFcmBrowser())) {
    return { mode: 'fcm', publicKey: fcmKey };
  }
  const webKey = env.push.webPushPublicKey.trim();
  if (webKey) return { mode: 'webpush', publicKey: webKey };
  if (typeof fetch === 'function') {
    try {
      const response = await fetch('/api/push/config', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const payload = (await response.json()) as { enabled?: unknown; vapidPublicKey?: unknown };
        if (
          payload.enabled === true &&
          typeof payload.vapidPublicKey === 'string' &&
          payload.vapidPublicKey.trim().length > 0
        ) {
          return { mode: 'webpush', publicKey: payload.vapidPublicKey.trim() };
        }
      }
    } catch {
      // Fall through to database public config RPC below.
    }
  }

  if (isConfigured.supabase) {
    try {
      const dbKey = await (await import('./push-repository')).fetchPublicPushConfigFromDb();
      if (dbKey !== null) {
        return { mode: 'webpush', publicKey: dbKey };
      }
    } catch {
      // Ignore if database is unreachable.
    }
  }

  return null;
}
