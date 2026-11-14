import { CalendarPlus, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/design-system';
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
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: event.title, text: event.title, url: event.url });
        return;
      } catch (failure) {
        // The reader closed the sheet: nothing to report. Any other failure falls back to copying.
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(event.url);
      toast.success(t('events.linkCopied'));
    } catch {
      toast.error(t('events.shareFailed'));
    }
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
