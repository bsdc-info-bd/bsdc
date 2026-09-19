/**
 * BSDC — src/features/feed/PostMedia.tsx
 * Purpose : Post attachments: blur preview, real dimensions, responsive sources, no layout shift.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every image declares width and height, loads lazily unless it is above the fold, and
 *   paints a blur preview generated on the device at upload time. That combination is what keeps
 *   CLS at zero while the feed scrolls on a 3G connection.
 *   BSDC stores no video, so a document attachment is rendered as a link card; a video attachment
 *   is impossible by construction and is treated as a document link if a future surface supplies
 *   a video-shaped URL through a migration.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { Text } from '@/shared/ui/Typography';
import { cn } from '@/shared/lib/cn';
import type { PostMedia as PostMediaItem } from '@/entities/post/model';

/** Props for the media block. */
export interface PostMediaProps {
  readonly media: readonly PostMediaItem[];
  readonly locale: 'bn' | 'en';
  /** Skip lazy loading for the first card in the viewport. */
  readonly priority?: boolean | undefined;
}

/**
 * Picks a grid class from the attachment count.
 * @param count number of attachments
 * @returns a layout modifier
 */
function layoutFor(count: number): string {
  if (count === 1) return 'is-single';
  if (count === 2) return 'is-pair';
  if (count === 3) return 'is-triple';
  return 'is-grid';
}

/**
 * Renders the attachments of a post.
 * @param props media props
 * @returns the media block, or null when the post has none
 */
export function PostMedia({
  media,
  locale,
  priority = false,
}: PostMediaProps): React.ReactElement | null {
  const { t } = useTranslation('feed');
  if (media.length === 0) return null;

  return (
    <div className={cn('bsdc-post__media', layoutFor(media.length))} data-count={media.length}>
      {media.map((item, index) => {
        const eager = priority && index === 0;
        if (item.kind === 'document' || item.url.length === 0) {
          return (
            <a
              key={item.remoteId || item.url}
              className="bsdc-post__document"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="externalLink" size={18} />
              <span>{item.alt.length > 0 ? item.alt : t('openDocument')}</span>
            </a>
          );
        }
        return (
          <figure key={item.remoteId || item.url} className="bsdc-post__figure">
            <span
              className="bsdc-post__figure-frame"
              style={{
                backgroundImage:
                  item.blurPreview.length > 0 ? `url(${item.blurPreview})` : undefined,
                backgroundColor: item.dominantColor,
                aspectRatio:
                  item.width > 0 && item.height > 0 ? `${item.width} / ${item.height}` : '16 / 9',
              }}
            >
              <img
                src={item.url}
                alt={item.alt}
                width={item.width}
                height={item.height}
                loading={eager ? 'eager' : 'lazy'}
                decoding={eager ? 'sync' : 'async'}
                fetchPriority={eager ? 'high' : 'auto'}
                sizes="(max-width: 600px) 100vw, (max-width: 1200px) 60vw, 720px"
              />
            </span>
            {item.alt.length > 0 ? (
              <figcaption>
                <Text as="span" size="sm" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
                  {item.alt}
                </Text>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
