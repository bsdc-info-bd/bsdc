import { ImageOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, Card, SectionHeading, TimeAgo } from '@/design-system';
import { repairPictures } from '@/pwa';

/**
 * The control a member should have been given instead of "clear your cache".
 *
 * Pictures on this platform arrive from three hosts through a cache in the
 * browser. When something goes wrong, the advice a member gets from every
 * support forum is to clear all site data — which signs them out, throws away
 * their drafts, forgets their language and their theme, and fixes a problem that
 * was one cache away from being fixed properly.
 *
 * This button does the proper thing: it drops the picture cache and nothing
 * else, then re-asks for every picture on the page.
 */
export function PictureHealthCard() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function repair() {
    setBusy(true);
    try {
      await repairPictures();
      toast.success(t('settings.media.repaired'));
    } catch {
      toast.error(t('settings.media.repairFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <SectionHeading
        title={t('settings.media.title')}
        description={t('settings.media.description')}
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{t('settings.media.body')}</p>
        <Button
          variant="secondary"
          onClick={() => void repair()}
          disabled={busy}
          className="shrink-0"
          iconStart={<RefreshCw aria-hidden className={busy ? 'size-4 animate-spin' : 'size-4'} />}
        >
          {busy ? t('settings.media.repairing') : t('settings.media.repair')}
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <ImageOff aria-hidden className="size-3.5" />
        {t('settings.media.hint')}
      </p>
    </Card>
  );
}

/**
 * The same control as a one-line banner, for the moment a member needs it: a
 * page whose pictures did not load. A toast is not enough here, because the
 * member has already scrolled past the pictures that are missing.
 */
export function PictureRepairBanner({ onRepaired }: { onRepaired?: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2 text-xs text-text"
    >
      <span className="flex items-center gap-2">
        <ImageOff aria-hidden className="size-4" />
        {t('media.repair.banner')}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void repairPictures()
            .then(() => {
              setDone(true);
              onRepaired?.();
            })
            .catch(() => toast.error(t('settings.media.repairFailed')))
            .finally(() => setBusy(false));
        }}
      >
        <RefreshCw aria-hidden className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />
        {t('settings.media.repair')}
      </Button>
    </div>
  );
}

/**
 * "When did this device last hear from us."
 *
 * A push device list is only useful if it says whether each device is working;
 * a row with a name and no date is a row a member cannot act on.
 */
export function DeviceLastSeen({ at }: { at: string }) {
  return <TimeAgo date={at} />;
}
