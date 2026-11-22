const SW_READY_TIMEOUT_MS = 10_000;

/**
 * How long to wait for the worker to describe itself.
 *
 * A worker that is installed but not yet activated, or one from a build before the
 * capability protocol existed, answers nothing. Waiting longer than a second would
 * put a delay in front of the settings page for information that is only used to
 * decide whether an *optional* transport is offered, so the timeout is the answer:
 * web push is what every deployed worker has always been able to do.
 */
const CAPABILITY_TIMEOUT_MS = 1_200;

const CAPABILITY_REQUEST = { type: 'BSDC_PUSH_CAPABILITIES_REQUEST' } as const;
const CAPABILITY_REPLY = 'BSDC_PUSH_CAPABILITIES';

const KNOWN_TRANSPORTS = new Set(['webpush', 'fcm']);

export async function readyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw) return null;

  try {
    const existing = await sw.getRegistration('/');
    if (!existing && typeof sw.register === 'function') {
      await sw.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
    }
  } catch {
    // Proceed to sw.ready check below.
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const registration = await Promise.race([
      sw.ready,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
      }),
    ]);
    const origin = globalThis.location.origin;
    return registration?.scope === `${origin}/` &&
      registration.active?.scriptURL === `${origin}/sw.js` &&
      registration.active.state === 'activated'
      ? registration
      : null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The transports this browser's installed worker says it can receive.
 *
 * The page is the only place with the Firebase and Supabase sessions, so it is the
 * one that can ask; the worker is the only place that knows what it was compiled
 * with, since the same `/sw.js` is built with and without Firebase credentials
 * depending on the deployment. Asking beats assuming: an operator who sets
 * `VITE_PUSH_TRANSPORT=fcm` without rebuilding the worker gets a decline and a
 * reason, not a subscription that never hears anything.
 */
export async function workerTransports(
  registration: ServiceWorkerRegistration | null = null,
): Promise<string[]> {
  let active: ServiceWorker | null | undefined = registration?.active ?? null;

  if (active === null) {
    const sw = globalThis.navigator?.serviceWorker;
    if (!sw) return [];
    try {
      active = (
        await Promise.race([
          sw.ready,
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
          }),
        ])
      )?.active;
    } catch {
      return [];
    }
  }
  if (!active) return [];

  const answered = new Promise<string[]>((resolve) => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: unknown; transports?: unknown } | null;
      if (data?.type !== CAPABILITY_REPLY || !Array.isArray(data.transports)) return;
      globalThis.removeEventListener?.('message', onMessage as EventListener);
      resolve(data.transports.filter((t): t is string => KNOWN_TRANSPORTS.has(String(t))));
    };
    globalThis.addEventListener?.('message', onMessage as EventListener);
    setTimeout(() => {
      globalThis.removeEventListener?.('message', onMessage as EventListener);
      // Silent is an old worker, and an old worker knows web push and nothing else.
      resolve([]);
    }, CAPABILITY_TIMEOUT_MS);
  });

  try {
    active.postMessage(CAPABILITY_REQUEST);
  } catch {
    return [];
  }

  const transports = await answered;
  return transports.length > 0 ? transports : ['webpush'];
}
