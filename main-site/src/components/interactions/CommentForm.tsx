import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, ProgressBar, TextField, TextareaField } from '@/design-system';
import { MediaSourcePicker } from '@/components/media/MediaSourcePicker';
import type { CommentImage } from '@/lib/interactions/interaction-types';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';
import { dataErrorKey } from '@/lib/supabase/errors';

export interface CommentFormProps {
  /**
   * Called with the words and the picture, either of which may be absent — but
   * never both. The database enforces the same rule (0120), so a client that
   * forgets it gets a refusal rather than an empty comment.
   */
  onSubmit: (body: string, image: CommentImage | null) => Promise<void>;
  onCancel?: () => void;
  placeholder: string;
  submitLabel: string;
  busy?: boolean;
  /**
   * Whether this box offers a picture. The thread composer and a reply do; the
   * edit box does not, because a comment's picture is chosen once and editing
   * the words should not silently drop it.
   */
  allowImage?: boolean;
  /**
   * The words already there when the box opens.
   *
   * Editing used to open an empty box: the member pressed edit, their comment
   * vanished from the field, and saving wrote whatever they typed over it. This
   * is why an edit box is never empty.
   */
  initialBody?: string;
}

const MAX_LENGTH = 4000;
const MAX_ALT = 280;

interface Attached {
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
}

/** The messageKey of a failed upload, so the toast says something true. */
function uploadErrorKey(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'messageKey' in error) {
    const key = (error as { messageKey?: unknown }).messageKey;
    if (typeof key === 'string' && key.length > 0) return key;
  }
  return 'media.errors.failed';
}

/** Shared by the thread composer and every reply box. */
export function CommentForm({
  onSubmit,
  onCancel,
  placeholder,
  submitLabel,
  busy = false,
  allowImage = false,
  initialBody = '',
}: CommentFormProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState<Attached | null>(null);
  const [alt, setAlt] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_LENGTH;
  const uploading = progress !== null;
  const hasContent = trimmed.length > 0 || image !== null;
  const disabled = !hasContent || tooLong || saving || busy || uploading;

  async function attach(file: File) {
    setProgress(0);
    try {
      // Loaded on demand: a reader who never attaches a picture never downloads
      // the compressor or the upload contract.
      //
      // Uploading is only half of it. `prepare_comment` (0120) accepts a picture
      // only when `media_assets` already records it against the author, and this
      // box used to upload without recording — so every comment carrying a
      // picture was refused as "your role does not allow this action", a sentence
      // about permissions for a missing row. `uploadAndRecord` writes both halves
      // or fails, and it is the same call the rest of the product makes.
      const { uploadAndRecord } = await import('@/lib/storage/upload-and-record');
      const result = await uploadAndRecord(
        file,
        {
          purpose: 'comment-image',
          onProgress: (percent) => {
            setProgress(percent);
          },
        },
        useAuthStore.getState().user?.uid ?? '',
      );
      setImage({
        url: result.url,
        thumbUrl: result.thumbUrl === '' ? result.url : result.thumbUrl,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      toast.error(t(uploadErrorKey(error)));
    } finally {
      setProgress(null);
      // Clearing the input is what lets the same file be chosen again after a
      // failure — a file input that keeps its value fires no change event.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /**
   * Puts a picture the member already has into this box.
   *
   * No upload, and no `uploadAndRecord` either: the asset row exists and belongs to
   * them, which is exactly what `prepare_comment` (0120) checks for. What is left to
   * do is carry the description across — a picture described once should not have to
   * be described again in the next box, which is how alt text ends up empty.
   */
  function attachPicked(picked: {
    url: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
    altText: string;
  }) {
    setImage({
      url: picked.url,
      thumbUrl: picked.thumbUrl.length > 0 ? picked.thumbUrl : picked.url,
      width: picked.width,
      height: picked.height,
    });
    setAlt((current) => (current.length > 0 ? current : picked.altText.slice(0, MAX_ALT)));
  }

  async function submit() {
    if (disabled) return;
    setSaving(true);
    try {
      await onSubmit(
        trimmed,
        image === null
          ? null
          : {
              url: image.url,
              thumbUrl: image.thumbUrl,
              alt: alt.trim(),
              width: image.width,
              height: image.height,
            },
      );
      setBody('');
      setImage(null);
      setAlt('');
      onCancel?.();
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextareaField
        label={placeholder}
        rows={3}
        value={body}
        maxLength={MAX_LENGTH}
        counterMax={MAX_LENGTH}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        hint={t('interactions.commentHint')}
        error={tooLong ? t('interactions.commentTooLong') : undefined}
      />

      {image === null ? null : (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-2">
          <div className="flex items-start gap-2">
            <img
              src={image.thumbUrl}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              decoding="async"
              className="h-24 w-24 shrink-0 rounded-lg border border-border object-cover"
            />
            <div className="min-w-0 flex-1">
              <TextField
                label={t('interactions.pictureDescription')}
                value={alt}
                maxLength={MAX_ALT}
                onChange={(event) => {
                  setAlt(event.target.value);
                }}
                hint={t('interactions.pictureDescriptionHint')}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setImage(null);
                setAlt('');
              }}
            >
              <X size={14} />
              <span className="fab-sr-only">{t('interactions.removePicture')}</span>
            </Button>
          </div>
        </div>
      )}

      {uploading ? (
        <div className="flex items-center gap-2" aria-live="polite">
          <ProgressBar value={progress ?? 0} label={t('interactions.pictureUploading')} />
          <span className="text-2xs text-muted">{Math.round(progress ?? 0)}%</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={disabled}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitLabel}
        </Button>

        {allowImage && image === null ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="fab-sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void attach(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading || saving}
              onClick={() => {
                fileRef.current?.click();
              }}
            >
              <ImagePlus size={14} className={cn(uploading && 'opacity-60')} />
              {t('interactions.addPicture')}
            </Button>
            <MediaSourcePicker
              purpose="comment-image"
              showUpload={false}
              max={1}
              disabled={uploading || saving}
              onFiles={(files) => {
                const file = files[0];
                if (file !== undefined) void attach(file);
              }}
              onPick={(picked) => {
                const first = picked[0];
                if (first !== undefined) attachPicked(first);
              }}
            />
          </>
        ) : null}

        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
