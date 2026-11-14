/**
 * Why a picture stops loading, and the ladder that gets it back.
 *
 * Every picture loads straight from the browser's live network stack without a
 * service-worker image cache in the way. When a request fails, this module
 * names the cause and walks a short, bounded recovery ladder with no network
 * and no DOM so every branch can be asserted in a test.
 *
 *   1. `transient`    No status: a dropped connection, DNS blink, or server 5xx.
 *                     Cure: try the alternate size or retry the same URL.
 *   2. `rate-limited` 429 or 503 with a Retry-After. Cure: wait, then retry.
 *   3. `expired`      403 or 410 on a signed URL. Cure: re-resolve via `/media/i`.
 *   4. `forbidden`    401 or 403 without a signature: hotlink/CORS refusal.
 *                     Cure: fetch bytes through the site's same-origin proxy.
 *   5. `poisoned`     200 with a body that cannot decode as a picture.
 *                     Cure: request a fresh URL with a cache-busting query param.
 */

export type ImageFailure =
  | 'none'
  | 'transient'
  | 'rate-limited'
  | 'expired'
  | 'forbidden'
  | 'poisoned'
  | 'missing'
  | 'unknown';

export type RecoveryStep = 'retry' | 'retry-later' | 'bust' | 'proxy' | 'fallback' | 'give-up';

/** A URL that carries a signature or expiry query parameter. */
const SIGNED_URL_PATTERN =
  /[?&](?:token|expires?|signature|sig|x-amz-signature|x-goog-signature|Policy|Key-Pair-Id|se|sp|sv)=/;

export function isSignedUrl(url: string): boolean {
  return SIGNED_URL_PATTERN.test(url);
}

/**
 * Classifies what a failed load actually was.
 */
export function classifyImageFailure(
  status: number,
  url: string,
  options: { contentType?: string } = {},
): ImageFailure {
  if (status === 0) return 'transient';
  if (status === 408 || status === 425) return 'transient';
  if (status === 429) return 'rate-limited';
  if (status === 503 && (options.contentType ?? '').includes('text/html')) {
    return 'transient';
  }
  if (status === 401) return 'forbidden';
  if (status === 403) return isSignedUrl(url) ? 'expired' : 'forbidden';
  if (status === 404 || status === 410) {
    if (isSignedUrl(url)) return 'expired';
    return 'missing';
  }
  if (status >= 500) return 'transient';

  if (status >= 200 && status < 300) {
    const type = (options.contentType ?? '').toLowerCase();
    if (type.length > 0 && !type.startsWith('image/')) return 'poisoned';
    return 'poisoned';
  }

  return 'unknown';
}

export interface RecoveryPlan {
  /**
   * What the tile should do next. `'give-up'` means the ladder is finished and
   * the caller should draw its empty state.
   */
  step: RecoveryStep;
  /** Milliseconds to wait before a `retry` or `retry-later`. */
  delayMs: number;
}

const RUNGS: Record<Exclude<ImageFailure, 'none'>, readonly RecoveryStep[]> = {
  transient: ['fallback', 'retry', 'retry-later', 'proxy'],
  'rate-limited': ['retry-later', 'fallback', 'proxy'],
  expired: ['proxy', 'fallback'],
  forbidden: ['proxy', 'fallback'],
  poisoned: ['bust', 'fallback', 'proxy'],
  missing: ['fallback'],
  unknown: ['bust', 'fallback', 'proxy'],
};

const DELAY_MS: Partial<Record<RecoveryStep, number>> = {
  retry: 400,
  'retry-later': 2_500,
};

function rungAvailable(step: RecoveryStep, hasFallback: boolean, canProxy: boolean): boolean {
  switch (step) {
    case 'fallback':
      return hasFallback;
    case 'proxy':
      return canProxy;
    case 'bust':
    case 'retry':
    case 'retry-later':
      return true;
    default:
      return false;
  }
}

export function recoveryRungs(input: {
  failure: Exclude<ImageFailure, 'none'>;
  hasFallback: boolean;
  canProxy: boolean;
}): RecoveryStep[] {
  const steps = RUNGS[input.failure].filter((step) =>
    rungAvailable(step, input.hasFallback, input.canProxy),
  );
  return [...steps, 'give-up'];
}

export function planRecovery(input: {
  failure: ImageFailure;
  attempt: number;
  hasFallback: boolean;
  canProxy: boolean;
}): RecoveryPlan {
  const { failure, attempt, hasFallback, canProxy } = input;

  if (failure === 'none') return { step: 'give-up', delayMs: 0 };

  const rungs = recoveryRungs({ failure, hasFallback, canProxy });
  const step = rungs[Math.min(attempt, rungs.length - 1)] ?? 'give-up';
  return { step, delayMs: DELAY_MS[step] ?? 0 };
}

export function withBust(url: string, nonce: string): string {
  const [base, ...rest] = url.split('#');
  const hash = rest.length > 0 ? `#${rest.join('#')}` : '';
  const [path, query = ''] = (base ?? '').split('?');
  const params = query.length > 0 ? query.split('&') : [];
  const kept = params.filter((pair) => !pair.startsWith('bsdc_r='));
  kept.push(`bsdc_r=${encodeURIComponent(nonce)}`);
  return `${path ?? url}?${kept.join('&')}${hash}`;
}

export function proxyUrlFor(url: string, path = '/media/i'): string {
  return `${path}?u=${encodeURIComponent(url)}`;
}

export const MAX_RECOVERY_ATTEMPTS = 6;

export interface RecoveryState {
  attempt: number;
  failure: ImageFailure;
  /** The URL currently on the `<img>`. */
  url: string;
  /** Set once the ladder gives up. */
  settled: boolean;
}

export function initialRecoveryState(url: string): RecoveryState {
  return { attempt: 0, failure: 'none', url, settled: false };
}

export function advanceRecovery(
  state: RecoveryState,
  input: {
    failure: ImageFailure;
    status?: number;
    fallbackUrl?: string;
    primaryUrl?: string;
    canProxy: boolean;
    now?: number;
  },
): { state: RecoveryState; plan: RecoveryPlan } {
  const failure = input.failure === 'none' ? state.failure : input.failure;
  const hasFallback =
    (input.fallbackUrl ?? '').length > 0 && (input.fallbackUrl ?? '') !== input.primaryUrl;

  const plan = planRecovery({
    failure,
    attempt: state.attempt,
    hasFallback,
    canProxy: input.canProxy,
  });

  const next: RecoveryState = {
    attempt: state.attempt + 1,
    failure,
    url: state.url,
    settled: false,
  };

  switch (plan.step) {
    case 'retry':
    case 'retry-later':
      break;
    case 'bust':
      next.url = withBust(state.url, `${(input.now ?? Date.now()).toString(36)}-${next.attempt}`);
      break;
    case 'fallback':
      next.url = input.fallbackUrl ?? state.url;
      break;
    case 'proxy':
      next.url = proxyUrlFor(input.primaryUrl ?? state.url);
      break;
    case 'give-up':
      next.settled = true;
      break;
  }

  if (next.attempt >= MAX_RECOVERY_ATTEMPTS) {
    next.settled = true;
  }

  return { state: next, plan };
}

export function isTrustworthyLoad(naturalWidth: number, naturalHeight: number): boolean {
  return naturalWidth > 0 && naturalHeight > 0;
}
