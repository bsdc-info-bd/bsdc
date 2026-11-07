/**
 * The address a picture should actually be fetched from.
 *
 * ## The problem this solves
 *
 * Every picture on the platform is fetched at the size it was uploaded at. A
 * member takes a 4 MB photograph on a phone, the feed draws it in a 360-pixel
 * card, and the browser downloads all four megabytes and then throws three and a
 * half of them away. Twenty cards down a feed is eighty megabytes of somebody's
 * mobile data, and it is why the site feels slow on a phone in a country where
 * the phone is the computer.
 *
 * Cloudinary can fix that in the URL. `res.cloudinary.com/<cloud>/image/upload/
 * <name>.jpg` accepts `c_fill,w_480,f_auto,q_auto` and returns a properly sized,
 * properly formatted picture — WebP or AVIF when the browser says it takes one,
 * at an automatic quality, usually a twentieth of the bytes.
 *
 * ImgBB cannot. It serves the original and ignores every parameter, which used to
 * mean every ImgBB picture is downloaded at full size. The edge proxy
 * (`/media/i`) can help — but a proxy that does the resizing itself would need a
 * decoder at the edge, and Cloudflare's free plan has no image resizing. What the
 * proxy *can* do is what it already does: fetch once, cache at the edge for a day,
 * and serve every device from there. That turns twenty downloads of four
 * megabytes into one, and it is why the proxies are used for large ImgBB
 * pictures rather than only as a repair.
 *
 * ## The rules
 *
 * 1. Cloudinary URLs get a width, a format and a quality. Nothing else is
 *    touched, and a URL that already carries a transform is left alone — the
 *    upload path already wrote a good one.
 * 2. ImgBB URLs are never rewritten. Rewriting produces a URL ImgBB does not
 *    understand and did not ask for, which is how a hotlink check starts refusing
 *    a site.
 * 3. Anything from a third party (a Google or GitHub avatar) is left exactly as
 *    it arrived, because it is not ours to transform.
 * 4. A URL that is not a picture at all is returned unchanged. Sizes are for
 *    pictures.
 *
 * Pure, no imports, no DOM. The service worker bundle, the main bundle and the
 * edge bundle all reach this file.
 */

/** Where a picture is going to be drawn. Each step is a real layout width. */
export const IMAGE_WIDTHS = [128, 256, 384, 480, 640, 960, 1280, 1920] as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/**
 * The width to ask for, given the slot the picture will be drawn in.
 *
 * Rounds **up** to the next step, because a picture scaled up looks worse than
 * one scaled down and the difference in bytes between 384 and 480 is smaller than
 * the difference in how it looks on a 3x phone. Never asks for more than the slot
 * can use at the highest device pixel ratio a phone reports, and never less than
 * 128 — below that a face is a smudge.
 */
export function widthFor(slotWidth: number, devicePixelRatio = 2): ImageWidth {
  const wanted = Math.max(slotWidth, 1) * Math.max(Math.min(devicePixelRatio, 3), 1);
  for (const step of IMAGE_WIDTHS) {
    if (step >= wanted) return step;
  }
  return 1920;
}

/** Cloudinary's delivery host, and the only host this file rewrites. */
const CLOUDINARY_HOST = 'res.cloudinary.com';

/** A URL that already has a transform between `/upload/` and the file name. */
const ALREADY_TRANSFORMED = /\/upload\/(?:[a-z]{1,3}_[^/]+\/|[^/]*,)/i;

function isCloudinary(hostname: string): boolean {
  return hostname.toLowerCase() === CLOUDINARY_HOST;
}

/**
 * A Cloudinary URL resized for a slot, or the URL it was given.
 *
 * `f_auto` asks for the smallest format the browser accepts — AVIF, then WebP,
 * then JPEG — and `q_auto` lets Cloudinary pick a quality that survives a
 * side-by-side comparison at roughly a tenth of the bytes. Both are Cloudinary's
 * own transforms, not a guess about image encoding made here.
 */
