import { Images, Loader2, Maximize2, RotateCcw, Search, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Alert, Button, Chip, EmptyState, IconButton, Skeleton } from '@/design-system';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { GALLERY_FILTERS, type MediaPurpose } from '@/lib/storage/media-contract';
import {
  attachedUrls,
  filterLabelKey,
  groupByDay,
  shouldResetFor,
  surfaceLabelKeys,
  toPicked,
  type GalleryImage,
  type GalleryFilter,
  type PickedMedia,
} from '@/lib/media/gallery';
import { MediaImage } from './MediaImage';
import { Lightbox } from './Lightbox';
import { useGallery } from './use-gallery';
import type { GalleryItem } from './MediaGallery';

export interface GalleryPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** What a fresh upload from inside the dialog is filed under. */
  purpose: MediaPurpose;
  /**
   * How many pictures this surface can still take. The host passes what is left,
   * not its total: a post that already holds four of six sends 2 here, and the
   * dialog then refuses to select a third instead of accepting one it will drop.
   */
  max: number;
  /** Called with what the member chose, in the order they chose it. */
  onPick: (picked: PickedMedia[]) => void;
  /**
   * Hands the member's own files to the surface that opened the dialog.
   *
   * Optional, because not every surface can take more than one picture — a cover
   * that was given two files would have to silently drop one, and a control that
   * drops what it was handed is worse than one that never offered it.
   */
  onDevice?: ((files: File[]) => void) | undefined;
  /** URLs already on the surface, so a tile can say "already added". */
  attached?: readonly string[];
  /** The library is re-read after a device upload, so the new tile shows up. */
  onUploaded?: (() => void) | undefined;
}

/** Tiles per row at each breakpoint, for arrow-key movement in the grid. */
function columnsFor(width: number): number {
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 480) return 3;
  return 2;
}

/**
 * The member's own pictures, in one place, pickable.
 *
 * A reuse control, not a photo viewer, and the design follows from that: somebody
 * looking for the one picture they remember needs search, filters built from what
 * they were uploading at the time, and a date above each run of tiles. Every tile
 * they touch here is a picture that is already hosted and already theirs — picking
 * it adds no bytes anywhere, costs nothing against the quota, and leaves the file
 * with one home at the host instead of two.
 *
 * What it does not do is make the member choose a source before they have seen the
 * other one. `onDevice` lives in this same dialog, because "upload or pick?" is a
 * question a person can only answer after they know what the library holds.
 */
