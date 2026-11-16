import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, type ButtonSize } from '@/design-system';
import { shareLink, type ShareTarget } from '@/lib/share/share-link';

export interface ShareLinkButtonProps extends ShareTarget {
  readonly size?: ButtonSize;
  readonly variant?: 'ghost' | 'outline' | 'secondary';
}

/** Shares a page: the native sheet where there is one, otherwise a copied link with feedback. */
export function ShareLinkButton({
  title,
  url,
  size = 'sm',
  variant = 'ghost',
}: ShareLinkButtonProps) {
  const { t } = useTranslation();

  async function share() {
    const outcome = await shareLink({ title, url });
    if (outcome === 'copied') toast.success(t('events.linkCopied'));
    if (outcome === 'failed') toast.error(t('events.shareFailed'));
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => {
        void share();
      }}
      iconStart={<Share2 size={14} aria-hidden="true" />}
    >
      {t('events.share')}
    </Button>
  );
}
