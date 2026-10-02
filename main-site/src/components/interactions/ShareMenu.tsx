import { Check, Link2, Share2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/design-system';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import type { ShareChannel } from '@/lib/interactions/interaction-types';
import { postPath, SITE } from '@/lib/site';

export interface ShareMenuProps {
  slug: string;
  title: string;
  onShare: (channel: ShareChannel) => void;
}

interface Target {
  channel: ShareChannel;
  href: (url: string, title: string) => string;
}

const TARGETS: Target[] = [
  {
    channel: 'facebook',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    channel: 'x',
    href: (url, title) =>
      `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    channel: 'linkedin',
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    channel: 'whatsapp',
    href: (url, title) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
  },
  {
    channel: 'telegram',
    href: (url, title) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
];

/** Share targets plus copy link. Every share is counted once, server-side. */
export function ShareMenu({ slug, title, onShare }: ShareMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useFocusTrap(menuRef, open);
  const url = `${SITE.url}${postPath(slug)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShare('copy');
      toast.success(t('interactions.linkCopied'));
    } catch {
      toast.error(t('interactions.copyFailed'));
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Share2 size={16} />
        <span className="fab-sr-only">{t('interactions.share')}</span>
      </Button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label={t('interactions.share')}
          className="absolute bottom-full end-0 z-30 mb-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="fab-tap flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-2"
            onClick={() => {
              void copyLink();
            }}
          >
            {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
            {t('interactions.copyLink')}
          </button>

          {TARGETS.map((target) => (
            <a
              key={target.channel}
              role="menuitem"
              href={target.href(url, title)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="fab-tap flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
              onClick={() => {
                onShare(target.channel);
                setOpen(false);
              }}
            >
              {t(`interactions.channels.${target.channel}`)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
