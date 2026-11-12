/**
 * The platform checks its own dependencies and says what is wrong.
 *
 * Every failure this platform has had in production shared a shape: something
 * outside the code was wrong — an environment variable that was never set, a
 * database function that had not been migrated, a host that stopped answering, a
 * permission the browser withdrew — and the member's screen showed a spinner or
 * an empty state. The person who could have fixed it in a minute could not see
 * the one sentence that would have told them what to fix.
 *
 * So the checks live here: pure functions that take a `Probe` interface and
 * return a list of results. The page that renders them is a shell. That split
 * matters, because it means the *rules* — what counts as a failure, what a
 * member is told versus what staff are told — are testable without a network.
 */

export type CheckState = 'ok' | 'warn' | 'fail' | 'skipped';

export interface CheckResult {
  /** A stable id, so a support reply can say "check auth.token". */
  id: string;
  /** What is being checked, in the member's language. */
  label: string;
  state: CheckState;
  /** One sentence a member can act on. Never a stack trace, never a secret. */
  detail: string;
  /** Milliseconds the check took, when it ran. */
  ms?: number;
}

/**
 * What a check is allowed to do. Injected rather than imported, so tests can say
 * what the network does without a network.
 */
export interface Probes {
  /** A request against this deployment's own API, same-origin. */
  api: (path: string) => Promise<{ status: number; body: unknown }>;
  /** A signed-in member's token, or null when signed out. */
  token: () => Promise<string | null>;
  /** Runs a database function and reports its shape. */
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /** Whether realtime can be reached at all. */
  realtime: () => Promise<{ ok: boolean; detail?: string }>;
  /** Whether a picture on a host can be fetched, and whether it is a picture. */
  image: (url: string) => Promise<{ ok: boolean; contentType: string }>;
  /** The browser's own capability report, already gathered. */
  capabilities: {
    secureContext: boolean;
    serviceWorker: boolean;
    pushManager: boolean;
    notifications: boolean;
    notificationPermission: string;
    storage: boolean;
    online: boolean;
  };
  /** Configuration this build was compiled with. Public values only. */
  config: {
    firebase: boolean;
    supabase: boolean;
    webPushKey: boolean;
  };
}

/** A fixed sample picture on the platform's image host (ImgBB). */
export const SAMPLE_IMAGES = {
  imgbb: 'https://i.ibb.co/6P0b1cS/bsdc-sample.jpg',
} as const;

function result(
  id: string,
  label: string,
  state: CheckState,
  detail: string,
  ms?: number,
): CheckResult {
  return ms === undefined ? { id, label, state, detail } : { id, label, state, detail, ms };
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await run();
  return { value, ms: Date.now() - started };
}

/**
 * The checks, in the order a person fixing a deployment should read them.
 *
 * Configuration first: a missing Supabase URL makes every later check fail for
 * the same reason, and reading six failures when there is one cause is how a
 * support thread becomes unproductive.
 */
