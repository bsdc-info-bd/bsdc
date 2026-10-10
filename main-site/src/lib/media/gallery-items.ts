import type { PostMediaItem } from '@/lib/content/post-repository';
import type { GalleryItem } from '@/components/media/MediaGallery';

/**
 * Turn a post's media rows into what the gallery draws.
 *
 * The key is the asset id when there is one and the address when there is not,
 * so a picture that has been uploaded but not yet recorded still renders
 * instead of colliding with its neighbour in a list keyed by address alone.
 */
export function toGalleryItems(media: readonly PostMediaItem[]): GalleryItem[] {
  return media.map((item, index) => ({
    id: item.mediaId.length > 0 ? item.mediaId : `${item.url}-${index}`,
    url: item.url,
    thumbUrl: item.thumbUrl,
    altText: item.altText,
    width: item.width ?? null,
    height: item.height ?? null,
  }));
}
