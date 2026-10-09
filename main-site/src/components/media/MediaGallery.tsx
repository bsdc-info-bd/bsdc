import { useCallback, useState } from 'react';
import { cn } from '@/lib/cn';
import { arrangeMedia, type SizedMedia } from '@/lib/media/arrangement';
import { Lightbox } from './Lightbox';

/**
 * The priority hint, spelled the way the DOM wants it.
 *
 * React 18 does not know the camelCase prop and warns about it, so it is passed
 * as the attribute the browser actually reads. The first picture in a card is
 * usually the largest contentful paint on the page.
 */
const HIGH_PRIORITY: Record<string, string> = { fetchpriority: 'high' };

/** One picture in a gallery: everything the renderer needs and nothing more. */
export interface GalleryItem extends SizedMedia {
  id: string;
  url: string;
  thumbUrl: string;
  altText: string;
}

export interface MediaGalleryProps {
  items: readonly GalleryItem[];
  /**
   * Bleed to the edges of the card this sits in and square off the top corners:
   * a single picture is the post's header, not a box inside it.
   */
  flush?: boolean;
  /** Load the first picture at full priority — it is the card's LCP element. */
  priority?: boolean;
  /** Alt text for the lightbox caption comes from the picture; this labels the grid. */
  label?: string | undefined;
  className?: string | undefined;
  /** Called with the picture a member opened, for analytics that already exist. */
  onOpen?: ((index: number) => void) | undefined;
}

/**
 * The pictures of a post, laid out by the arrangement the sizes ask for.
 *
 * Every box has its aspect ratio before a byte arrives, so the feed does not
 * jump as pictures load — the sizes came from the upload, which measured them
 * in the browser before it sent anything.
 */
export function MediaGallery({
  items,
  flush = false,
  priority = false,
  label,
  className,
  onOpen,
}: MediaGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const arrangement = arrangeMedia(items);

  const open = useCallback(
    (index: number) => {
      setOpenIndex(index);
      onOpen?.(index);
    },
    [onOpen],
  );

  if (arrangement.layout === 'empty') return null;

  return (
    <>
      <div
        role={arrangement.cells.length > 1 ? 'group' : undefined}
        aria-label={label}
        className={cn(
          'grid gap-1.5 overflow-hidden',
          flush && '-mx-3 -mt-3 rounded-t-card sm:-mx-4 sm:-mt-4',
          !flush && 'rounded-card',
          className,
        )}
        style={{
          gridTemplateColumns: `repeat(${arrangement.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${arrangement.rows}, auto)`,
        }}
      >
        {arrangement.cells.map((cell, position) => {
          const item = items[cell.index];
          if (!item) return null;
          const first = position === 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => open(cell.index)}
              aria-label={
                item.altText.length > 0
                  ? item.altText
                  : label
                    ? `${label} ${cell.index + 1}`
                    : undefined
              }
              className={cn(
                'fab-tap group relative block w-full overflow-hidden bg-surface-2',
                !flush && 'rounded-lg',
                flush && first && 'rounded-tl-card',
                flush && first && arrangement.cells.length === 1 && 'rounded-tr-card',
              )}
              style={{
                aspectRatio: cell.ratio,
                gridColumn: cell.columnSpan > 1 ? `span ${cell.columnSpan}` : undefined,
                gridRow: cell.rowSpan > 1 ? `span ${cell.rowSpan}` : undefined,
              }}
            >
              <img
                src={item.thumbUrl.length > 0 ? item.thumbUrl : item.url}
                alt={item.altText}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
                loading={priority && first ? 'eager' : 'lazy'}
                decoding="async"
                {...(priority && first ? HIGH_PRIORITY : {})}
                draggable={false}
                className="h-full w-full object-cover transition-transform duration-300 ease-app group-hover:scale-[1.02]"
                style={{ objectPosition: cell.align }}
              />
              {cell.overflow > 0 ? (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-green-950/55 transition-colors duration-150 ease-app group-hover:bg-green-950/45"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white">
                    +{cell.overflow}
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      {openIndex !== null ? (
        <Lightbox
          items={items}
          index={openIndex}
          label={label}
          onChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  );
}
