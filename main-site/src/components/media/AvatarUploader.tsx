import { Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, ProgressBar } from '@/design-system';
import { MediaSourcePicker } from '@/components/media/MediaSourcePicker';
import { isConfigured } from '@/lib/env';
import { DataError } from '@/lib/supabase/errors';

export interface AvatarUploaderProps {
  uid: string;
  name: string;
  value: string;
  onUploaded: (url: string) => void;
}

/**
 * Avatar upload. Raster images are scaled to 512px WebP client-side, uploaded
 * to ImgBB via `/api/media/upload`, and recorded in Postgres for moderation
 * and quota accounting.
 *
 * Beside it sits the other door: a face the member has already uploaded. That path
 * writes no row and costs no quota, because the row exists — `my_gallery` (0132)
 * only ever returns the member's own pictures, so the address it hands over cannot be
 * anybody else's, and `profiles.avatar_url` is one of the arms `bsdc.media_references`
 * reads, so the profile keeps that picture for as long as it shows it.
 */
export function AvatarUploader({ uid, name, value, onUploaded }: AvatarUploaderProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function onFile(file: File) {
    setErrorKey(null);
    setProgress(0);
    try {
      const { uploadMedia, MediaError } = await import('@/lib/storage/upload');
      const result = await uploadMedia(file, {
        purpose: 'avatar',
        onProgress: setProgress,
      }).catch((error: unknown) => {
        throw error instanceof MediaError ? error : new Error('media.errors.failed');
      });

      if (isConfigured.supabase) {
        const { recordMediaAsset } = await import('@/lib/data/media-repository');
        // Filed as an avatar, so the member's own library can answer "show me the
        // faces you have used" — and so this row is the picture the picker offers for
        // the next account edit rather than an unlabelled upload.
        const row = await recordMediaAsset(uid, result, 'avatar');
        if (row === null) throw new Error('media.errors.recordFailed');
      }

      onUploaded(result.url);
    } catch (error) {
      let key = 'media.errors.failed';
      if (error instanceof DataError) {
        key =
          error.messageKey === 'data.errors.signInRequired'
            ? 'media.errors.signInRequired'
            : 'media.errors.recordFailed';
      } else if (error instanceof Error && error.message.startsWith('media.')) {
        key = error.message;
      }
      setErrorKey(key);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar src={value} name={name} size="lg" />
      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
            event.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconStart={<Upload size={16} />}
            disabled={progress !== null}
            onClick={() => inputRef.current?.click()}
          >
            {progress === null ? t('media.change') : t('media.uploading')}
          </Button>
          <MediaSourcePicker
            purpose="avatar"
            showUpload={false}
            compact
            max={1}
            attached={value.length > 0 ? [value] : []}
            disabled={progress !== null}
            onFiles={(files) => {
              const file = files[0];
              if (file !== undefined) void onFile(file);
            }}
            // A picture from the library is already recorded and already this
            // member's, so there is nothing to upload and no row to write — which is
            // why this handler does not go through `onFile`. What is left is to point
            // the profile at it: one string, the same one an upload would have
            // produced for the same photo.
            onPick={(picked) => {
              const first = picked[0];
              if (first !== undefined) onUploaded(first.url);
            }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">{t('media.hint')}</p>
        {progress !== null ? (
          <ProgressBar value={progress} label={t('media.uploading')} className="mt-2" />
        ) : null}
        {errorKey ? (
          <p role="alert" className="mt-1 text-xs font-medium text-danger">
            {t(errorKey)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
