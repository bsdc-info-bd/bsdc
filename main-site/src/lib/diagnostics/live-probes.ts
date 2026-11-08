/**
 * The real probes, wired to the browser.
 *
 * `checks.ts` holds the rules; this file holds the wiring, so the rules can be
 * tested without a browser and the wiring can be read without a test. Every
 * probe here is bounded: a check that hangs is worse than a check that fails,
 * because a member watching a spinner learns nothing.
 */
import { isConfigured } from '@/lib/env';
import type { Probes } from './checks';

/** No probe may take longer than this. */
const PROBE_TIMEOUT_MS = 8_000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Whether the browser will let this site keep a cache and a session.
 *
 * A private window in Safari reports `true` for `localStorage` and then throws
 * on the first write, so the answer has to come from a write, not from a
 * property.
 */
function storageWorks(): boolean {
  try {
    const key = 'bsdc.diagnostics.probe';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function liveProbes(): Probes {
  return {
    async api(path) {
      return withTimeout(async (signal) => {
        const response = await fetch(path, {
          signal,
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        const type = response.headers.get('content-type') ?? '';
        // A page where JSON was expected is the soft-404 problem in one line.
        const body: unknown = type.includes('json')
          ? await response.json().catch(() => null)
          : null;
        return { status: response.status, body };
      });
    },

    async token() {
      const { getFirebaseAuth } = await import('@/lib/firebase');
      const user = getFirebaseAuth().currentUser;
      if (!user) return null;
      return user.getIdToken(false);
    },

    async rpc(name, args = {}) {
      try {
        const { getSupabase } = await import('@/lib/supabase/client');
        const { error } = await withTimeout(async () =>
          getSupabase()
            .rpc(name as never, args as never)
            .returns<unknown[]>(),
        );
        return error
          ? { ok: false, error: error.code ?? error.message.slice(0, 80) }
          : { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 80) : 'unreachable',
        };
      }
    },

    async realtime() {
      try {
        const { ensureRealtimeAuth, getSupabase } = await import('@/lib/supabase/client');
        await ensureRealtimeAuth();
        const client = getSupabase();
        const state = (client.realtime as unknown as { connectionState?: () => string })
          .connectionState;
        // A socket that has never connected reports `closed` on first read; that
        // is not a failure, it is a socket that has not been asked to open. The
        // check asks by opening a channel and waiting for the join.
        const channel = client.channel('bsdc:diagnostics');
        const joined = await withTimeout(
          () =>
            new Promise<string>((resolve) => {
              channel.subscribe((status: string) => resolve(status));
            }),
        );
        void client.removeChannel(channel);
        if (joined === 'SUBSCRIBED' || joined === 'CHANNEL_ERROR' || joined === 'TIMED_OUT') {
          // CHANNEL_ERROR is a database-side problem (a migration, a permission)
          // rather than a transport problem; the socket itself is reachable.
          return joined === 'SUBSCRIBED'
            ? { ok: true }
            : { ok: false, detail: joined.toLowerCase() };
        }
        return { ok: false, detail: state?.() ?? joined.toLowerCase() };
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message.slice(0, 60) : 'unreachable',
        };
      }
    },

    async image(url) {
      return withTimeout(async (signal) => {
        const response = await fetch(url, { signal, cache: 'no-store', mode: 'cors' });
        return {
          ok: response.ok,
          contentType: response.headers.get('content-type') ?? '',
        };
      });
    },

    capabilities: {
      secureContext: window.isSecureContext,
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      notifications: 'Notification' in window,
      notificationPermission:
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
      storage: storageWorks(),
      online: navigator.onLine,
    },

    config: {
      firebase: isConfigured.firebase,
      supabase: isConfigured.supabase,
      webPushKey: isConfigured.push,
    },
  };
}

/** The build identifier the report carries, when the deployment provides one. */
export function buildId(): string {
  const sha: unknown = import.meta.env['VITE_BUILD_SHA'];
  return typeof sha === 'string' ? sha : '';
}
