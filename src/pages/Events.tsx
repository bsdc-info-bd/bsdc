/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarDays, MapPin, Plus, Users, Video, CalendarPlus, Clock } from 'lucide-react';
import { createEvent, fetchEvents, setRsvp } from '@/lib/data';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type { CommunityEvent } from '@/types/domain';

export default function Events() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [events, setEvents] = useState<(CommunityEvent & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEvents()
      .then((list) => !cancelled && setEvents(list))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const upcoming = events.filter((e) => e.startsAt >= Date.now());
  const past = events.filter((e) => e.startsAt < Date.now()).reverse();

  return (
    <>
      <SEOHead title="Developer Events — BSDC" description="Meetups, webinars and hackathons from the Bangladesh Software Development Community." path="/events" />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('events.title'), path: '/events' }]} />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <CalendarDays className="h-6 w-6 text-brand-600" aria-hidden />
            {t('events.title')}
          </h1>
          <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => (profile ? setCreateOpen(true) : navigate('/login'))}>
            <span className="hidden min-[420px]:inline">{t('events.create')}</span>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState title={t('events.empty')} body={t('events.emptyBody')} icon={<CalendarDays className="h-16 w-16" aria-hidden />} />
        ) : (
          <>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">{t('events.upcoming')}</h2>
            <ul className="space-y-4">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} onRsvp={(status) => setRsvpAndUpdate(event, status, setEvents)} isAuthed={Boolean(profile)} onLogin={() => navigate('/login')} />
              ))}
            </ul>
            {past.length > 0 ? (
              <>
                <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-neutral-400">{t('events.past')}</h2>
                <ul className="space-y-4 opacity-70">
                  {past.map((event) => (
                    <EventCard key={event.id} event={event} onRsvp={() => undefined} isAuthed={false} onLogin={() => undefined} past />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
      <CreateEventModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

async function setRsvpAndUpdate(event: CommunityEvent & { id: string }, status: 'going' | 'interested' | 'not_going', setEvents: (fn: (prev: (CommunityEvent & { id: string })[]) => (CommunityEvent & { id: string })[]) => void) {
  await setRsvp(event.id, event.hostId, status).catch(() => undefined);
  setEvents((prev) =>
    prev.map((e) => (e.id === event.id ? { ...e, goingCount: status === 'going' ? e.goingCount + 1 : e.goingCount, interestedCount: status === 'interested' ? e.interestedCount + 1 : e.interestedCount } : e)),
  );
  toast.success(status === 'going' ? 'You are going' : status === 'interested' ? 'Marked interested' : 'Updated');
}

function EventCard({
  event,
  onRsvp,
  isAuthed,
  onLogin,
  past,
}: {
  event: CommunityEvent & { id: string };
  onRsvp: (status: 'going' | 'interested' | 'not_going') => void;
  isAuthed: boolean;
  onLogin: () => void;
  past?: boolean;
}) {
  const { t } = useTranslation();
  function icsDownload() {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BSDC//Events//EN', 'BEGIN:VEVENT',
      `UID:${event.id}@bsdc.info.bd`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${new Date(event.startsAt).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTEND:${new Date(event.endsAt || event.startsAt + 3600000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `SUMMARY:${event.title}`, `DESCRIPTION:${event.description.slice(0, 200)}`,
      event.format === 'virtual' ? `URL:${event.meetingUrl}` : `LOCATION:${event.location}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, '-')}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <li className="bsdc-surface overflow-hidden">
      <div className="flex flex-col gap-0 sm:flex-row">
        <div className="flex items-center justify-center bg-brand-gradient p-4 text-white sm:w-28 sm:flex-col sm:gap-1">
          <span className="text-xs font-bold uppercase tracking-wider">{new Date(event.startsAt).toLocaleString('en', { month: 'short' })}</span>
          <span className="text-3xl font-extrabold leading-none">{new Date(event.startsAt).getDate()}</span>
          <span className="text-xs opacity-80">{new Date(event.startsAt).getFullYear()}</span>
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{event.title}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-fb-50 px-2 py-0.5 text-[10px] font-bold text-fb-700 dark:bg-fb-950/60 dark:text-fb-300">
              {event.format === 'virtual' ? <Video className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}
              {event.format === 'virtual' ? t('events.virtual') : t('events.inperson')}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{formatDateTime(event.startsAt)}</span>
            {event.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{event.location}</span> : null}
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{formatNumber(event.goingCount)} {t('events.going')}</span>
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">{event.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!past ? (
              <>
                <Button size="sm" onClick={() => (isAuthed ? onRsvp('going') : onLogin())}>{t('events.going')}</Button>
                <Button size="sm" variant="outline" onClick={() => (isAuthed ? onRsvp('interested') : onLogin())}>{t('events.interested')}</Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" icon={<CalendarPlus className="h-4 w-4" aria-hidden />} onClick={icsDownload}>
              {t('events.addCalendar')}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function CreateEventModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'virtual' | 'inperson'>('virtual');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (!title.trim() || !startsAt) {
      toast.error('Title and start time are required');
      return;
    }
    setSaving(true);
    try {
      await createEvent(profile, {
        title: title.trim(),
        description,
        coverImage: '',
        format,
        location,
        meetingUrl,
        startsAt: new Date(startsAt).getTime(),
        endsAt: new Date(startsAt).getTime() + 2 * 60 * 60 * 1000,
        speakers: [],
        agenda: [],
        category: 'Community',
        tags: [],
      });
      toast.success('Event created');
      onOpenChange(false);
      window.location.reload();
    } catch {
      toast.error('Could not create event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('events.create')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={() => void submit()}>{t('common.create')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('common.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        <Textarea label={t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxRows={4} />
        <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as 'virtual' | 'inperson')} options={[{ value: 'virtual', label: t('events.virtual') }, { value: 'inperson', label: t('events.inperson') }]} />
        {format === 'virtual' ? (
          <Input label="Meeting URL" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" />
        ) : (
          <Input label={t('common.location')} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dhaka" />
        )}
        <Input label={t('events.starts')} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </div>
    </Modal>
  );
}
