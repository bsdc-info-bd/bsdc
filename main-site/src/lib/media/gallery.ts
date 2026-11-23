import type { GalleryFilter, MediaPurpose } from '@/lib/storage/media-contract';

// Re-exported so a reader of the library does not have to know that the filter list
// lives in the upload contract. It is the same list the database checks, and one
// name for it is the point.
export type { GalleryFilter };

/**
 * The library a member picks from.
 *
 * One row is one picture the member uploaded, exactly as `my_gallery` (0132)
 * returns it: the URLs, what it was for, where it is displayed right now, and what
 * they called it. Nothing here decides policy — the row's owner is enforced by the
 * function that reads it, from the caller's token, which is why no `owner_uid` is
 * carried across the wire at all.
 */
export interface GalleryImage {
  readonly id: string;
  readonly url: string;
  readonly thumbUrl: string;
  readonly purpose: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number;
  readonly mimeType: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  /** True when some surface is showing this picture right now. */
  readonly inUse: boolean;
  readonly uses: number;
  readonly surfaces: readonly string[];
  readonly altText: string;
}

/** What a surface needs to attach a picture it did not upload. */
export interface PickedMedia {
  readonly mediaId: string;
  readonly url: string;
  readonly thumbUrl: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly altText: string;
  /** Kept so a reused picture is filed under the same heading it came from. */
  readonly purpose: MediaPurpose;
}

/** A page plus the cursor that fetches the next one. */
export interface GalleryPage {
  readonly items: readonly GalleryImage[];
  /** `null` when the library has been walked to the end. */
  readonly nextCursor: GalleryCursor | null;
}

export interface GalleryCursor {
  readonly before: string;
  readonly beforeId: string;
}

/** How many tiles to ask for. 60 fills a screen of a 4-column grid twice over. */
export const GALLERY_PAGE_SIZE = 60;

/**
 * The label key for a purpose, as the gallery groups it.
 *
 * A map rather than a `t()` call with a computed key, so a purpose that has no copy
 * is a type error here instead of a chip that reads `media.gallery.purpose.mystery`.
 */
export const GALLERY_FILTER_LABEL: Record<GalleryFilter, string> = {
  all: 'media.gallery.filterAll',
  'post-image': 'media.gallery.filterPosts',
  'chat-image': 'media.gallery.filterChat',
  'comment-image': 'media.gallery.filterComments',
  avatar: 'media.gallery.filterAvatars',
  cover: 'media.gallery.filterCovers',
  'project-image': 'media.gallery.filterProjectShots',
  'project-cover': 'media.gallery.filterProjectCovers',
  'product-image': 'media.gallery.filterProducts',
  'ad-creative': 'media.gallery.filterAds',
};

/** What a picture is filed under, for a row the filter chips do not offer. */
export const GALLERY_PURPOSE_LABEL: Record<string, string> = {
  other: 'media.gallery.filterUnfiled',
};

/**
 * The words a surface name is looked up by.
 *
 * `surfaces` comes from the database, so these keys exist only for the arms of
 * `bsdc.media_references`. A name with no entry is not an error — it is a future
 * surface, and the tile says "in use" without claiming to know where.
 */
export const GALLERY_SURFACE_LABEL: Record<string, string> = {
  post: 'media.gallery.surfacePost',
  chat: 'media.gallery.surfaceChat',
  comment: 'media.gallery.surfaceComment',
  avatar: 'media.gallery.surfaceAvatar',
  cover: 'media.gallery.surfaceProfileCover',
  community: 'media.gallery.surfaceCommunity',
  page: 'media.gallery.surfacePage',
  event: 'media.gallery.surfaceEvent',
  project: 'media.gallery.surfaceProject',
  course: 'media.gallery.surfaceCourse',
  conversation: 'media.gallery.surfaceConversation',
  ad: 'media.gallery.surfaceAd',
  shop: 'media.gallery.surfaceShop',
  product: 'media.gallery.surfaceProduct',
  order: 'media.gallery.surfaceOrder',
  seo: 'media.gallery.surfaceSeo',
};

export function filterLabelKey(filter: GalleryFilter): string {
  return GALLERY_FILTER_LABEL[filter];
}

export function purposeLabelKey(purpose: string): string {
  return GALLERY_PURPOSE_LABEL[purpose] ?? `media.gallery.purpose.${purpose}`;
}

export function surfaceLabelKeys(surfaces: readonly string[]): string[] {
  return surfaces
    .map((surface) => GALLERY_SURFACE_LABEL[surface])
    .filter((key) => key !== undefined);
}

