const SW_READY_TIMEOUT_MS = 10_000;

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
