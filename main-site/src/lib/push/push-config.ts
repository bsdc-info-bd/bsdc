/**
 * The one place that decides how this browser will be woken.
 *
 * `resolvePushConfig` gathers what only the browser knows — whether a key was
 * compiled into this bundle, whether the deployment has one, what the installed
 * worker can decode, whether `firebase/messaging` runs here — and hands the lot to
 * `chooseTransport`, which is pure and exhaustively tested. Everything
 * transport-shaped therefore has one decision point: the settings page, the
 * silent re-registration on load and `pushsubscriptionchange` in the worker all ask
 * this question and get the same answer for as long as the query stays fresh.
 */
import { env, isConfigured } from '@/lib/env';

import {
  chooseTransport,
  firebaseWebConfigReady,
  transportCooldownKey,
  transportInCooldown,
  type PushTransport,
  type TransportReason,
} from './transport';

export interface ResolvedPushConfig {
  /** Kept as `mode` because the hook, the attempt log and the worker hand-off all read it. */
  mode: PushTransport;
  publicKey: string;
  /** Why this transport, from `chooseTransport`. Recorded with the attempt, not shown to members. */
  reason: TransportReason;
}

interface PushConfigDeps {
  /** `firebase/messaging`'s `isSupported()`. */
  firebaseSupported: () => Promise<boolean>;
  /** The installed worker's own list of transports. */
  workerTransports: () => Promise<string[]>;
  /** The deployment's key, for a build that was compiled without one. */
  fetchSiteKey: () => Promise<string | null>;
  /** Reads a cooldown mark; injected so the policy is testable without localStorage. */
  cooldownRead: (key: string) => string | null;
  now: number;
}

function siteKeyFromEnv(): string {
  return env.push.webPushPublicKey.trim();
}

function firebaseCandidate(): { key: string; ready: boolean } {
  return {
    key: env.push.vapidPublicKey.trim(),
    ready:
      isConfigured.firebase &&
      firebaseWebConfigReady({
        apiKey: env.firebase.apiKey,
        projectId: env.firebase.projectId,
        messagingSenderId: env.firebase.messagingSenderId,
        appId: env.firebase.appId,
      }),
  };
}

/**
 * The public half of the site's own VAPID pair.
 *
 * Read from the build first, because a compiled-in key costs no request; then from
 * `/api/push/config`, which is how a rotation takes effect without rebuilding the
 * bundle; then from the database's public push settings, which is the same value
 * served by an edge function that could not reach its environment.
 */
async function resolveSiteKey(fetchSiteKey: () => Promise<string | null>): Promise<string> {
  const compiled = siteKeyFromEnv();
  if (compiled.length > 0) return compiled;
  try {
    return (await fetchSiteKey())?.trim() ?? '';
  } catch {
    return '';
  }
}

async function fetchSiteKeyFromEndpoint(): Promise<string | null> {
  if (typeof fetch !== 'function') return null;
  const response = await fetch('/api/push/config', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { enabled?: unknown; vapidPublicKey?: unknown };
  if (payload.enabled !== true || typeof payload.vapidPublicKey !== 'string') return null;
  return payload.vapidPublicKey.trim().length > 0 ? payload.vapidPublicKey.trim() : null;
}

export async function resolvePushConfigWith(
  deps: PushConfigDeps,
): Promise<ResolvedPushConfig | null> {
  const firebase = firebaseCandidate();
  const requested = (env.push.transport ?? '').trim().toLowerCase();

  // `firebase/messaging` is a dynamic import and the worker ping costs a round
  // trip, so neither runs unless FCM is a live possibility. A deployment that asked
  // for web push by name, or one with an incomplete Firebase config, never
  // downloads the SDK on its way to a subscription it was never going to use.
  const wantsFirebase = requested !== 'webpush' && firebase.ready;
  const firebaseSupported = wantsFirebase ? await deps.firebaseSupported() : false;
  const firebaseWorker =
    wantsFirebase && firebaseSupported ? (await deps.workerTransports()).includes('fcm') : false;

  const siteKey = await resolveSiteKey(deps.fetchSiteKey);
  const inputs = (disabled: PushTransport[]) => ({
    siteKey,
    firebaseKey: firebase.key,
    firebaseReady: firebase.ready,
    firebaseSupported,
    firebaseWorker,
    requested,
    disabled,
  });

  let choice = chooseTransport(inputs([]));

  // A transport that failed since this page last looked is skipped rather than
  // retried into the same dead end, and the other one gets its turn — recomputed
  // through the same preconditions, so a cooldown can never talk this browser into
  // a transport that was never able to work here. **Retry** in the settings card
  // clears the marks, so an operator who fixes the deployment mid-visit is picked up
  // on the next click rather than the next morning.
  if (
    choice.transport !== null &&
    transportInCooldown(choice.transport, deps.cooldownRead, deps.now)
  ) {
    const retry = chooseTransport(inputs([choice.transport]));
    if (retry.transport !== null) choice = retry;
  }

  if (choice.transport === null) return null;
  return {
    mode: choice.transport,
    publicKey: choice.transport === 'fcm' ? firebase.key : siteKey,
    reason: choice.reason,
  };
}

/** Reads the key the database has, when the edge function could not. */
async function fetchSiteKeyFromDatabase(): Promise<string | null> {
  if (!isConfigured.supabase) return null;
  const { fetchPublicPushConfigFromDb } = await import('./push-repository');
  return fetchPublicPushConfigFromDb();
}

export async function resolvePushConfig(): Promise<ResolvedPushConfig | null> {
  const { workerTransports, readyServiceWorker } = await import('./ready-worker');
  return resolvePushConfigWith({
    firebaseSupported: async () => (await import('./fcm')).supportsFcmBrowser(),
    workerTransports: async () => workerTransports(await readyServiceWorker()),
    fetchSiteKey: async () =>
      (await fetchSiteKeyFromEndpoint()) ?? (await fetchSiteKeyFromDatabase()),
    cooldownRead: (key) => {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    now: Date.now(),
  });
}

/**
 * One storage attempt, forgiven.
 *
 * A locked-down context can refuse `localStorage` on the property read, and a
 * private window can refuse the write after it, so both halves belong inside the
 * same `try`. Losing a mark costs a second click; letting it throw would cost the
 * registration that already succeeded.
 */
function inStorage(run: (storage: Storage) => void): void {
  try {
    const storage = globalThis.localStorage;
    if (storage) run(storage);
  } catch {
    // Nothing to remember, and nothing to tell the member about.
  }
}

/**
 * Marks a transport as having failed in this browser.
 *
 * Only a transport that is *optional* is worth remembering as broken: a mark on
 * `fcm` costs the member nothing, because web push takes its place. A mark on
 * `webpush` would switch a browser with no other option into a transport the
 * deployment never configured, so the hook records it and `resolvePushConfig`
 * ignores it for whichever transport is the last one standing.
 */
export function markTransportUnavailable(transport: PushTransport): void {
  inStorage((storage) => storage.setItem(transportCooldownKey(transport), String(Date.now())));
}

/** Forgets every mark: what **Retry** in the settings card means. */
export function clearTransportCooldowns(): void {
  inStorage((storage) => {
    for (const transport of ['webpush', 'fcm'] as PushTransport[]) {
      storage.removeItem(transportCooldownKey(transport));
    }
  });
}