/**
 * The cursor that follows a page: its oldest row, since the sort is newest first.
 *
 * Both halves or nothing, matching the function that refuses a half cursor with
 * 22023. An empty page carries no cursor either, so a caller that keeps asking
 * cannot loop: there is no position to resume from.
 */
export function cursorAfterPage(items: readonly GalleryImage[]): GalleryCursor | null {
  const last = items[items.length - 1];
  if (last === undefined) return null;
  return { before: last.createdAt, beforeId: last.id };
}

/**
 * How many more pictures a surface may take.
 *
 * Clamped at zero, because a form that already has more attachments than its limit —
 * an eight-picture product draft opened on a phone that allows six — would otherwise
 * offer a negative number of slots, and `Array.slice(-2)` is a way to lose a picture
 * rather than a way to add one.
 */
export function roomFor(current: number, max: number): number {
  return Math.max(0, max - current);
}

/**
 * Which of the member's tiles are already attached, as a set of normalised URLs.
 *
 * Compared by address and not by asset id, because a picture can be attached twice
 * from one row (a product keeps it in an array; a post keeps it in `post_media`) and
 * the gallery's job is to stop a member adding the same photograph to the same thing
 * twice, not to model the relation.
 */
export function attachedUrls(urls: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const url of urls) {
    const normalised = normaliseMediaUrl(url);
    if (normalised.length > 0) out.add(normalised);
  }
  return out;
}

/**
 * The address of a picture, without the parts that do not identify it.
 *
 * Scheme and host are forced to https and the trailing slash is dropped, because
 * ImgBB answers the same file at `https://i.ibb.co/x/y.png` and
 * `http://i.ibb.co/x/y.png/` — and a gallery that treated those as two pictures
 * would show a member the same photograph twice and let them attach it twice.
 */
export function normaliseMediaUrl(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.protocol = 'https:';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

export function isSameMedia(a: string, b: string): boolean {
  const left = normaliseMediaUrl(a);
  return left.length > 0 && left === normaliseMediaUrl(b);
}

/**
 * A picked row, in the shape a surface stores.
 *
 * A thumbnail that the host never made falls back to the full address rather than to
 * an empty string, because every consumer of `thumbUrl` puts it in an `img` element.
 */
export function toPicked(image: GalleryImage, purpose: MediaPurpose): PickedMedia {
  return {
    mediaId: image.id,
    url: image.url,
    thumbUrl: image.thumbUrl.length > 0 ? image.thumbUrl : image.url,
    width: image.width,
    height: image.height,
    altText: image.altText,
    purpose,
  };
}

/**
 * Tiles grouped by the day they were uploaded, newest day first.
 *
 * A date above each run is the difference between a wall of thumbnails and a
 * library: "March 2026" tells a member where they are in their own history without
 * making them read a timestamp on every tile.
 */
export interface GallerySection {
  readonly key: string;
  readonly day: string;
  readonly items: readonly GalleryImage[];
}

export function groupByDay(
  items: readonly GalleryImage[],
  dayOf: (iso: string) => string = (iso) => iso.slice(0, 10),
): GallerySection[] {
  const days: string[] = [];
  const buckets: GalleryImage[][] = [];
  for (const image of items) {
    const day = dayOf(image.createdAt);
    const last = buckets[buckets.length - 1];
    if (last !== undefined && days[days.length - 1] === day) {
      last.push(image);
      continue;
    }
    days.push(day);
    buckets.push([image]);
  }
  return days.map((day, index) => ({
    key: `${day}-${buckets[index]?.[0]?.id ?? index}`,
    day,
    items: buckets[index] ?? [],
  }));
}

/**
 * Whether a search or filter change should throw away the pages already loaded.
 *
 * It always should, and the reason is worth writing down: a keyset cursor is a
 * position in a *sorted list of matches*, so a page fetched under "posts" resumed
 * under "chat" would silently skip pictures. The state that forgets this shows a
 * library that looks half empty.
 */
export function shouldResetFor(
  previous: { purpose: GalleryFilter; query: string },
  next: { purpose: GalleryFilter; query: string },
): boolean {
  // The search box is compared as the hook reads it — trimmed, because the query the
  // pages are keyed on is trimmed too. A space at the end of a word is a keystroke,
  // not a new search, and dropping a member's selection for it would be the worse
  // half of the bug.
  return previous.purpose !== next.purpose || previous.query.trim() !== next.query.trim();
}
