/**
 * Why a picture stops loading, and the ladder that gets it back.
 *
 * This is the module that exists because of one reported symptom: every image
 * on the site loads, and after a few minutes none of them do, until the member
 * clears cookies and cache. "Clear your cache" is not a fix; it is a description
 * of a cache that was trusted when it should not have been. There are exactly
 * five ways a picture that used to load stops loading, and each one has a
 * different cure. This file names them and decides which cure applies, with no
 * network and no DOM, so every branch can be asserted in a test.
 *
 *   1. `transient`   The request failed with no status: offline, a dropped
 *                    connection, a DNS blink, a sleeping phone. Cure: retry the
 *                    same URL after a moment.
 *   2. `rate-limited` 429 or 503 with a Retry-After. Cure: wait, then retry.
 *   3. `expired`     403 or 410 on a URL that carries a signature, an expiry or
 *                    a transform path. Providers issue signed delivery URLs that
 *                    die after a few minutes, which is precisely the reported
 *                    timing. Cure: ask the edge to re-resolve the asset.
 *   4. `forbidden`   401 or 403 without a signature: the host refused this
 *                    origin, usually because its CORS policy changed or because
 *                    a hotlink referrer check started applying. Cure: fetch the
 *                    bytes through the platform's own origin, which has no
 *                    referrer problem and is same-origin to the page.
 *   5. `poisoned`    200 with a body that is not a picture — an HTML error page,
 *                    a 0-byte file, a truncated write. The browser reports this
 *                    as a `decode` failure or as an error with a successful
 *                    status. Cure: re-request with a cache-busting parameter,
 *                    because the bad copy is in the HTTP cache and asking for
 *                    the same URL returns the same wrong answer.
 *
 * Anything else is `unknown`, and the ladder still runs: a retry costs one
 * request, and the empty state at the end of the ladder is a designed tile, not
 * a broken-image glyph.
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

/** A URL that carries a signature, an expiry or a provider transform path. */
const SIGNED_URL_PATTERN =
  /(?:[?&](?:token|expires?|signature|sig|x-amz-signature|x-goog-signature|Policy|Key-Pair-Id|se|sp|sv)=)|\/upload\/[^/]*s--[A-Za-z0-9_-]{8,}--\//;

export function isSignedUrl(url: string): boolean {
  return SIGNED_URL_PATTERN.test(url);
}

/**
 * Cloudinary delivery URLs contain their transform in the path. A transform
 * that names an asset renamed or deleted by the provider answers 404 even
 * though the original may still exist, so the ladder strips the transform
 * before it gives up. This is the difference between "the thumbnail is gone"
 * and "the picture is gone", and those are not the same thing.
 */
export function stripDeliveryTransforms(url: string): string | null {
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (at < 0) return null;

  const after = url.slice(at + marker.length);
  const slash = after.indexOf('/');
  if (slash <= 0) return null;

  const transform = after.slice(0, slash);
  // A version segment (`v1729`, `v1`) is not a transform: `v1712/asset.jpg` is
  // the plain delivery URL and stripping it changes nothing about the asset.
  if (transform.length === 0 || /^v\d+$/.test(transform)) return null;

  return `${url.slice(0, at + marker.length)}${after.slice(slash + 1)}`;
}

/**
 * Classifies what a failed load actually was.
 *
 * `status` is 0 when no response arrived at all, which is what the browser
 * reports for offline, DNS failure and a connection reset — the three of them
 * are one failure from the page's point of view.
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
    // A hosting provider's "service unavailable" page served under an image
    // URL is not a rate limit; it is an outage, and waiting is the cure.
    return 'transient';
  }
  if (status === 401) return 'forbidden';
  if (status === 403) return isSignedUrl(url) ? 'expired' : 'forbidden';
  if (status === 404 || status === 410) {
    // A dead signature answers 410 as often as 403, and a deleted asset answers
    // 404. Which one it is matters: a signed URL is repairable, a deleted file
    // is not.
    if (isSignedUrl(url)) return 'expired';
    return 'missing';
  }
  if (status >= 500) return 'transient';

  // A 2xx that the browser could not decode. The status lied; the bytes did not.
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
  /** When true, the caller should paint its local offline tile instead. */
  offline: boolean;
}