export async function runChecks(probes: Probes): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const { config, capabilities } = probes;

  checks.push(
    config.supabase
      ? result(
          'config.supabase',
          'Database configuration',
          'ok',
          'The database address is present in this build.',
        )
      : result(
          'config.supabase',
          'Database configuration',
          'fail',
          'VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from this build. Nothing that reads the database can work until both are set and the site is rebuilt.',
        ),
  );

  checks.push(
    config.firebase
      ? result(
          'config.firebase',
          'Sign-in configuration',
          'ok',
          'The sign-in project is present in this build.',
        )
      : result(
          'config.firebase',
          'Sign-in configuration',
          'fail',
          'VITE_FB_API_KEY or VITE_FB_PROJECT_ID is missing. Sign-in, and every page that needs a member, cannot work.',
        ),
  );

  checks.push(
    capabilities.secureContext
      ? result(
          'browser.secure',
          'Secure connection',
          'ok',
          'This page is served over HTTPS or localhost.',
        )
      : result(
          'browser.secure',
          'Secure connection',
          'fail',
          'This page is not a secure context. Notifications, the camera and the clipboard are all disabled by the browser.',
        ),
  );

  checks.push(
    capabilities.online
      ? result('browser.online', 'Connection', 'ok', 'The device reports a connection.')
      : result(
          'browser.online',
          'Connection',
          'warn',
          'The device reports no internet connection.',
        ),
  );

  // The site's own API. A Pages Function that is not deployed answers the shell,
  // which is an HTML 200 — the check on the body matters as much as the status.
  const health = await timed(() =>
    probes.api('/api/health').catch(() => ({ status: 0, body: null })),
  );
  const healthBody = health.value.body as { app?: unknown; status?: unknown } | null;
  if (health.value.status === 200 && healthBody?.app === 'bsdc-main-site') {
    checks.push(
      result(
        'api.health',
        'API endpoints',
        'ok',
        'This deployment’s functions are live.',
        health.ms,
      ),
    );
  } else if (health.value.status === 200) {
    checks.push(
      result(
        'api.health',
        'API endpoints',
        'fail',
        'The address answered with a page instead of the API. The Functions are not deployed, or every request is being rewritten to the app shell.',
        health.ms,
      ),
    );
  } else {
    checks.push(
      result(
        'api.health',
        'API endpoints',
        'fail',
        `The API answered ${health.value.status === 0 ? 'nothing' : String(health.value.status)}. Uploads, geocoding and push delivery all depend on it.`,
        health.ms,
      ),
    );
  }

  // ImgBB edge upload readiness.
  const providers = await timed(() =>
    probes.api('/api/media/providers').catch(() => ({ status: 0, body: null })),
  );
  const providersBody = providers.value.body as { proxy?: unknown; imgbb?: unknown } | null;
  if (
    providers.value.status === 200 &&
    providersBody?.proxy === true &&
    providersBody?.imgbb === true
  ) {
    checks.push(
      result(
        'media.providers',
        'Image upload service (ImgBB)',
        'ok',
        'The edge upload endpoint holds an active ImgBB API key.',
        providers.ms,
      ),
    );
  } else {
    checks.push(
      result(
        'media.providers',
        'Image upload service (ImgBB)',
        'fail',
        'IMGBB_API_KEY is missing from Cloudflare Pages runtime secrets, or /api/media/providers is unreachable.',
        providers.ms,
      ),
    );
  }

  // Pictures on ImgBB: does the host answer, and is the answer a picture?
  for (const [id, url] of Object.entries(SAMPLE_IMAGES)) {
    const probe = await timed(() =>
      probes.image(url).catch(() => ({ ok: false, contentType: '' })),
    );
    if (probe.value.ok && probe.value.contentType.startsWith('image/')) {
      checks.push(
        result(
          `image.${id}`,
          `Pictures from ${id}`,
          'ok',
          'A sample picture was fetched and decoded.',
          probe.ms,
        ),
      );
    } else if (probe.value.ok) {
      checks.push(
        result(
          `image.${id}`,
          `Pictures from ${id}`,
          'fail',
          `The host answered, but not with a picture (${probe.value.contentType || 'no type'}). This is exactly the failure that makes pictures stop loading after a while.`,
          probe.ms,
        ),
      );
    } else {
      checks.push(
        result(
          `image.${id}`,
          `Pictures from ${id}`,
          'fail',
          'The host did not answer this browser. If the site’s own pictures are on this host, they will not load.',
          probe.ms,
        ),
      );
    }
  }

  // The repair endpoint. It is the last rung of the picture ladder, so a
  // deployment without it has one fewer way to recover.
  const repair = await timed(() =>
    probes
      .api(`/media/i?u=${encodeURIComponent(SAMPLE_IMAGES.imgbb)}`)
      .catch(() => ({ status: 0, body: null })),
  );
  checks.push(
    repair.value.status === 0
      ? result(
          'media.repair',
          'Picture repair',
          'warn',
          'The repair endpoint did not answer.',
          repair.ms,
        )
      : result(
          'media.repair',
          'Picture repair',
          repair.value.status < 500 ? 'ok' : 'warn',
          repair.value.status < 500
            ? 'The repair endpoint answers, so a picture can be fetched through this site when its host refuses it.'
            : `The repair endpoint answered ${repair.value.status}.`,
          repair.ms,
        ),
  );

  // Sign-in token, then the database functions that need it.
  const token = await probes.token().catch(() => null);
  if (token === null) {
    checks.push(
      result(
        'auth.token',
        'Signed-in session',
        'skipped',
        'Nobody is signed in, so member-only checks were skipped. Sign in to check them.',
      ),
    );
  } else {
    checks.push(
      result(
        'auth.token',
        'Signed-in session',
        'ok',
        'A signed-in session with a current token is available.',
      ),
    );
  }

  /**
   * The functions a signed-in member's first screen depends on. Each one is
   * named after the migration that defines it, so a failure here reads as
   * "apply the database migrations" rather than "the site is broken".
   */
  for (const [id, label, name, args] of [
    ['db.inbox', 'Messaging', 'conversation_inbox', { p_limit: 1 }],
    ['db.feed', 'Feed', 'feed_candidates', { p_limit: 1 }],
    ['db.devices', 'Notification devices', 'my_push_devices', {}],
  ] as const) {
    const check = await timed(() =>
      probes.rpc(name, args).catch(() => ({ ok: false, error: 'unreachable' })),
    );
    checks.push(
      result(
        id,
        label,
        check.value.ok ? 'ok' : 'fail',
        check.value.ok
          ? 'The database function answers.'
          : `The database function ${name} did not answer${check.value.error ? ` (${check.value.error})` : ''}. This is usually a migration that has not been applied.`,
        check.ms,
      ),
    );
  }

  const realtime = await timed(() =>
    probes.realtime().catch(() => ({ ok: false, detail: 'unreachable' })),
  );
  checks.push(
    result(
      'realtime.socket',
      'Live updates',
      realtime.value.ok ? 'ok' : 'warn',
      realtime.value.ok
        ? 'The live connection is open, so messages and notifications arrive without a reload.'
        : `The live connection is not open${realtime.value.detail ? ` (${realtime.value.detail})` : ''}. Messages still send; they arrive on the next refresh instead of instantly.`,
      realtime.ms,
    ),
  );

  checks.push(
    !capabilities.serviceWorker
      ? result(
          'browser.worker',
          'Background support',
          'fail',
          'This browser has no service worker, so push notifications cannot work here.',
        )
      : result(
          'browser.worker',
          'Background support',
          'ok',
          'The browser supports background work.',
        ),
  );

  if (!capabilities.pushManager || !capabilities.notifications) {
    checks.push(
      result(
        'push.support',
        'Notifications',
        'warn',
        'This browser cannot be woken while it is closed.',
      ),
    );
  } else if (!config.webPushKey) {
    checks.push(
      result(
        'push.support',
        'Notifications',
        'fail',
        'This build has no VAPID public key, so no device can ask to be woken.',
      ),
    );
  } else if (capabilities.notificationPermission === 'denied') {
    checks.push(
      result(
        'push.support',
        'Notifications',
        'warn',
        'Notification permission was refused in this browser. It has to be granted in the browser’s own settings.',
      ),
    );
  } else if (capabilities.notificationPermission === 'granted') {
    checks.push(
      result(
        'push.support',
        'Notifications',
        'ok',
        'This device can be woken while the browser is closed.',
      ),
    );
  } else {
    checks.push(
      result(
        'push.support',
        'Notifications',
        'warn',
        'Notifications have not been turned on for this device yet.',
      ),
    );
  }

  checks.push(
    capabilities.storage
      ? result(
          'browser.storage',
          'On-device storage',
          'ok',
          'The browser allows this site to keep a session.',
        )
      : result(
          'browser.storage',
          'On-device storage',
          'warn',
          'The browser is blocking storage. Nothing is remembered here: you will be signed out on reload.',
        ),
  );

  return checks;
}

