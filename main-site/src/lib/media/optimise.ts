/**
 * Fast, ImgBB-native responsive image selection and edge-cache routing.
 *
 * ImgBB stores each uploaded WebP at its purpose-bounded full width (e.g.
 * 1600px for posts, 1920px for covers, 512px for avatars) AND generates an
 * aspect-preserving `medium` (~640px wide) variant at upload time.
 *
 * When both `url` (full) and `variantUrl` (~640px medium) are available and
 * distinct, `responsiveSource` builds a genuine two-candidate `srcset` so
 * phones and compact feed cards download only the ~30 KB 640w variant while
 * high-DPI post headers and lightboxes receive the full crisp WebP.
 *
 * Pure module with zero imports and no DOM access.
 */

/** Layout width steps used across cards, columns, and hero headers. */
export const IMAGE_WIDTHS = [128, 256, 384, 480, 640, 960, 1280, 1920] as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/**
 * Rounds `slotWidth * devicePixelRatio` up to the next discrete width step,
 * capping devicePixelRatio at 3x so oversampled screens never over-download.
 */
export function widthFor(slotWidth: number, devicePixelRatio = 2): ImageWidth {
  const wanted = Math.max(slotWidth, 1) * Math.max(Math.min(devicePixelRatio, 3), 1);
  for (const step of IMAGE_WIDTHS) {
    if (step >= wanted) return step;
  }
  return 1920;
}

function isHttpsOrRelativeUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('/');
}

/**
 * Whether a heavy ImgBB original should be served through BSDC's Cloudflare
 * edge cache (`/media/i`) so every visitor hits the local edge PoP.
 */
export function shouldProxyForSpeed(
  url: string,
  knownBytes: number | null,
  largeBytes = 350 * 1024,
): boolean {
  if (knownBytes === null || knownBytes <= largeBytes) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'i.ibb.co' || host === 'ibb.co' || host === 'i.ibb.co.com';
  } catch {
    return false;
  }
}

/** Wraps an allowlisted URL in BSDC's edge cache/repair endpoint. */
export function proxiedUrl(url: string, proxyPath = '/media/i'): string {
  if (url.length === 0) return url;
  if (url.startsWith(`${proxyPath}?`)) return url;
  return `${proxyPath}?u=${encodeURIComponent(url)}`;
}

export interface ResponsiveSource {
  /** Fallback/primary `src` attribute. */
  src: string;
  /** Multi-resolution `srcset` when a distinct medium variant exists, otherwise `''`. */
  srcset: string;
  /** Matching `sizes` descriptor when `srcset` is non-empty, otherwise `''`. */
  sizes: string;
}

export function responsiveSource(
  url: string,
  slotWidth: number,
  options: {
    devicePixelRatio?: number;
    sizesAttribute?: string;
    variantUrl?: string;
    fullWidth?: number | null;
  } = {},
): ResponsiveSource {
  const cleanUrl = url.trim();
  const cleanVariant = (options.variantUrl ?? '').trim();
  if (cleanUrl.length === 0) {
    return { src: cleanVariant, srcset: '', sizes: '' };
  }

  const hasDistinctVariant =
    cleanVariant.length > 0 &&
    cleanVariant !== cleanUrl &&
    isHttpsOrRelativeUrl(cleanVariant) &&
    isHttpsOrRelativeUrl(cleanUrl);

  if (!hasDistinctVariant) {
    return { src: cleanUrl, srcset: '', sizes: '' };
  }

  const dpr = options.devicePixelRatio ?? 2;
  const targetWidth = widthFor(slotWidth, dpr);
  const fullDescriptor = Math.max(960, Math.min(1920, Math.round(options.fullWidth ?? 1600)));

  // When a slot cannot use more than 640 device pixels, only advertise the
  // lightweight medium variant so high-DPR phones never over-fetch on tiny tiles.
  const ceiling = widthFor(slotWidth, 3);
  const candidates =
    ceiling <= 640
      ? [`${cleanVariant} 640w`]
      : [`${cleanVariant} 640w`, `${cleanUrl} ${fullDescriptor}w`];

  const src = slotWidth <= 640 || targetWidth <= 640 ? cleanVariant : cleanUrl;
  const sizes =
    options.sizesAttribute ??
    (slotWidth >= 960
      ? '(min-width: 1024px) 640px, 100vw'
      : `(min-width: 640px) ${Math.max(1, Math.round(slotWidth))}px, 100vw`);

  return {
    src,
    srcset: candidates.join(', '),
    sizes,
  };
}

/**
 * Validates a hex dominant-colour placeholder before applying it to inline CSS.
 */
export function placeholderColour(colour: string | null | undefined): string {
  if (typeof colour !== 'string') return 'transparent';
  const trimmed = colour.trim();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return 'transparent';
  return trimmed;
}
