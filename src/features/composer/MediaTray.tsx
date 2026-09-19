/**
 * BSDC — src/features/composer/MediaTray.tsx
 * Purpose : The composer's attachment tray: thumbnails, progress, alt text and failures.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Alternative text is editable here, not after publishing, because an image uploaded to
 *   a feed in a country with a very large screen-reader population is not finished until it has
 *   one. The tray shows blur previews generated on the device, so a thumbnail never flashes empty.
 *   A failed upload stays visible with its own retry button: silently dropping an attachment is
 *   how people end up publishing half of what they meant to say.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { IconButton } from '@/shared/ui/IconButton';
import { Input } from '@/shared/ui/Input';
import { ProgressRing } from '@/shared/ui/ProgressRing';
import { Text } from '@/shared/ui/Typography';
import { formatCompact } from '@/shared/lib/number.bn';
import type { ComposerAttachment } from './useComposer';

/** Props for the media tray. */
export interface MediaTrayProps {
  readonly attachments: readonly ComposerAttachment[];
  readonly locale: 'bn' | 'en';
  readonly onDetach: (id: string) => void;
  readonly onRetry: (id: string) => Promise<void>;
  readonly onAltChange: (id: string, alt: string) => void;
}

/**
 * Renders the attachment tray.
 * @param props tray props
 * @returns the tray, or null when there is nothing attached
 */
export function MediaTray({
  attachments,
  locale,
  onDetach,
  onRetry,
  onAltChange,
}: MediaTrayProps): React.ReactElement | null {
  const { t } = useTranslation('composer');
  if (attachments.length === 0) return null;

  return (
    <ul className="bsdc-media-tray" aria-label={t('attachments')}>
      {attachments.map((item) => (
        <li key={item.id} className="bsdc-media-tray__item" data-status={item.status}>
          <div
            className="bsdc-media-tray__thumb"
            style={{
              backgroundImage:
                item.preview !== null ? `url(${item.preview.blurDataUrl})` : undefined,
              backgroundColor: item.preview?.dominantColor ?? undefined,
            }}
          >
            {item.preview !== null ? (
              <img
                src={item.preview.objectUrl}
                alt={item.alt.length > 0 ? item.alt : ''}
                width={item.preview.width}
                height={item.preview.height}
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {item.status === 'uploading' ? (
              <span className="bsdc-media-tray__progress">
                <ProgressRing value={item.progress} size={40} label={t('uploading')} />
              </span>
            ) : null}
          </div>

          <IconButton
            icon="close"
            label={t('remove')}
            size="sm"
            variant="ghost"
            className="bsdc-media-tray__remove"
            onClick={() => onDetach(item.id)}
          />

          {item.status === 'failed' ? (
            <div className="bsdc-media-tray__error" role="alert">
              <Text as="p" size="sm">
                {item.error?.messageBn() ?? t('uploadFailed')}
              </Text>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => void onRetry(item.id)}
              >
                {t('retry')}
              </Button>
            </div>
          ) : (
            <Input
              label={t('altText')}
              value={item.alt}
              onChange={(event) => onAltChange(item.id, event.target.value)}
              hint={`${formatCompact(item.file.size, locale)} ${t('bytes')}`}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