/** A one-line verdict, for a header or a log. */
export function summariseChecks(checks: readonly CheckResult[]): {
  state: CheckState;
  failed: number;
  warned: number;
  total: number;
} {
  const failed = checks.filter((check) => check.state === 'fail').length;
  const warned = checks.filter((check) => check.state === 'warn').length;
  return {
    state: failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'ok',
    failed,
    warned,
    total: checks.filter((check) => check.state !== 'skipped').length,
  };
}

/**
 * The sentence to send in a support reply.
 *
 * Copying a stack trace into a message is how a member is made to feel they did
 * something wrong. This produces the six lines that actually diagnose a
 * deployment, with no token, no endpoint and no personal data in them.
 */
export function checksReport(
  checks: readonly CheckResult[],
  context: { build: string; language: string; userAgent: string },
): string {
  const summary = summariseChecks(checks);
  const lines = [
    `BSDC system report — ${new Date().toISOString()}`,
    `build: ${context.build || 'unknown'}`,
    `language: ${context.language}`,
    `verdict: ${summary.state} (${summary.failed} failed, ${summary.warned} warned, ${summary.total} checked)`,
    '',
    ...checks.map((check) => `[${check.state}] ${check.id} — ${check.label}: ${check.detail}`),
    '',
    `browser: ${context.userAgent.slice(0, 180)}`,
  ];
  return lines.join('\n');
}
