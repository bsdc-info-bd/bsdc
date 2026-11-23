import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readyServiceWorker, workerTransports } from './ready-worker';

const ORIGIN = 'https://www.bsdc.info.bd';

interface WorkerLike {
  scriptURL: string;
  state: string;
  postMessage: (message: unknown) => void;
}

interface RegistrationLike {
  scope: string;
  active: WorkerLike | null;
}

function worker(over: Partial<WorkerLike> = {}): WorkerLike {
  return { scriptURL: `${ORIGIN}/sw.js`, state: 'activated', postMessage: vi.fn(), ...over };
}

function registration(active: WorkerLike | null): RegistrationLike {
  return { scope: `${ORIGIN}/`, active };
}

function installServiceWorker(
  ready: Promise<RegistrationLike | null>,
  register?: () => Promise<unknown>,
) {
  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready,
      getRegistration: () => Promise.resolve(null),
      register: register ?? (() => Promise.resolve(undefined)),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: ORIGIN });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('readyServiceWorker', () => {
  it('returns the registration only when the push worker at the root scope is the active one', async () => {
    const active = worker();
    installServiceWorker(Promise.resolve(registration(active) as ServiceWorkerRegistration));
    expect(await readyServiceWorker()).not.toBeNull();
  });

  it('refuses a worker with the wrong scope, which cannot be shown a notification for this site', async () => {
    installServiceWorker(
      Promise.resolve({ scope: `${ORIGIN}/app/`, active: worker() } as ServiceWorkerRegistration),
    );
    expect(await readyServiceWorker()).toBeNull();
  });

  it('refuses a script that is not the push worker, and one still installing', async () => {
    installServiceWorker(
      Promise.resolve(
        registration(
          worker({ scriptURL: `${ORIGIN}/other-worker.js` }),
        ) as ServiceWorkerRegistration,
      ),
    );
    expect(await readyServiceWorker()).toBeNull();

    installServiceWorker(
      Promise.resolve(registration(worker({ state: 'installed' })) as ServiceWorkerRegistration),
    );
    expect(await readyServiceWorker()).toBeNull();
  });

  it('gives up after its timeout instead of hanging the settings page', async () => {
    vi.useFakeTimers();
    installServiceWorker(new Promise<never>(() => undefined));
    const pending = readyServiceWorker();
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(pending).resolves.toBeNull();
  });

  it('says nothing when this browser has no service worker at all', async () => {
    vi.stubGlobal('navigator', {});
    expect(await readyServiceWorker()).toBeNull();
    expect(await workerTransports()).toEqual([]);
  });
});

describe('workerTransports', () => {
  /** A worker that answers the ping, which is what `/sw.js` does since it grew capabilities. */
  function answering(transports: string[]): WorkerLike {
    return worker({
      postMessage: vi.fn(() => {
        window.postMessage({ type: 'BSDC_PUSH_CAPABILITIES', transports }, '*');
      }),
    });
  }

  it('asks the installed worker and reads its answer, ignoring transports it never heard of', async () => {
    const active = answering(['webpush', 'fcm', 'one-signal']);
    expect(await workerTransports(registration(active) as ServiceWorkerRegistration)).toEqual([
      'webpush',
      'fcm',
    ]);
    expect(active.postMessage).toHaveBeenCalledWith({ type: 'BSDC_PUSH_CAPABILITIES_REQUEST' });
  });

  it('treats a silent worker as an old build: web push, and nothing else', async () => {
    vi.useFakeTimers();
    const active = worker();
    const pending = workerTransports(registration(active) as ServiceWorkerRegistration);
    await vi.advanceTimersByTimeAsync(1_200);
    await expect(pending).resolves.toEqual(['webpush']);
  });

  it('counts no transports at all when nothing is installed to receive one', async () => {
    installServiceWorker(Promise.resolve(registration(null) as ServiceWorkerRegistration));
    expect(await workerTransports()).toEqual([]);
  });

  it('forgives a worker that refuses the message, which is what a terminating one does', async () => {
    const active = worker({
      postMessage: () => {
        throw new Error('The service worker is stopping.');
      },
    });
    expect(await workerTransports(registration(active) as ServiceWorkerRegistration)).toEqual([]);
  });

  it('waits for the ready promise when no registration was handed in', async () => {
    installServiceWorker(
      Promise.resolve(registration(answering(['webpush'])) as ServiceWorkerRegistration),
    );
    expect(await workerTransports()).toEqual(['webpush']);
  });
});