export function optimisedCloudinaryUrl(url: string, width: number): string {
  if (url.length === 0) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isCloudinary(parsed.hostname) || !parsed.pathname.includes('/image/upload/')) {
    return url;
  }
  if (ALREADY_TRANSFORMED.test(parsed.pathname)) return url;

  const transform = `c_fill,g_auto,w_${Math.round(width)},f_auto,q_auto`;
  parsed.pathname = parsed.pathname.replace('/image/upload/', `/image/upload/${transform}/`);
  return parsed.toString();
}

/**
 * Whether a picture should be fetched through this origin rather than the host.
 *
 * True for an ImgBB picture above `largeBytes`, because the edge caches it once
 * and serves every device from that copy. Below the threshold the extra hop costs
 * more than it saves — a small picture is already a single fast round trip to a
 * host with better reach than ours.
 */
export function shouldProxyForSpeed(
  url: string,
  knownBytes: number | null,
  largeBytes = 512 * 1024,
): boolean {
  if (knownBytes === null || knownBytes <= largeBytes) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'i.ibb.co' || host === 'ibb.co';
  } catch {
    return false;
  }
}

/** The same URL through this origin's repair-and-cache endpoint. */
export function proxiedUrl(url: string, proxyPath = '/media/i'): string {
  if (url.length === 0) return url;
  if (url.startsWith(`${proxyPath}?`)) return url;
  return `${proxyPath}?u=${encodeURIComponent(url)}`;
}

/**
 * The address to put in `src`, and the address to put in `srcset`.
 *
 * `srcset` is the other half of the fix. A browser that is told a picture exists
 * at 384 and 960 pixels fetches the one that fits *before* it starts, instead of
 * fetching a large one and scaling it down in memory. `sizes` has to be honest or
 * the browser picks wrongly, so the caller states the slot width it is drawing
 * into and this writes the descriptor list from the same ladder.
 */
export interface ResponsiveSource {
  /** What goes in `src`: one URL that works everywhere. */
  src: string;
  /** What goes in `srcset`, or empty when the host cannot be resized. */
  srcset: string;
  /** What goes in `sizes`, or empty when there is no `srcset`. */
  sizes: string;
}

export function responsiveSource(
  url: string,
  slotWidth: number,
  options: { devicePixelRatio?: number; sizesAttribute?: string } = {},
): ResponsiveSource {
  const dpr = options.devicePixelRatio ?? 2;
  const fallback = widthFor(slotWidth, dpr);
  const src = optimisedCloudinaryUrl(url, fallback);

  // Only a host that can be resized gets a descriptor list. Fabricating widths
  // for ImgBB would make the browser fetch the same original two or three times.
  if (src === url) return { src, srcset: '', sizes: '' };

  // Up to three times the slot: that is the widest a phone reports, so a
  // descriptor beyond it is a download nothing can display.
  const ceiling = widthFor(slotWidth, 3);
  const candidates: string[] = [];
  for (const width of IMAGE_WIDTHS) {
    if (width > ceiling) break;
    candidates.push(`${optimisedCloudinaryUrl(url, width)} ${width}w`);
  }
  return {
    src,
    srcset: candidates.join(', '),
    sizes:
      options.sizesAttribute ??
      (slotWidth >= 960
        ? '(min-width: 1024px) 640px, 100vw'
        : `(min-width: 640px) ${slotWidth}px, 100vw`),
  };
}

/**
 * A placeholder the card can paint before the picture arrives.
 *
 * The average picture on a slow connection takes a second and a half, and a card
 * that is a flat grey rectangle for a second and a half reads as a broken card.
 * The picture's own dominant colour arrives with the row, costs nothing to paint,
 * and makes the wait look like part of the design.
 */
export function placeholderColour(colour: string | null | undefined): string {
  if (typeof colour !== 'string') return 'transparent';
  const trimmed = colour.trim();
  // `#rgb`, `#rrggbb`, and nothing else: this value goes into a style attribute,
  // and a value from a database is not a place to accept arbitrary CSS.
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return 'transparent';
  return trimmed;
}
