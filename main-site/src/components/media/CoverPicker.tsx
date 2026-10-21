import { ImagePlus, Upload, X } from 'lucide-react';
import { useId, useRef } from 'react';

import { Button, ProgressBar } from '@/design-system';
import { MediaImage } from '@/components/media/MediaImage';

/**
 * Every word this control says, supplied by the surface that owns it.
 *
 * Passed in rather than translated here so a project's cover step and an
 * event's cover field can each keep their own heading while the control itself
 * is written once. A second copy of this markup would be a second place for the
 * file input to lose its accessible name or for the preview to start trusting a
 * URL the database has not recorded yet.
 */
export interface CoverPickerLabels {
  readonly title: string;
  readonly hint: string;
  /** Names a picture that is already published, so it is not mistaken for a choice. */
  readonly existing: string;
  readonly choose: string;
  readonly replace: string;
  readonly remove: string;
  readonly uploading: string;
  readonly previewAlt: string;
}

export interface CoverPickerProps {
  /** The chosen file, or null before one is chosen and after one is removed. */
  file: File | null;
  /**
   * The local object URL for a chosen file, or the cover that is already
   * published when nothing has been chosen. Whichever it is, it is on screen
   * before any upload finishes.
   */
  previewUrl: string;
  /** Percentage while the cover uploads, or null when it is not uploading. */
  progress: number | null;
  onFileChange: (file: File | null) => void;
  /**
   * Drops a cover that is already published. Absent where nothing is published
   * yet, which is every visit to the page that creates a listing.
   */
  onRemoveExisting?: (() => void) | undefined;
  labels: CoverPickerLabels;
  /** Heading element id, so a step can be labelled by what it contains. */
  headingId?: string;
  /** Renders the title as a step heading rather than a field label. */
  asHeading?: boolean;
}

/**
 * Choose the one picture that represents a thing: a project, an event.
 *
 * The file is validated by whoever owns the state, not here, so this component
 * stays a control rather than a policy. What it does guarantee is the order a
 * member sees: a chosen file previews locally at once, the upload percentage
 * appears only while bytes are moving, and removing the picture is one tap
 * beside the preview rather than a hunt for the field it came from.
 */
export function CoverPicker({
  file,
  previewUrl,
  progress,
  onFileChange,
  onRemoveExisting,
  labels,
  headingId,
  asHeading = false,
}: CoverPickerProps) {
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = headingId ?? generatedId;

  /**
   * One word, two honest meanings. With a file chosen it puts the form back to
   * no picture; with the published cover showing it drops that cover from the
   * record. A control that offered the first and not the second left an author
   * looking at their own cover with no way to change it, because the buttons
   * that were there asked for a file that had not been chosen yet.
   */
  const remove = file !== null ? () => onFileChange(null) : onRemoveExisting;

  return (
    <div className="grid gap-4">
      <div>
        {asHeading ? (
          <h2 id={id} className="text-base font-semibold">
            {labels.title}
          </h2>
        ) : (
          <span id={id} className="text-body-sm font-semibold text-ink">
            {labels.title}
          </span>
        )}
        <p className="mt-1 text-sm text-muted">{labels.hint}</p>
      </div>

      <input
        ref={inputRef}
        id={`${id}-input`}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        aria-label={labels.choose}
        className="fab-sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0] ?? null;
          // Cleared so choosing the same file twice in a row still fires a
          // change event; a member who removes a picture and puts it back has
          // not done nothing.
          event.target.value = '';
          onFileChange(chosen);
        }}
      />

      {previewUrl.length > 0 ? (
        <figure className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="relative aspect-[16/7] w-full bg-surface-2">
            <MediaImage
              src={previewUrl}
              alt={labels.previewAlt}
              className="h-full w-full object-cover"
            />
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="fab-truncate min-w-0 text-sm font-medium">
              {file ? file.name : labels.existing}
            </span>
            {remove ? (
              <Button variant="ghost" size="sm" iconStart={<X size={14} />} onClick={remove}>
                {labels.remove}
              </Button>
            ) : null}
          </figcaption>
        </figure>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="fab-tap flex min-h-48 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2/40 px-4 text-center hover:bg-surface-2"
        >
          <ImagePlus size={28} aria-hidden="true" className="text-green-700" />
          <span className="font-semibold">{labels.choose}</span>
          <span className="text-xs text-muted">{labels.hint}</span>
        </button>
      )}

      {previewUrl.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          iconStart={<Upload size={15} />}
          onClick={() => inputRef.current?.click()}
          className="w-fit"
        >
          {labels.replace}
        </Button>
      ) : null}

      {progress !== null ? <ProgressBar value={progress} label={labels.uploading} /> : null}
    </div>
  );
}
