import { ImageOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
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

function normalizeMediaSrc(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== 'https:' &&
      parsed.protocol.startsWith('http') &&
      isRepairableMediaHost(parsed.hostname)
    ) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

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
 * Resilient, responsive image element backed directly by ImgBB + Cloudflare edge
 * delivery (`/media/i` fallback) with zero service-worker interception or
 * first-mount remount churn.
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

  const cleanSrc = normalizeMediaSrc(src);
  const cleanFallback = normalizeMediaSrc(fallbackSrc);
  const cleanVariant = normalizeMediaSrc(variantSrc);

  const rawPrimary = cleanSrc.length > 0 ? cleanSrc : cleanFallback;
  const rawFallback = cleanFallback.length > 0 && cleanFallback !== rawPrimary ? cleanFallback : '';

  const slot = typeof slotWidth === 'number' && slotWidth > 0 ? slotWidth : 0;
  const fullUrl = rawFallback.length > 0 ? rawFallback : rawPrimary;
  const mediumUrl =
    cleanVariant.length > 0 ? cleanVariant : rawPrimary !== fullUrl ? rawPrimary : '';

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
  const canProxy = allowProxy && primary.length > 0 && hostOf(primary) !== null;

  const prevPrimaryRef = useRef(primary);
  const machine = useRef<RecoveryState>(initialRecoveryState(primary));
  const upgradedLegacyThumb = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextKey = useRef(1);

  const [painting, setPainting] = useState<Painting>(() => ({
    url: primary,
    attempt: 0,
    key: 0,
  }));
  const [loaded, setLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(primary.length === 0);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // Only reset recovery state when `primary` actually changes after mount;
  // remounting the initial `<img>` key on first paint aborts in-flight loads.
  useEffect(() => {
    if (prevPrimaryRef.current === primary) return;
    prevPrimaryRef.current = primary;
    clearTimer();
    machine.current = initialRecoveryState(primary);
    upgradedLegacyThumb.current = false;
    nextKey.current += 1;
    setPainting({ url: primary, attempt: 0, key: nextKey.current });
    setLoaded(false);
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
      const { state: next, plan } = advanceRecovery(machine.current, {
        failure,
        fallbackUrl: fallback,
        primaryUrl: primary,
        canProxy,
      });
      machine.current = next;

      if (plan.step === 'give-up') {
        setGaveUp(true);
        onFailure?.();
        return;
      }

      paint(next, plan.delayMs);
    },
    [canProxy, fallback, paint, primary, onFailure],
  );

  // If a transient network drop settled into `gaveUp`, retry seamlessly when
  // connectivity returns without requiring a full page reload.
  useEffect(() => {
    if (!gaveUp || primary.length === 0) return undefined;
    const onReconnect = () => {
      const busted = withBust(primary, `retry-${Date.now().toString(36)}`);
      machine.current = {
        ...initialRecoveryState(primary),
        url: busted,
      };
      setGaveUp(false);
      setLoaded(false);
      paint(machine.current, 0);
    };
    window.addEventListener('online', onReconnect, { once: true });
    return () => window.removeEventListener('online', onReconnect);
  }, [gaveUp, paint, primary]);

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
        <span className="fab-sr-only">{t('media.gallery.imageUnavailable')}</span>
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
      loading={imageProps.loading ?? 'lazy'}
      onError={handleError}
      onLoad={handleLoad}
      data-attempt={painting.attempt}
      {...(isProxied ? {} : { referrerPolicy: 'no-referrer' as const })}
      decoding={imageProps.decoding ?? 'async'}
    />
  );
}
