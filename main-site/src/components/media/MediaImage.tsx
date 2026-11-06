import { ImageOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { cn } from '@/lib/cn';
import {
  advanceRecovery,
  classifyImageFailure,
  initialRecoveryState,
  isTrustworthyLoad,
  proxyUrlFor,
  withBust,
  type ImageFailure,
  type RecoveryState,
} from '@/lib/media/resilience';

export interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string;
  fallbackSrc?: string;
  alt: string;
  /**
   * Fetch through the platform's own origin if the host refuses this one.
   *
   * On by default, because it is the cure for the one failure a browser cannot
   * fix by itself: a picture host that stopped allowing this origin, or a
   * delivery URL whose signature expired a minute after it was issued.
   */
  allowProxy?: boolean;
  /** Called after a paint that was verified as a real picture. */
  onRecovered?: () => void;
}

/** The longest single delay the ladder will wait before trying again. */
const MAX_DELAY_MS = 5_000;

/** What the browser is currently being asked to draw. */
interface Painting {
  url: string;
  /** The key forces a fresh element, which is the only way to retry a URL. */
  attempt: number;
  key: number;
}

/**
 * A picture that keeps trying to be a picture.
 *
 * Every other `<img>` on the web assumes the network answers truthfully once.
 * Pictures on a community platform do not have that luxury: they arrive from
 * three hosts, two of them third-party, through a service worker and a browser
 * cache that may each have stored a failure. The reported symptom — everything
 * loads, then nothing does, until the cache is cleared — is that assumption
 * failing in public.
 *
 * So this component does three things a plain `<img>` does not:
 *
 *   1. It verifies the paint. A `load` event with zero natural dimensions means
 *      the bytes were an error page wearing a picture's content type; that is a
 *      failure, and it is treated as one.
 *   2. It runs a recovery ladder when a paint fails: a quick retry, a slower
 *      retry, a cache-busted URL, the thumbnail or the original, the platform's
 *      own proxy, and only then a designed empty tile. The ladder itself is pure
 *      arithmetic in `lib/media/resilience`, so every rung is tested.
 *   3. It tells the truth while offline. A phone in a lift gets "no connection",
 *      not a spinner, and the ladder restarts by itself when the connection
 *      returns.
 */
