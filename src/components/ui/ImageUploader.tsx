/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ImagePlus, X, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { uploadImage, type UploadTier } from '@/lib/upload';

export interface UploadedImage {
  url: string;
  name: string;
}

export function ImageUploader({
  tier = 'important',
  folder = 'bsdc/misc',
  max = 10,
  images,
  onChange,
  single,
  className,
  compact,
}: {
  tier?: UploadTier;
  folder?: string;
  max?: number;
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  single?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(
    async (files: File[]) => {
      const limit = single ? 1 : max;
      const room = limit - images.length;
      if (room <= 0) {
        toast.error(`Maximum ${limit} image${limit === 1 ? '' : 's'}`);
        return;
      }
      const toUpload = files.slice(0, room);
      setUploading(true);
      setProgress(0);
      const uploaded: UploadedImage[] = [];
      for (const file of toUpload) {
        try {
          const result = await uploadImage(file, tier, folder);
          uploaded.push({ url: result.url, name: file.name });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Upload failed');
        }
      }
      setUploading(false);
      if (uploaded.length > 0) {
        onChange(single ? uploaded.slice(0, 1) : [...images, ...uploaded]);
        toast.success(`${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded`);
      }
    },
    [images, max, onChange, single, tier, folder],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif'] },
    maxFiles: single ? 1 : max,
    disabled: uploading,
  });

  return (
    <div className={className}>
      {images.length > 0 ? (
        <div className={cn('mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5', single && 'grid-cols-2 sm:grid-cols-3')}>
          {images.map((img) => (
            <div key={img.url} className="group relative aspect-square overflow-hidden rounded-xl border border-surface-light-border dark:border-surface-dark-border">
              <img src={img.url} alt={img.name} className="h-full w-full object-cover" loading="lazy" width={160} height={160} />
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() => onChange(images.filter((i) => i.url !== img.url))}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        {...getRootProps()}
        disabled={uploading}
        className={cn(
          'bsdc-tap flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors',
          isDragActive
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40'
            : 'border-surface-light-border hover:border-brand-400 hover:bg-neutral-50 dark:border-surface-dark-border dark:hover:bg-surface-dark-raised/50',
          compact ? 'p-4' : 'p-8',
          uploading && 'cursor-wait opacity-70',
        )}
      >
        <input {...getInputProps()} />
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
          {uploading ? <UploadCloud className="h-5 w-5 animate-pulse" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
        </span>
        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {uploading ? `Uploading ${progress > 0 ? `${progress}%` : ''}` : 'Drag images here, or click to select'}
        </span>
        <span className="text-xs text-neutral-400">
          {single ? 'JPEG, PNG, WebP, GIF — max 10 MB' : `Up to ${max} images · JPEG, PNG, WebP, GIF · max 10 MB each`}
        </span>
      </button>
    </div>
  );
}

export function AvatarUploader({
  currentUrl,
  onUploaded,
}: {
  currentUrl?: string;
  onUploaded: (url: string) => void;
}) {
  return (
    <ImageUploader
      single
      tier="important"
      folder="bsdc/avatars"
      images={currentUrl ? [{ url: currentUrl, name: 'avatar' }] : []}
      onChange={(imgs) => {
        if (imgs[0]) onUploaded(imgs[0].url);
      }}
      compact
    />
  );
}