/**
 * The rungs for each kind of failure, in the order they are worth trying.
 *
 * This is a *list*, not a set of branches on an attempt counter, and that is the
 * whole point. The first version of this function branched on `attempt` inside
 * each failure kind, and two branches pointed at each other: a transient failure
 * with a fallback went `fallback` → `proxy` → `fallback` → `proxy` for as long as
 * the tab was open, because neither branch knew it had already run. A test that
 * walked the ladder twenty times found it. A list cannot do that: attempt `n`
 * reads rung `n`, the list is finite, and its last rung is `give-up`.
 *
 * A rung that the call cannot perform — a fallback when there is no second
 * address, a proxy when the host is not ours to repair — is removed before the
 * list is read, so the sequence is dense and no attempt is spent on a step that
 * would do nothing.
 */
const RUNGS: Record<Exclude<ImageFailure, 'none'>, readonly RecoveryStep[]> = {
  // The connection, not the address: ask the other size (free and immediate),
  // then the same address quickly, then slowly, then through this origin.
  transient: ['fallback', 'retry', 'retry-later', 'proxy'],
  // A host asking for patience. Waiting twice, then looking elsewhere.
  'rate-limited': ['retry-later', 'fallback', 'proxy'],
  // A dead signature. Only the edge can re-resolve it, so it is asked first.
  expired: ['proxy', 'fallback'],
  // The origin was refused; a same-origin fetch has no origin to refuse.
  forbidden: ['proxy', 'fallback'],
  // A body that was not a picture is in a cache. A different URL is the only
  // way to ask for different bytes.
  poisoned: ['bust', 'fallback', 'proxy'],
  // The file is not there. A proxy cannot conjure a deleted asset, and a retry
  // cannot either: the transform-free original is the only other thing to try.
  missing: ['fallback'],
  unknown: ['bust', 'fallback', 'proxy'],
};

/** The wait each rung asks for. Everything else is immediate. */
const DELAY_MS: Partial<Record<RecoveryStep, number>> = {
  retry: 400,
  'retry-later': 2_500,
};

/** Keeps a rung the call can actually perform. */
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

/**
 * The whole ladder for one failure, with the rungs this call cannot perform
 * removed. Exported because the list is the contract, and a contract with no
 * test that reads it is a contract nobody has checked.
 */
export function recoveryRungs(input: {
  failure: Exclude<ImageFailure, 'none'>;
  hasFallback: boolean;
  canProxy: boolean;
}): RecoveryStep[] {
  const steps = RUNGS[input.failure].filter((step) =>
    rungAvailable(step, input.hasFallback, input.canProxy),
  );
  // A ladder always ends with the same answer, whether or not any rung was
  // available. That is what makes "the tile eventually settles" provable.
  return [...steps, 'give-up'];
}

/**
 * The ladder, step by step.
 *
 * `attempt` is zero-based and counts how many times this picture has already
 * failed. `online` comes from the browser's connectivity state; a member with no
 * connection should be told so instantly rather than watching a spinner retry
 * into a void.
 */
export function planRecovery(input: {
  failure: ImageFailure;
  attempt: number;
  online: boolean;
  hasFallback: boolean;
  canProxy: boolean;
}): RecoveryPlan {
  const { failure, attempt, online, hasFallback, canProxy } = input;

  if (failure === 'none') return { step: 'give-up', delayMs: 0, offline: false };

  if (!online) {
    // Nothing to try until the connection returns. The tile says "offline"; the
    // caller re-runs the ladder on the `online` event.
    return { step: 'give-up', delayMs: 0, offline: true };
  }

  const rungs = recoveryRungs({ failure, hasFallback, canProxy });
  const step = rungs[Math.min(attempt, rungs.length - 1)] ?? 'give-up';
  return { step, delayMs: DELAY_MS[step] ?? 0, offline: false };
}

/**
 * Applies the cache-busting parameter to a URL.
 *
 * Idempotent: busting an already-busted URL with the same nonce changes
 * nothing, so a re-render does not invalidate a request in flight.
 */