export function MediaImage({
  src,
  fallbackSrc = '',
  alt,
  className,
  onError,
  onLoad,
  allowProxy = true,
  onRecovered,
  ...imageProps
}: MediaImageProps) {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  /**
   * The two addresses this tile knows about.
   *
   * `primary` is what the caller asked for. `fallback` is the other size of the
   * same picture — the original when the thumbnail 404s, the thumbnail when the
   * original does. A fallback identical to the primary is not a fallback, and
   * saying so here keeps the ladder from spending a rung on the same address.
   */
  const primary = src.length > 0 ? src : fallbackSrc;
  const fallback = fallbackSrc.length > 0 && fallbackSrc !== primary ? fallbackSrc : '';
  const canProxy = allowProxy && primary.length > 0;

  const machine = useRef<RecoveryState>(initialRecoveryState(primary));
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextKey = useRef(1);

  const [painting, setPainting] = useState<Painting>(() => ({
    url: primary,
    attempt: 0,
    key: 0,
  }));
  const [offlineTile, setOfflineTile] = useState(false);
  const [gaveUp, setGaveUp] = useState(primary.length === 0);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // A different picture in the same slot is a different picture. Starting again
  // is correct; continuing another asset's ladder is how a feed ends up showing
  // the wrong picture's fallback.
  useEffect(() => {
    clearTimer();
    machine.current = initialRecoveryState(primary);
    failures.current = 0;
    nextKey.current += 1;
    setPainting({ url: primary, attempt: 0, key: nextKey.current });
    setOfflineTile(false);
    setGaveUp(primary.length === 0);
  }, [primary, clearTimer]);

  const paint = useCallback(
    (next: RecoveryState, delayMs: number) => {
      clearTimer();
      const commit = () => {
        timer.current = null;
        nextKey.current += 1;
        setPainting({ url: next.url, attempt: next.attempt, key: nextKey.current });
      };
      if (delayMs <= 0) {
        // Immediate: the rung has nothing to wait for, and waiting for a microtask
        // would leave a picture that failed on its first paint showing its first
        // paint until something else caused a render.
        commit();
        return;
      }
      timer.current = setTimeout(commit, Math.min(delayMs, MAX_DELAY_MS));
    },
    [clearTimer],
  );

  const apply = useCallback(
    (failure: ImageFailure) => {
      failures.current += 1;
      const { state: next, plan } = advanceRecovery(machine.current, {
        failure,
        online,
        fallbackUrl: fallback,
        primaryUrl: primary,
        canProxy,
      });
      machine.current = next;

      if (plan.step === 'give-up') {
        if (plan.offline) {
          // Not a failure of the picture: a failure of the connection. The tile
          // says so, and the `online` effect restarts the ladder.
          setOfflineTile(true);
          return;
        }
        setGaveUp(true);
        return;
      }

      setOfflineTile(false);
      paint(next, plan.delayMs);
    },
    [canProxy, fallback, online, paint, primary],
  );

  /**
   * The connection came back.
   *
   * Only a tile that failed while offline restarts, and it restarts with a
   * cache-busted address: the bytes that failed during the outage may since have
   * been replaced at the host, and the browser's own cache may hold the failure.
   */
  useEffect(() => {
    if (!online || failures.current === 0 || gaveUp) return;
    machine.current = {
      ...initialRecoveryState(primary),
      url: withBust(primary, `online-${Date.now().toString(36)}`),
    };
    setOfflineTile(false);
    // `primary` and `gaveUp` are read at the moment connectivity returns, which
    // is what this effect is for; re-running it on every render would restart a
    // ladder that is working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  function handleError(event: React.SyntheticEvent<HTMLImageElement, Event>) {
    onError?.(event);
    const element = event.currentTarget;
    /**
     * A failed `<img>` reports no status to a script — that is a deliberate gap
     * in the platform, not an oversight here. What the element does leave behind
     * is whether it ever had a source at all. No source means the request never
     * left (offline, a cancelled navigation); a source means the host answered
     * with something the browser refused, which the ladder classifies.
     */
    const failure: ImageFailure =
      element.currentSrc.length === 0 ? 'transient' : classifyImageFailure(0, element.currentSrc);
    apply(failure);
  }

  function handleLoad(event: React.SyntheticEvent<HTMLImageElement, Event>) {
    const element = event.currentTarget;
    // In a browser that decoded the picture, `currentSrc` is set. A load event
    // without it — a test environment, a lazily resolved source — is accepted
    // rather than second-guessed, so the check only applies to a real element.
    if (
      element.currentSrc.length > 0 &&
      !isTrustworthyLoad(element.naturalWidth, element.naturalHeight)
    ) {
      apply('poisoned');
      return;
    }
    onRecovered?.();
    onLoad?.(event);
  }

  const failed = gaveUp || painting.url.length === 0;
  const proxyPrefix = proxyUrlFor('').split('?')[0] ?? '/media/i';
  const isProxied = painting.url.startsWith(proxyPrefix);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt || t('media.gallery.imageUnavailable')}
        className={cn(
          'inline-flex items-center justify-center gap-2 bg-surface-2 text-muted',
          className,
        )}
      >
        <ImageOff size={20} aria-hidden="true" />
        <span className="fab-sr-only">
          {offlineTile ? t('media.gallery.imageOffline') : t('media.gallery.imageUnavailable')}
        </span>
      </span>
    );
  }

  return (
    <img
      {...imageProps}
      key={painting.key}
      src={painting.url}
      alt={alt}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
      data-attempt={painting.attempt}
      // A proxied picture is same-origin, so its referrer is this site. Every
      // other host gets no referrer at all, which is what makes a hotlink check
      // stop mattering for an ordinary member picture.
      {...(isProxied ? {} : { referrerPolicy: 'no-referrer' as const })}
      // The picture is drawn, not inspected: no cross-origin read is needed, so
      // a host without CORS headers still paints instead of failing.
      decoding={imageProps.decoding ?? 'async'}
    />
  );
}
