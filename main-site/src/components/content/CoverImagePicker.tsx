import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system';
import { MediaSourcePicker } from '@/components/media/MediaSourcePicker';
import { cn } from '@/lib/cn';
import type { PickedMedia } from '@/lib/media/gallery';
import { useAuthStore } from '@/store/auth-store';

export interface CoverCandidate {
  url: string;
  thumbUrl: string;
  altText: string;
}

export interface CoverImagePickerProps {
  /** The chosen cover URL, or an empty string when the post has none. */
  value: string;
  onChange: (url: string) => void;
  /** Pictures already attached to this post, offered as covers. */
  candidates?: readonly CoverCandidate[];
  /**
   * Called when the member takes a picture from their own library instead of
   * uploading one.
   *
   * The surface owns `cover_url`, so it owns what a pick means: the composer points
   * the post at the address the library gave it and re-files that asset as a cover.
   * Nothing is uploaded, and the address is one the platform wrote — a page cannot
   * put a stranger's picture on a post through this field, because the gallery only
   * ever returns the member's own rows. Left out, the library is not offered here.
   */
  onPick?: ((picked: PickedMedia) => void) | undefined;
  disabled?: boolean;
}

/**
 * The post's cover: one picture, chosen once, shown above the post and beside it
 * in the feed.
 *
 * `cover_url` has been on the post since the first schema and the post page has
 * always rendered it — but nothing in the composer ever set it, so every post
 * was published without one. This is the field that sets it, and it offers the
 * three things a member has to hand: a file, a picture already attached to this
 * post, and — when the composer passes `onPick` — any picture the member has ever
 * uploaded to BSDC. The last of those is the one that saves them a photo shoot for
 * a cover they took six months ago.
 */
export function CoverImagePicker({
  value,
  onChange,
  candidates = [],
  onPick,
  disabled = false,
}: CoverImagePickerProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pick(file: File) {
    setUploading(true);
    setFailed(false);
    try {
      // The same upload contract the rest of the product uses: the bytes and the
      // `media_assets` row that says who owns them, or neither.
      const { uploadAndRecord } = await import('@/lib/storage/upload-and-record');
      const result = await uploadAndRecord(
        file,
        { purpose: 'cover' },
        useAuthStore.getState().user?.uid ?? '',
      );
      onChange(result.url);
    } catch {
      setFailed(true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const chosen = value.length > 0;

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{t('compose.cover.label')}</span>

      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-border bg-surface-2',
          chosen ? 'aspect-[16/9]' : 'flex aspect-[16/9] items-center justify-center border-dashed',
        )}
      >
        {chosen ? (
          <img
            src={value}
            alt={t('compose.cover.label')}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 p-4 text-center">
            <ImagePlus size={22} aria-hidden="true" className="text-muted" />
            <p className="text-xs text-muted">{t('compose.cover.hint')}</p>
          </div>
        )}

        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-scrim/40 text-xs font-medium text-white">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t('compose.cover.uploading')}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pick(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {chosen ? t('compose.cover.replace') : t('compose.cover.add')}
        </Button>
        {onPick ? (
          <MediaSourcePicker
            compact
            showUpload={false}
            purpose="cover"
            max={1}
            disabled={disabled || uploading}
            attached={value.length > 0 ? [value] : []}
            onFiles={() => fileRef.current?.click()}
            onPick={(picked) => {
              const first = picked[0];
              if (first !== undefined) onPick(first);
            }}
          />
        ) : null}
        {chosen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => {
              onChange('');
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t('compose.cover.remove')}
          </Button>
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t('compose.cover.fromPost')}</span>
          {candidates.map((candidate) => (
            <button
              key={candidate.url}
              type="button"
              disabled={disabled || uploading}
              aria-label={`${t('compose.cover.replace')}: ${candidate.altText}`}
              aria-pressed={candidate.url === value}
              onClick={() => {
                onChange(candidate.url);
              }}
              className={cn(
                'h-12 w-16 overflow-hidden rounded-lg border-2',
                candidate.url === value ? 'border-primary' : 'border-border hover:border-primary',
              )}
            >
              <img
                src={candidate.thumbUrl.length > 0 ? candidate.thumbUrl : candidate.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="text-xs text-danger">
          {t('compose.cover.failed')}
        </p>
      ) : null}
    </div>
  );
}
