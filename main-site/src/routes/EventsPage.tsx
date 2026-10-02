import { CalendarDays, MapPin, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeading,
} from '@/design-system';
import { useEventCalendar } from '@/hooks/use-communities';
import {
  groupEventsByDay,
  isEventFull,
  isEventLive,
  type CommunityEvent,
} from '@/lib/communities/community-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { ROUTES, SITE } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const RSVP_CHOICES = ['going', 'interested', 'declined'] as const;

/** Upcoming community events, grouped by day, with one-tap RSVP. */
export default function EventsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const calendar = useEventCalendar();
  const days = groupEventsByDay(calendar.events);

  return (
    <>
      <Seo
        title={t('events.metaTitle')}
        description={t('events.metaDescription')}
        path={ROUTES.events}
        jsonLd={calendar.events.slice(0, 20).map((event) => ({
          '@type': 'Event',
          name: event.title,
          startDate: event.startsAt,
          endDate: event.endsAt,
          eventAttendanceMode:
            event.mode === 'online'
              ? 'https://schema.org/OnlineEventAttendanceMode'
              : event.mode === 'hybrid'
                ? 'https://schema.org/MixedEventAttendanceMode'
                : 'https://schema.org/OfflineEventAttendanceMode',
          location:
            event.mode === 'online'
              ? { '@type': 'VirtualLocation', url: `${SITE.url}${ROUTES.events}` }
              : { '@type': 'Place', name: event.venue, address: event.city },
          organizer: { '@type': 'Organization', name: SITE.shortName, url: SITE.url },
        }))}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('events.title')} description={t('events.description')} />

        {calendar.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {calendar.isError ? <Alert tone="danger" title={t('events.failed')} /> : null}

        {!calendar.isLoading && !calendar.isError && calendar.events.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={t('events.emptyTitle')}
            description={t('events.emptyBody')}
          />
        ) : null}

        <div className="mt-4 flex flex-col gap-6">
          {days.map(({ day, events }) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="text-sm font-semibold text-muted">
                {formatAbsoluteDate(new Date(day), language)}
              </h2>
              <ul className="mt-2 flex flex-col gap-3">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    signedIn={isSignedIn}
                    onRsvp={calendar.rsvp}
                    busy={calendar.isSaving}
                    language={language}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

interface EventCardProps {
  event: CommunityEvent;
  signedIn: boolean;
  busy: boolean;
  language: 'bn' | 'en';
  onRsvp: (eventId: string, status: (typeof RSVP_CHOICES)[number]) => void;
}

function EventCard({ event, signedIn, busy, language, onRsvp }: EventCardProps) {
  const { t } = useTranslation();
  const full = isEventFull(event);
  const live = isEventLive(event);
  const starts = new Date(event.startsAt);

  return (
    <Card as="li">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{event.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              {event.mode === 'online' ? (
                <Video size={13} aria-hidden="true" />
              ) : (
                <MapPin size={13} aria-hidden="true" />
              )}
              {t(`events.modes.${event.mode}`)}
            </span>
            <span>
              {starts.toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {event.venue.length > 0 ? <span className="fab-truncate">{event.venue}</span> : null}
            <span>
              {t('events.goingCount', { total: formatNumber(event.going, language) })}
              {event.capacity !== null ? ` / ${formatNumber(event.capacity, language)}` : ''}
            </span>
            {live ? <Badge tone="green">{t('events.live')}</Badge> : null}
            {full ? <Badge tone="neutral">{t('events.full')}</Badge> : null}
          </p>
        </div>

        {signedIn ? (
          <div className="flex flex-wrap gap-1">
            {RSVP_CHOICES.map((choice) => (
              <Button
                key={choice}
                size="sm"
                variant={event.myStatus === choice ? 'secondary' : 'ghost'}
                aria-pressed={event.myStatus === choice}
                disabled={busy || (choice === 'going' && full)}
                onClick={() => {
                  onRsvp(event.id, choice);
                }}
              >
                {t(`events.rsvp.${choice}`)}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">{t('events.signInToRsvp')}</p>
        )}
      </div>
    </Card>
  );
}
