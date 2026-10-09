import { ImageOff } from 'lucide-react';
import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string;
  fallbackSrc?: string;
  alt: string;
}

/**
 * Tries the provider thumbnail first, then the original URL. If both fail, the
 * tile remains a deliberate, accessible error state instead of a broken-image
 * glyph or an empty box that looks like the upload never existed.
 */
export function MediaImage({
  src,
  fallbackSrc = '',
  alt,
  className,
  onError,
  ...imageProps
}: MediaImageProps) {
  const { t } = useTranslation();
  const [currentSrc, setCurrentSrc] = useState(src);
  const [failed, setFailed] = useState(src.length === 0);

  useEffect(() => {
    const first = src.length > 0 ? src : fallbackSrc;
    setCurrentSrc(first);
    setFailed(first.length === 0);
  }, [src, fallbackSrc]);

  function handleError(event: React.SyntheticEvent<HTMLImageElement, Event>) {
    onError?.(event);
    if (fallbackSrc.length > 0 && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      return;
    }
    setFailed(true);
  }

  if (failed || currentSrc.length === 0) {
    return (
      <span
        role="img"
        aria-label={alt || t('media.gallery.imageUnavailable')}
        className={cn(
          'inline-flex items-center justify-center gap-2 bg-surface-2 text-muted',
          className,
        )}
      >
        <ImageOff size={20} aria-hidden="true" />
        <span className="fab-sr-only">{t('media.gallery.imageUnavailable')}</span>
      </span>
    );
  }

  return (
    <img {...imageProps} src={currentSrc} alt={alt} className={className} onError={handleError} />
  );
}
