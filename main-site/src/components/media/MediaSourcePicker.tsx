import { Images, Upload } from 'lucide-react';
import { lazy, Suspense, useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system';
import { cn } from '@/lib/cn';
import type { MediaPurpose } from '@/lib/storage/media-contract';
import type { PickedMedia } from '@/lib/media/gallery';

/**
 * One import, two uses.
 *
 * `lazy` splits the dialog into its own chunk so a page that merely *can* open a
 * gallery does not download one; the second use is the hover-and-focus prefetch
 * below, which starts the same chunk the moment a member shows intent, so the split
 * costs them nothing they can feel. Both expressions must be textually identical or
 * the bundler emits two chunks and the prefetch warms the wrong one.
 */
const GalleryPickerDialog = lazy(() =>
  import('./GalleryPickerDialog').then((module) => ({ default: module.GalleryPickerDialog })),
);

/** Both uses spell the specifier identically, which is what keeps one chunk. */
function importGallery(): void {
  void import('./GalleryPickerDialog');
}

export interface MediaSourcePickerProps {
  /** What a new upload is filed as, and what a pick is added alongside. */
  purpose: MediaPurpose;
  /** How many pictures the surface can still take. */
  max?: number;
  /** What the member chose from their device. */
  onFiles: (files: File[]) => void;
  /** What the member chose from their library. */
  onPick: (picked: PickedMedia[]) => void;
  /** Whether the device input accepts more than one file. */
  multiple?: boolean;
  /**
   * Set when the surface already has its own way to choose a file — a cover field
   * with a Replace button, say — and only needs the library half.
   */
  showUpload?: boolean;
  /** Only the library half, as an icon button beside an existing control. */
  compact?: boolean;
  /** URLs already on the surface, so the dialog can mark them. */
  attached?: readonly string[];
  /** Called after a device upload, so the library re-reads. */
  onUploaded?: (() => void) | undefined;
  disabled?: boolean;
  className?: string;
}

/**
 * "Upload a picture" and "pick one you already have", as one control.
 *
 * Every place on the site that takes an image had the first half and not the second,
 * which is how a member ends up photographing their own screen to move a picture from
 * one part of an account to another. The pair is presented together on purpose: a
 * single button labelled "Add picture" that then asks the question is one more tap on
 * the most common path (a phone, where the file picker *is* a gallery) and one more
 * decision on the least common one.
 *
 * This component owns no upload and no state of the attachment. It is the door, not
 * the room: `onFiles` and `onPick` hand the surface exactly what its existing code
 * already knows how to store, so a picture chosen from the library takes the same
 * path — the same RPC, the same validation, the same owner check — as one that was
 * just uploaded, and cannot smuggle a reference the database has not recorded.
 */
export function MediaSourcePicker({
  purpose,
  max = 1,
  onFiles,
  onPick,
  multiple = false,
  showUpload = true,
  compact = false,
  attached = [],
  onUploaded,
  disabled = false,
  className,
}: MediaSourcePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Warming the chunk on hover and on focus costs one request a member was about to
  // make anyway, and turns "tap, then wait" into "tap".
  const warm = useCallback(() => {
    void importGallery();
  }, []);

  function take(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset first, so choosing the same file after a removal fires a change event.
    event.target.value = '';
    if (files.length === 0) return;
    onFiles(files);
  }

  return (
    <>
      {showUpload ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            multiple={multiple}
            aria-label={t('media.gallery.uploadDevice')}
            className="fab-sr-only"
            onChange={take}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconStart={<Upload size={15} />}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className={cn(compact ? undefined : 'min-w-0 flex-1', className)}
          >
            {t('media.upload')}
          </Button>
        </>
      ) : null}
      {compact ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          iconStart={<Images size={15} />}
          disabled={disabled}
          onMouseEnter={warm}
          onFocus={warm}
          onClick={() => setOpen(true)}
          className={cn('shrink-0', showUpload ? undefined : className)}
        >
          {t('media.gallery.open')}
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          iconStart={<Images size={15} />}
          disabled={disabled}
          onMouseEnter={warm}
          onFocus={warm}
          onClick={() => setOpen(true)}
          className={cn('min-w-0 flex-1', className)}
        >
          {t('media.gallery.open')}
        </Button>
      )}
      {open ? (
        <Suspense fallback={null}>
          <GalleryPickerDialog
            open={open}
            onClose={() => setOpen(false)}
            purpose={purpose}
            max={max}
            attached={attached}
            onUploaded={onUploaded}
            // The dialog carries its own file input, so "upload" can sit beside the
            // grid: a member who searches, finds nothing, and wants to add the photo
            // they took ten minutes ago should not have to close the dialog to do it.
            // The bytes it collects go to the same `onFiles` the trigger uses, which
            // is what keeps one validation path for both doors.
            onDevice={showUpload ? onFiles : undefined}
            onPick={onPick}
          />
        </Suspense>
      ) : null}
    </>
  );
}
