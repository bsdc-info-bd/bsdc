import { ImageOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { cn } from '@/lib/cn';
import { isRepairableMediaHost } from '@/lib/media/hosts';
import { responsiveSource, type ResponsiveSource } from '@/lib/media/optimise';
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
  /** Optional ~640w ImgBB medium variant used to build a responsive `srcset`. */
  variantSrc?: string;
  /** Known intrinsic width of the full image, used in `srcset` width descriptors. */
  fullWidth?: number | null;
  alt: string;
  /**
   * Fetch through the platform's own Cloudflare edge (`/media/i`) if the host
   * refuses or stalls on direct requests.
   */
  allowProxy?: boolean;
  /** Called after a paint that was verified as a real picture. */
  onRecovered?: () => void;
  /** Called once when all recovery rungs are exhausted. */
  onFailure?: () => void;
  /** CSS pixel width of the layout slot this image fills. */
  slotWidth?: number;
  /** Overrides the `sizes` descriptor when the layout is multi-column. */
  sizesAttribute?: string;
}

/** Longest single retry delay in the recovery ladder. */
const MAX_DELAY_MS = 5_000;

/**
 * The ImgBB host of an address, or null when it is not one this edge can fetch.
 *
 * Relative addresses are never proxied: they are already same-origin, so there
 * is no CORS, referrer or hotlink problem for the proxy to solve.
 */
function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url, 'https://bsdc.info.bd');
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return isRepairableMediaHost(parsed.hostname) ? parsed.hostname : null;
  } catch {
    return null;
  }
}

interface Painting {
  url: string;
  attempt: number;
  key: number;
}

/**
 * Resilient, responsive image element backed by BSDC's ImgBB + Cloudflare edge
 * delivery pipeline.
 *
 * - Builds real multi-resolution `srcset` + `sizes` descriptors whenever both
 *   an ImgBB `medium` (~640w) variant and full WebP URL exist.
 * - Paints cached images in 0ms without fade flicker, while giving network loads
 *   a zero-CLS placeholder surface.
 * - Automatically upgrades legacy 180x180 square thumbnails to full resolution
 *   on wide cards, verifies decoded dimensions, and walks the bounded recovery
 *   ladder through BSDC's `/media/i` edge cache when needed.
 */