export function withBust(url: string, nonce: string): string {
  const [base, ...rest] = url.split('#');
  const hash = rest.length > 0 ? `#${rest.join('#')}` : '';
  const [path, query = ''] = (base ?? '').split('?');
  const params = query.length > 0 ? query.split('&') : [];
  const kept = params.filter((pair) => !pair.startsWith('bsdc_r='));
  kept.push(`bsdc_r=${encodeURIComponent(nonce)}`);
  return `${path ?? url}?${kept.join('&')}${hash}`;
}

/**
 * The URL the proxy is asked for.
 *
 * The source URL travels in the query string, encoded once. The endpoint refuses
 * anything that is not on its allowlist, so this is a request, not a capability.
 */
export function proxyUrlFor(url: string, path = '/media/i'): string {
  return `${path}?u=${encodeURIComponent(url)}`;
}

/**
 * The hard ceiling on ladder turns for one picture.
 *
 * The longest ladder in `RUNGS` has four rungs plus `give-up`, so this can never
 * truncate a real sequence; it exists so that a future edit to `RUNGS` cannot
 * introduce a loop that runs for as long as a tab is open.
 */
export const MAX_RECOVERY_ATTEMPTS = 6;

export interface RecoveryState {
  attempt: number;
  failure: ImageFailure;
  /** The URL currently on the `<img>`. */
  url: string;
  /** Set once the ladder hands the picture to the proxy or gives up. */
  settled: boolean;
  offline: boolean;
}

export function initialRecoveryState(url: string): RecoveryState {
  return { attempt: 0, failure: 'none', url, settled: false, offline: false };
}

/**
 * One turn of the ladder.
 *
 * Pure: takes the current state and what happened, returns the next state. The
 * component is then a thin shell — `useEffect` that applies the state's URL to
 * an `<img>`, an `onError` that feeds a failure in, and a `setTimeout` for the
 * delay. Keeping the machine here is what makes "all images stop loading after a
 * few minutes" a testable claim rather than an anecdote.
 */
export function advanceRecovery(
  state: RecoveryState,
  input: {
    failure: ImageFailure;
    status?: number;
    online: boolean;
    fallbackUrl?: string;
    /** The address the caller originally asked for. */
    primaryUrl?: string;
    canProxy: boolean;
    now?: number;
  },
): { state: RecoveryState; plan: RecoveryPlan } {
  const failure = input.failure === 'none' ? state.failure : input.failure;
  // A fallback is the other size of the same picture, never the address that
  // just failed. Comparing against the primary rather than against the current
  // address matters: a ladder that reached the proxy is still allowed to spend
  // its fallback rung on the other size.
  const hasFallback =
    (input.fallbackUrl ?? '').length > 0 && (input.fallbackUrl ?? '') !== input.primaryUrl;

  const plan = planRecovery({
    failure,
    attempt: state.attempt,
    online: input.online,
    hasFallback,
    canProxy: input.canProxy,
  });

  const next: RecoveryState = {
    attempt: state.attempt + 1,
    failure,
    url: state.url,
    settled: false,
    offline: plan.offline,
  };

  switch (plan.step) {
    case 'retry':
    case 'retry-later':
      // Same URL on purpose: the failure was the connection, not the address.
      break;
    case 'bust':
      next.url = withBust(state.url, `${(input.now ?? Date.now()).toString(36)}-${next.attempt}`);
      break;
    case 'fallback':
      next.url = input.fallbackUrl ?? state.url;
      break;
    case 'proxy':
      // The proxy always fetches the caller's original address, not whatever
      // cache-busted variant the last rung happened to build: a repair is a
      // request for the picture, not for a string.
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

/**
 * Whether a load that just succeeded should be trusted.
 *
 * Called with what the browser reports after a successful `load` event. If the
 * element has zero natural width, the bytes were not a picture, however happy
 * the HTTP response was. This is the check that catches a poisoned cache entry
 * the moment it is drawn instead of five minutes later.
 */
export function isTrustworthyLoad(naturalWidth: number, naturalHeight: number): boolean {
  return naturalWidth > 0 && naturalHeight > 0;
}
