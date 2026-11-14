import { CalendarPlus, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/design-system';
import { shareLink } from '@/lib/share/share-link';
import {
  buildEventIcs,
  icsFileName,
  type CalendarFileEvent,
} from '@/lib/communities/event-calendar-file';

export interface EventShareActionsProps {
  readonly event: CalendarFileEvent;
  readonly size?: 'sm' | 'md';
}

/**
 * Share an event and add it to a calendar. Share uses the device's own share
 * sheet where there is one and copies the link everywhere else. The calendar
 * file is built on demand, so it always carries the latest details.
 */
export function EventShareActions({ event, size = 'sm' }: EventShareActionsProps) {
  const { t } = useTranslation();

  async function share() {
    const outcome = await shareLink({ title: event.title, url: event.url });
    if (outcome === 'copied') toast.success(t('events.linkCopied'));
    if (outcome === 'failed') toast.error(t('events.shareFailed'));
  }

  function addToCalendar() {
    const ics = buildEventIcs(event, new Date().toISOString());
    const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = icsFileName(event.slug);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(href);
    }, 0);
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button
        size={size}
        variant="ghost"
        onClick={() => {
          void share();
        }}
        iconStart={<Share2 size={14} aria-hidden="true" />}
      >
        {t('events.share')}
      </Button>
      <Button
        size={size}
        variant="ghost"
        onClick={addToCalendar}
        iconStart={<CalendarPlus size={14} aria-hidden="true" />}
      >
        {t('events.addToCalendar')}
      </Button>
    </div>
  );
}
