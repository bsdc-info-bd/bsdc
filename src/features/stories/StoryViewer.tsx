/**
 * BSDC — src/features/stories/StoryViewer.tsx
 * Purpose : The full-frame story viewer: advance, go back, and let it end.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A frame advances on its own after five seconds, because that is the pace a story is
 *   told at, and it stops the instant a person holds the screen down — a viewer that keeps moving
 *   while you are reading the caption is a viewer nobody finishes.
 *   Every exit is reachable from the keyboard: Escape closes, arrows move, and focus returns to the
 *   ring that opened it. Reduced-motion preference removes the auto-advance entirely rather than
 *   slowing it, because the honest response to "do not animate me" is not "animate me slowly".
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Text } from '@/shared/ui';
import { usePrefersReducedMotion } from '@/shared/hooks';
import type { Locale } from '@/core/config/app';
import { hoursRemaining, storyProgress, type Story } from '@/entities/story/model';
import { markStoryViewed } from '@/entities/story/repository';

/** How long one frame is shown before it advances. */
export const FRAME_MS = 5_000;

/** Props for the story viewer. */
export interface StoryViewerProps {
  readonly frames: readonly Story[];
  readonly startIndex?: number | undefined;
  readonly locale: Locale;
  readonly viewerUid: string;
  readonly onClose: () => void;
  readonly onSeen: (storyId: string) => void;
}

/**
 * Renders the story viewer.
 * @param props component props
 * @returns the viewer element
 */
export function StoryViewer({
  frames,
  startIndex = 0,
  locale,
  viewerUid,
  onClose,
  onSeen,
}: StoryViewerProps): React.ReactElement | null {
  const { t } = useTranslation('stories');
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, frames.length - 1)),
  );
  const [held, setHeld] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lang = locale === 'bn' ? 'bn' : 'en';
  const current = frames[index];

  const go = useCallback(
    (delta: number): void => {
      setIndex((currentIndex) => {
        const next = currentIndex + delta;
        if (next < 0 || next >= frames.length) return currentIndex;
        return next;
      });
    },
    [frames.length],
  );

  const close = useCallback((): void => onClose(), [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (current === undefined) return;
    if (current.authorUid === viewerUid) return;
    const key = current.id;
    void markStoryViewed(key, viewerUid)
      .then(() => onSeen(key))
      .catch(() => {
        // A view is a courtesy, not a transaction: failing to record it never blocks the reader.
      });
  }, [current, viewerUid, onSeen]);

  useEffect(() => {
    if (held || reducedMotion || current === undefined) return;
    const timer = setTimeout(() => {
      if (index + 1 >= frames.length) close();
      else go(1);
    }, FRAME_MS);
    return () => clearTimeout(timer);
  }, [index, held, reducedMotion, frames.length, close, go, current]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, go]);

  if (current === undefined) return null;

  return (
    <div
      className="bsdc-storyViewer"
      role="dialog"
      aria-modal="true"
      aria-label={t('viewer.label')}
    >
      <div className="bsdc-storyViewer__bars" aria-hidden="true">
        {frames.map((frame, frameIndex) => (
          <span key={frame.id} className="bsdc-storyViewer__bar">
            <span
              className="bsdc-storyViewer__barFill"
              style={{
                inlineSize:
                  frameIndex < index
                    ? '100%'
                    : frameIndex > index
                      ? '0%'
                      : `${storyProgress(frame) * 100}%`,
              }}
            />
          </span>
        ))}
      </div>

      <header className="bsdc-storyViewer__head">
        <Text as="p" size="sm" lang={lang} className="bsdc-storyViewer__author">
          {current.authorName}
        </Text>
        <Text as="p" size="xs" tone="muted" lang={lang}>
          {t('viewer.expiresIn', { hours: hoursRemaining(current) })}
        </Text>
        <IconButton icon="close" label={t('viewer.close')} onClick={close} ref={closeRef} />
      </header>

      <div
        className="bsdc-storyViewer__frame"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        <img
          className="bsdc-storyViewer__image"
          src={current.mediaUrl}
          alt={current.caption.length > 0 ? current.caption : t('viewer.altFallback')}
          width={720}
          height={1280}
          loading="eager"
          decoding="async"
          style={{ backgroundColor: 'var(--bsdc-surface-sunken)' }}
        />
        {current.caption.length > 0 ? (
          <p className="bsdc-storyViewer__caption" lang={lang}>
            {current.caption}
          </p>
        ) : null}
      </div>

      <div className="bsdc-storyViewer__nav">
        <button
          type="button"
          className="bsdc-storyViewer__zone"
          onClick={() => go(-1)}
          disabled={index === 0}
        >
          <span className="bsdc-storyViewer__zoneLabel">{t('viewer.previous')}</span>
        </button>
        <button
          type="button"
          className="bsdc-storyViewer__zone"
          onClick={() => (index + 1 >= frames.length ? close() : go(1))}
        >
          <span className="bsdc-storyViewer__zoneLabel">
            {index + 1 >= frames.length ? t('viewer.finish') : t('viewer.next')}
          </span>
        </button>
      </div>
    </div>
  );
}