export function MediaImage({
  src,
  fallbackSrc = '',
  variantSrc = '',
  fullWidth = null,
  alt,
  className,
  onError,
  onLoad,
  allowProxy = true,
  onRecovered,
  onFailure,
  slotWidth,
  sizesAttribute,
  ...imageProps
}: MediaImageProps) {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  const rawPrimary = src.length > 0 ? src : fallbackSrc;
  const rawFallback = fallbackSrc.length > 0 && fallbackSrc !== rawPrimary ? fallbackSrc : '';

  const slot = typeof slotWidth === 'number' && slotWidth > 0 ? slotWidth : 0;
  const fullUrl = rawFallback.length > 0 ? rawFallback : rawPrimary;
  const mediumUrl = variantSrc.length > 0 ? variantSrc : rawPrimary !== fullUrl ? rawPrimary : '';

  const responsive: ResponsiveSource | null =
    slot > 0 && mediumUrl.length > 0 && mediumUrl !== fullUrl
      ? responsiveSource(fullUrl, slot, {
          variantUrl: mediumUrl,
          fullWidth,
          ...(sizesAttribute === undefined ? {} : { sizesAttribute }),
        })
      : null;

  const primary = responsive !== null && responsive.src.length > 0 ? responsive.src : rawPrimary;
  const fallback =
    rawFallback.length > 0 && rawFallback !== primary
      ? rawFallback
      : fullUrl !== primary
        ? fullUrl
        : mediumUrl.length > 0 && mediumUrl !== primary
          ? mediumUrl
          : '';
  /**
   * The proxy can only fetch what its allowlist names.
   *
   * `/media/i` answers 400 for anything that is not on an ImgBB host, so asking
   * it to repair a Google avatar or a legacy Cloudinary row spent four rungs of
   * the ladder on four guaranteed failures — four extra requests per picture, per
   * page, on the connection every other picture was sharing. A host this
   * platform cannot repair gets the rungs that can work and nothing else.
   */
  const canProxy = allowProxy && primary.length > 0 && hostOf(primary) !== null;

  const machine = useRef<RecoveryState>(initialRecoveryState(primary));
  const failures = useRef(0);
  const upgradedLegacyThumb = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextKey = useRef(1);

  const [painting, setPainting] = useState<Painting>(() => ({
    url: primary,
    attempt: 0,
    key: 0,
  }));
  const [loaded, setLoaded] = useState(false);
  const [offlineTile, setOfflineTile] = useState(false);
  const [gaveUp, setGaveUp] = useState(primary.length === 0);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    clearTimer();
    machine.current = initialRecoveryState(primary);
    failures.current = 0;
    upgradedLegacyThumb.current = false;
    nextKey.current += 1;
    setPainting({ url: primary, attempt: 0, key: nextKey.current });
    setLoaded(false);
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
          setOfflineTile(true);
          onFailure?.();
          return;
        }
        setGaveUp(true);
        onFailure?.();
        return;
      }

      setOfflineTile(false);
      paint(next, plan.delayMs);
    },
    [canProxy, fallback, online, paint, primary, onFailure],
  );

  useEffect(() => {
    if (!online || failures.current === 0 || gaveUp) return;
    machine.current = {
      ...initialRecoveryState(primary),
      url: withBust(primary, `online-${Date.now().toString(36)}`),
    };
    setOfflineTile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const observeElement = useCallback((node: HTMLImageElement | null) => {
    if (node !== null && node.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  function handleError(event: React.SyntheticEvent<HTMLImageElement, Event>) {
    onError?.(event);
    const element = event.currentTarget;
    const failure: ImageFailure =
      element.currentSrc.length === 0 ? 'transient' : classifyImageFailure(0, element.currentSrc);
    apply(failure);
  }

  function handleLoad(event: React.SyntheticEvent<HTMLImageElement, Event>) {
    const element = event.currentTarget;
    if (
      element.currentSrc.length > 0 &&
      !isTrustworthyLoad(element.naturalWidth, element.naturalHeight)
    ) {
      apply('poisoned');
      return;
    }

    // Legacy ImgBB rows stored a 180x180 square crop in `thumb_url`. When a wide
    // card detects a <=200px decoded thumb and has a distinct full URL, upgrade
    // seamlessly to the full image so historical posts never render blurry.
    if (
      !upgradedLegacyThumb.current &&
      slot >= 300 &&
      element.naturalWidth > 0 &&
      element.naturalWidth <= 200 &&
      fullUrl.length > 0 &&
      painting.url !== fullUrl
    ) {
      upgradedLegacyThumb.current = true;
      nextKey.current += 1;
      setPainting({ url: fullUrl, attempt: 1, key: nextKey.current });
      return;
    }

    setLoaded(true);
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

  const fresh = painting.attempt === 0;
  const descriptor =
    responsive !== null && fresh && responsive.srcset !== ''
      ? { srcSet: responsive.srcset, sizes: responsive.sizes }
      : {};

  return (
    <img
      {...imageProps}
      {...descriptor}
      ref={observeElement}
      key={painting.key}
      src={painting.url}
      alt={alt}
      className={cn(!loaded && 'bg-surface-2', className)}
      // Lazy unless the caller says otherwise. Every `<img>` in a feed used to be
      // eager, so opening a twenty-post page started twenty downloads at once on
      // the connection the first one needed. The caller still wins: a hero image
      // passes `loading="eager"` and is loaded immediately.
      loading={imageProps.loading ?? 'lazy'}
      onError={handleError}
      onLoad={handleLoad}
      data-attempt={painting.attempt}
      {...(isProxied ? {} : { referrerPolicy: 'no-referrer' as const })}
      decoding={imageProps.decoding ?? 'async'}
    />
  );
}
