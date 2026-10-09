import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { cn } from '@/lib/cn';
import type { GalleryItem } from './MediaGallery';

export interface LightboxProps {
  items: readonly GalleryItem[];
  index: number;
  label?: string | undefined;
  onChange: (index: number) => void;
  onClose: () => void;
}

/** How far a swipe has to travel before it counts as "next picture". */
const SWIPE_DISTANCE = 48;

/**
 * The pictures at full size, one at a time, with the keyboard and the thumb
 * both able to move through them.
 *
 * Opening a picture used to mean leaving the page — a new tab, a lost scroll
 * position, and on a phone a browser chrome that covered half of it. This keeps
 * the member where they were.
 */
export function Lightbox({ items, index, label, onChange, onClose }: LightboxProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const total = items.length;
  const current = items[Math.min(Math.max(index, 0), total - 1)];
  const position = Math.min(Math.max(index, 0), total - 1);

  useFocusTrap(panelRef, true);

  useEffect(() => {
    // A new picture is a new load; the spinner should not claim the old one.
    setLoaded(false);
  }, [position, current?.url]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (total < 2) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onChange((position + 1) % total);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onChange((position - 1 + total) % total);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        onChange(0);
      }
      if (event.key === 'End') {
        event.preventDefault();
        onChange(total - 1);
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onChange, onClose, position, total]);

  if (!current || typeof document === 'undefined') return null;

  const description =
    current.altText.length > 0 ? current.altText : t('media.lightbox.noDescription');

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? t('media.lightbox.title')}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-green-950/92 backdrop-blur-sm"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || total < 2) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) return;
        onChange(dx < 0 ? (position + 1) % total : (position - 1 + total) % total);
      }}
    >
      <div className="flex items-center justify-between gap-2 p-2 text-white/90">
        <span className="text-sm tabular-nums">
          {total > 1 ? `${position + 1} / ${total}` : null}
        </span>
        <div className="flex items-center gap-1">
          <a
            href={current.url}
            download
            className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            aria-label={t('media.lightbox.download')}
            title={t('media.lightbox.download')}
          >
            <Download size={18} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        role="presentation"
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onClick={(event) => {
          // Only the empty space closes it: a tap on the picture is not a tap
          // on the backdrop, and losing it by accident is the whole complaint.
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {total > 1 ? (
          <button
            type="button"
            onClick={() => onChange((position - 1 + total) % total)}
            aria-label={t('media.lightbox.previous')}
            className="fab-tap absolute start-1 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-green-950/50 text-white hover:bg-green-950/75 sm:start-3"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        ) : null}

        <figure className="flex max-h-full min-h-0 w-full flex-col items-center gap-2 px-2 pb-2">
          {!loaded ? (
            <span
              aria-hidden="true"
              className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
            />
          ) : null}
          <img
            src={current.url}
            // The picture is the content here, so it is never left unnamed: an
            // empty alt would hide the only thing the dialog is showing.
            alt={
              current.altText.length > 0
                ? current.altText
                : t('media.lightbox.untitled', { number: position + 1 })
            }
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={cn(
              'max-h-[74dvh] w-auto max-w-full rounded-lg object-contain shadow-sheet transition-opacity duration-200 ease-app',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            style={{ objectPosition: 'center' }}
          />
          <figcaption className="max-w-prose px-2 text-center text-sm text-white/80">
            {description}
          </figcaption>
        </figure>

        {total > 1 ? (
          <button
            type="button"
            onClick={() => onChange((position + 1) % total)}
            aria-label={t('media.lightbox.next')}
            className="fab-tap absolute end-1 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-green-950/50 text-white hover:bg-green-950/75 sm:end-3"
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex justify-center gap-1.5 overflow-x-auto p-2">
          {items.map((item, thumbIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(thumbIndex)}
              aria-label={`${t('media.lightbox.goTo')} ${thumbIndex + 1}`}
              aria-current={thumbIndex === position}
              className={cn(
                'h-12 w-12 shrink-0 overflow-hidden rounded-md border transition-colors duration-150 ease-app',
                thumbIndex === position
                  ? 'border-white'
                  : 'border-white/25 opacity-70 hover:opacity-100',
              )}
            >
              <img
                src={item.thumbUrl.length > 0 ? item.thumbUrl : item.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