export function GalleryPickerDialog({
  open,
  onClose,
  purpose,
  max,
  onPick,
  onDevice,
  attached = [],
  onUploaded,
}: GalleryPickerDialogProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const panelRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // The ref arrow-key movement counts and looks up tiles through. It is on the scroll
  // container and not on a section's grid: the days are sections, a ref written by
  // every one of them ends up holding the last, and then the arrows count the whole
  // library while reaching into one run of it — which is how a grid loses a keyboard.
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const gallery = useGallery({ enabled: open, purpose: filter, query });
  // The trap is released while the lightbox is up: it is a second overlay, and two
  // traps in a document fight over Tab.
  useFocusTrap(panelRef, open && preview === null);

  const attachedSet = useMemo(() => attachedUrls(attached), [attached]);
  const byId = gallery.byId;

  // Selection is keyed by id and resolved against whatever is loaded, so a member
  // can pick from page one, scroll to page four, pick again, and have both arrive in
  // the order they touched them.
  const chosen = useMemo(
    () =>
      selected
        .map((id) => byId.get(id))
        .filter((image): image is GalleryImage => image !== undefined),
    [selected, byId],
  );

  const sections = useMemo(
    () => groupByDay(gallery.items, (iso) => dayHeading(iso, language)),
    [gallery.items, language],
  );

  // A different filter or a different word is a different list of matches, so what
  // was selected in the old one cannot survive into the new: the ids would still be
  // held while the tiles that showed them are gone, and a member would find the Add
  // button counting pictures they can no longer see.
  const criteria = useMemo(() => ({ purpose: filter, query }), [filter, query]);
  const previousCriteria = useRef(criteria);
  useEffect(() => {
    if (shouldResetFor(previousCriteria.current, criteria)) setSelected([]);
    previousCriteria.current = criteria;
  }, [criteria]);

  useEffect(() => {
    if (open) return;
    setSelected([]);
    setQuery('');
    setFilter('all');
    setPreview(null);
    setActive(0);
  }, [open]);

  // An infinite scroll a pointer alone can drive is not an interface. The sentinel
  // handles the hands-free case; the button beneath it is what a keyboard reaches,
  // and what still works when a browser throttles observers in a background tab —
  // precisely when a member returns to a dialog that had stopped loading.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || !gallery.hasMore || gallery.loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) gallery.loadMore();
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [gallery]);

  const commit = useCallback(
    (ids: readonly string[]) => {
      const picked = ids
        .map((id) => byId.get(id))
        .filter((image): image is GalleryImage => image !== undefined)
        .map((image) => toPicked(image, purpose));
      if (picked.length === 0) return;
      onPick(picked);
      onClose();
    },
    [byId, onClose, onPick, purpose],
  );

  const toggle = useCallback(
    (image: GalleryImage) => {
      // A single-picture surface picks on touch, because a footer button asking
      // "use this?" after the member already used it is one more tap for nothing.
      if (max <= 1) {
        commit([image.id]);
        return;
      }
      setSelected((current) => {
        if (current.includes(image.id)) return current.filter((id) => id !== image.id);
        if (current.length >= max) return current;
        return [...current, image.id];
      });
    },
    [commit, max],
  );

  /**
   * Arrow keys walk the grid from whichever tile already has focus.
   *
   * Bound per tile rather than on the container, because a plain div with a key
   * handler is a listener nothing can reach: the tiles are the focusable things
   * here, and they are where the arrows are actually pressed.
   */
  function onTileKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const total = gallery.items.length;
    if (total === 0) return;
    const columns = columnsFor(gridRef.current?.clientWidth ?? 1024);
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    const delta = moves[event.key] ?? null;
    // Movement is from the tile that was actually pressed, not from a remembered
    // "active" index: the two can diverge when a filter change reshuffles the grid
    // under a focus that never moved, and arrows that jump back to an old position
    // feel like a stuck keyboard.
    let next: number | null = null;
    if (delta !== null) next = Math.min(Math.max(index + delta, 0), total - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = total - 1;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-tile]')[next]?.focus();
  }

  function takeDeviceFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    onDevice?.(list);
    // The library gains a picture as soon as the row is recorded, and somebody who
    // just took one expects to find it there. The surface owns the upload, so this
    // can only be a nudge to re-read — which is also why it is harmless if the
    // upload fails: an empty refresh costs a request and promises nothing.
    onUploaded?.();
  }

  const previewItems: GalleryItem[] = gallery.items.map((image) => ({
    id: image.id,
    url: image.url,
    thumbUrl: image.thumbUrl,
    altText: image.altText,
    width: image.width,
    height: image.height,
  }));

  if (!open || typeof document === 'undefined') return null;

  const filtering = query.trim().length > 0 || filter !== 'all';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t('media.gallery.close')}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-scrim/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('media.gallery.title')}
        tabIndex={-1}
        className="relative z-10 flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden border border-border bg-bg shadow-sheet sm:h-[86dvh] sm:rounded-card"
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Images size={18} aria-hidden="true" className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="fab-truncate text-base font-semibold">{t('media.gallery.title')}</h2>
            <p className="fab-truncate text-2xs text-muted" aria-live="polite">
              {gallery.loading && gallery.items.length === 0
                ? t('media.gallery.loading')
                : t('media.gallery.count', { count: gallery.items.length })}
              {gallery.stale ? ` · ${t('media.gallery.refreshing')}` : ''}
            </p>
          </div>
          {onDevice ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple={max > 1}
                aria-label={t('media.gallery.uploadDevice')}
                className="fab-sr-only"
                onChange={(event) => {
                  takeDeviceFiles(event.target.files);
                  // Cleared, so choosing the same file twice fires a change event.
                  event.target.value = '';
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                iconStart={<Upload size={15} />}
                onClick={() => fileRef.current?.click()}
              >
                {t('media.gallery.uploadDevice')}
              </Button>
            </>
          ) : null}
          <IconButton icon={<X size={18} />} label={t('media.gallery.close')} onClick={onClose} />
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <label className="relative min-w-40 flex-1">
            <span className="fab-sr-only">{t('media.gallery.searchLabel')}</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('media.gallery.searchPlaceholder')}
              className="h-9 w-full rounded-full border border-border bg-surface pl-8 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <div
            className="fab-scroll -mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 py-0.5"
            role="group"
            aria-label={t('media.gallery.filters')}
          >
            {GALLERY_FILTERS.map((option) => (
              <Chip
                key={option}
                selected={filter === option}
                onClick={() => setFilter(option)}
                className="shrink-0"
              >
                {t(filterLabelKey(option))}
              </Chip>
            ))}
          </div>
        </div>

        <div ref={gridRef} className="fab-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {gallery.failed ? (
            <div className="grid gap-2">
              <Alert tone="danger" title={t('media.gallery.errorTitle')}>
                {t(gallery.errorKey)}
              </Alert>
              <Button
                variant="secondary"
                size="sm"
                iconStart={<RotateCcw size={14} />}
                onClick={() => gallery.refresh()}
                className="w-fit"
              >
                {t('media.gallery.retry')}
              </Button>
            </div>
          ) : gallery.loading && gallery.items.length === 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 12 }, (_unused, index) => (
                <Skeleton key={index} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : gallery.items.length === 0 ? (
            <EmptyState
              icon={<Images size={26} />}
              title={t(filtering ? 'media.gallery.noMatches' : 'media.gallery.empty')}
              description={t(filtering ? 'media.gallery.noMatchesHint' : 'media.gallery.emptyHint')}
              action={
                filtering ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  >
                    {t('media.gallery.clearFilters')}
                  </Button>
                ) : onDevice ? (
                  <Button
                    variant="primary"
                    size="sm"
                    iconStart={<Upload size={15} />}
                    onClick={() => fileRef.current?.click()}
                  >
                    {t('media.gallery.uploadDevice')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3">
              {sections.map((section) => (
                <section key={section.key}>
                  <h3 className="sticky top-0 z-10 -mx-3 mb-1.5 bg-bg/95 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
                    {section.day}
                  </h3>
                  <div
                    role="group"
                    aria-label={`${t('media.gallery.grid')} — ${section.day}`}
                    className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                  >
                    {section.items.map((image) => {
                      const index = gallery.items.indexOf(image);
                      const order = selected.indexOf(image.id);
                      const isSelected = order >= 0;
                      const isAttached = attachedSet.has(image.url);
                      const isFull = !isSelected && max > 1 && selected.length >= max;
                      const tall =
                        image.width !== null &&
                        image.height !== null &&
                        image.height / image.width > 1.6;
                      return (
                        <div key={image.id}>
                          <button
                            type="button"
                            data-tile
                            tabIndex={index === active ? 0 : -1}
                            onFocus={() => setActive(index)}
                            onClick={() => toggle(image)}
                            onKeyDown={(event) => onTileKeyDown(event, index)}
                            disabled={isFull}
                            aria-pressed={max > 1 ? isSelected : undefined}
                            aria-label={
                              image.altText.length > 0
                                ? image.altText
                                : t('media.gallery.tileNoAlt')
                            }
                            className={cn(
                              'fab-tap group relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-2',
                              'transition-[box-shadow,opacity] duration-150 ease-app',
                              isSelected
                                ? 'ring-2 ring-primary'
                                : 'ring-1 ring-border hover:ring-2 hover:ring-primary/40',
                              isAttached && 'opacity-70',
                              isFull && 'cursor-not-allowed opacity-40',
                            )}
                          >
                            <MediaImage
                              src={image.thumbUrl.length > 0 ? image.thumbUrl : image.url}
                              variantSrc={image.url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              // A screenshot of a terminal cropped to a square
                              // loses its middle; a tall picture keeps its shape and
                              // starts at the top, where the text is.
                              className={cn('h-full w-full object-cover', tall && 'object-top')}
                            />
                            {isSelected ? (
                              <span
                                aria-hidden="true"
                                className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-on-primary"
                              >
                                {order + 1}
                              </span>
                            ) : null}
                            <span
                              aria-hidden="true"
                              className={cn(
                                'fab-truncate absolute inset-x-1 bottom-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold leading-4',
                                isAttached
                                  ? 'bg-blue-fill text-on-blue'
                                  : 'bg-surface/85 text-muted',
                              )}
                            >
                              {isAttached
                                ? t('media.gallery.alreadyAttached')
                                : usageNote(image, t, language)}
                            </span>
                          </button>
                          {max > 1 ? (
                            // The tile is the pick; this is the look. Nested inside
                            // the tile they would be one target doing two things —
                            // which is how a member ends up attaching the picture
                            // they only wanted to see — and a span with a click
                            // handler is unreachable without a mouse. So it is a
                            // sibling button, present whenever the tile it belongs
                            // to holds the grid's tab stop.
                            <button
                              type="button"
                              aria-label={t('media.gallery.preview')}
                              onClick={() => setPreview(index)}
                              className={cn(
                                'absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full',
                                'bg-scrim/50 text-bg transition-opacity',
                                index === active
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100',
                              )}
                            >
                              <Maximize2 size={12} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div ref={sentinelRef} className="flex justify-center py-2">
                {gallery.loadingMore ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted">
                    <Loader2 size={14} aria-hidden="true" className="animate-spin" />
                    {t('media.gallery.loadingMore')}
                  </span>
                ) : gallery.hasMore ? (
                  <Button variant="ghost" size="sm" onClick={() => gallery.loadMore()}>
                    {t('media.gallery.loadMore')}
                  </Button>
                ) : (
                  <span className="text-2xs text-muted">{t('media.gallery.endOfLibrary')}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {max > 1 ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-3 py-2">
            {chosen.length === 0 ? (
              <p className="min-w-0 flex-1 text-xs text-muted">
                {t('media.gallery.pickHint', { count: max })}
              </p>
            ) : (
              <ul className="fab-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                {chosen.map((image, index) => (
                  <li key={image.id}>
                    <span className="relative block h-10 w-10 overflow-hidden rounded-md ring-1 ring-border">
                      <MediaImage
                        src={image.thumbUrl.length > 0 ? image.thumbUrl : image.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 right-0 bg-primary px-1 text-2xs font-bold text-on-primary"
                      >
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={`${t('media.gallery.unpick')} — ${
                          image.altText.length > 0 ? image.altText : t('media.gallery.tileNoAlt')
                        }`}
                        onClick={() =>
                          setSelected((current) => current.filter((id) => id !== image.id))
                        }
                        className="absolute inset-0 flex items-center justify-center bg-scrim/60 text-bg opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <span className="sr-only" aria-live="polite">
              {t('media.gallery.selectedCount', { count: chosen.length })}
            </span>
            <Button
              variant="primary"
              size="sm"
              disabled={chosen.length === 0}
              onClick={() => commit(selected)}
            >
              {chosen.length === 0
                ? t('media.gallery.add')
                : t('media.gallery.addCount', { count: chosen.length })}
            </Button>
          </footer>
        ) : null}
      </div>

      {preview !== null ? (
        <Lightbox
          items={previewItems}
          index={preview}
          label={t('media.gallery.title')}
          onChange={setPreview}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/** The translation function, as react-i18next types it. Inferred rather than
 * hand-written: a signature copied here drifts from the real one and the compiler
 * blames the caller. */
type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * The line under a tile: where this picture is now, or how big it is.
 *
 * "In your posts" is the useful hint when a member is deciding whether a picture is
 * the one they remember, and it is the same fact that stops them from assuming a
 * reused picture needs re-uploading. A picture that is not displayed anywhere says
 * its size instead, because for an orphan the only interesting thing is whether it is
 * worth taking.
 */
function usageNote(image: GalleryImage, t: Translate, language: 'en' | 'bn'): string {
  if (image.inUse) {
    const keys = surfaceLabelKeys(image.surfaces);
    if (keys.length === 0) return t('media.gallery.inUse');
    const where = keys.map((key) => t(key)).join(language === 'bn' ? ', ' : ', ');
    return image.uses > 1 ? t('media.gallery.inUseMany', { where, count: image.uses }) : where;
  }
  return formatBytes(image.bytes, language);
}

/**
 * The day a group of tiles belongs to, in the member's own timezone and script.
 *
 * `createdAt.slice(0, 10)` would group by UTC, and a picture posted at 9pm in Dhaka
 * is yesterday to nobody who took it.
 */
function dayHeading(iso: string, language: 'en' | 'bn'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD-u-nu-beng' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
