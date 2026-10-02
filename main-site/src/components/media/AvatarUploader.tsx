import { Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, ProgressBar } from '@/design-system';
import { isConfigured } from '@/lib/env';

export interface AvatarUploaderProps {
  uid: string;
  name: string;
  value: string;
  onUploaded: (url: string) => void;
}

/**
 * Avatar upload. Images for avatars always go to Cloudinary so the square,
 * face-aware transform is available, and the asset is recorded in Postgres
 * for moderation and quota accounting.
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

      onUploaded(result.url);

      if (isConfigured.supabase) {
        const { recordMediaAsset } = await import('@/lib/data/media-repository');
        await recordMediaAsset(uid, result).catch(() => undefined);
      }
    } catch (error) {
      const key =
        error instanceof Error && error.message.startsWith('media.')
          ? error.message
          : 'media.errors.failed';
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
        <Button
          variant="secondary"
          size="sm"
          iconStart={<Upload size={16} />}
          disabled={progress !== null}
          onClick={() => inputRef.current?.click()}
        >
          {progress === null ? t('media.change') : t('media.uploading')}
        </Button>
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
