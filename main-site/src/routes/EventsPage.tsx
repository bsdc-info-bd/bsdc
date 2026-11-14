import { CalendarDays, MapPin, Video } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EventShareActions } from '@/components/communities/EventShareActions';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageSkeleton,
  SectionHeading,
} from '@/design-system';
import { useEventCalendar } from '@/hooks/use-communities';
import {
  groupEventsByDay,
  isEventFull,
  isEventLive,
  parseDayKey,
  type CommunityEvent,
} from '@/lib/communities/community-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { formatInZone } from '@/lib/listings/listing-schema';
import { ROUTES, SITE, eventPath } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const RSVP_CHOICES = ['going', 'interested', 'declined'] as const;

/** Upcoming community events, grouped by their own calendar day, with one-tap RSVP and sharing. */
export default function EventsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const locale = language === 'bn' ? 'bn-BD' : 'en-GB';
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
          url: `${SITE.url}${eventPath(event.slug)}`,
          startDate: event.startsAt,
          endDate: event.endsAt,
          eventStatus: 'https://schema.org/EventScheduled',
          ...(event.coverUrl.trim().length > 0 ? { image: event.coverUrl.trim() } : {}),
          eventAttendanceMode:
            event.mode === 'online'
              ? 'https://schema.org/OnlineEventAttendanceMode'
              : event.mode === 'hybrid'
                ? 'https://schema.org/MixedEventAttendanceMode'
                : 'https://schema.org/OfflineEventAttendanceMode',
          location:
            event.mode === 'online'
              ? { '@type': 'VirtualLocation', url: `${SITE.url}${eventPath(event.slug)}` }
              : { '@type': 'Place', name: event.venue, address: event.city },
          organizer: { '@type': 'Organization', name: SITE.shortName, url: SITE.url },
        }))}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading
          title={t('events.title')}
          description={t('events.description')}
          action={
            <LinkButton
              to={`${ROUTES.create}?kind=event`}
              variant="outline"
              size="sm"
              iconStart={<CalendarDays size={14} />}
            >
              {t('create.submit.event')}
            </LinkButton>
          }
        />

        {calendar.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {calendar.isError ? <Alert tone="danger" title={t('events.failed')} /> : null}

        {!calendar.isLoading && !calendar.isError && calendar.events.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={t('events.emptyTitle')}
            description={t('events.emptyBody')}
            action={
              <LinkButton to={`${ROUTES.create}?kind=event`} variant="primary" size="sm">
                {t('create.submit.event')}
              </LinkButton>
            }
          />
        ) : null}

        <div className="mt-4 flex flex-col gap-6">
          {days.map(({ day, events }) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="text-sm font-semibold capitalize text-muted">
                {formatAbsoluteDate(parseDayKey(day), language)}
                <span className="ms-2 font-normal">
                  {new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(parseDayKey(day))}
                </span>
              </h2>
              <ul className="mt-2 flex flex-col gap-3">
                {events.map((event, index) => (
                  <EventCard
                    key={event.id}
                    index={index}
                    event={event}
                    signedIn={isSignedIn}
                    onRsvp={calendar.rsvp}
                    busy={calendar.isSaving}
                    language={language}
                    locale={locale}
                    url={`${SITE.url}${eventPath(event.slug)}`}
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
  index: number;
  signedIn: boolean;
  busy: boolean;
  language: 'bn' | 'en';
  locale: string;
  url: string;
  onRsvp: (eventId: string, status: (typeof RSVP_CHOICES)[number]) => void;
}

function EventCard({
  event,
  index,
  signedIn,
  busy,
  language,
  locale,
  url,
  onRsvp,
}: EventCardProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion() ?? false;
  const full = isEventFull(event);
  const live = isEventLive(event);
  const dayNumber = formatInZone(event.startsAt, event.timezone, locale, { day: 'numeric' });
  const monthName = formatInZone(event.startsAt, event.timezone, locale, { month: 'short' });
  const clock = formatInZone(event.startsAt, event.timezone, locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.04, 0.24), ease: 'easeOut' }}
      {...(reduceMotion ? {} : { whileHover: { y: -2 } })}
      className="list-none"
    >
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <div className="flex flex-wrap items-start gap-4">
          <div
            aria-hidden="true"
            className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-brand-soft py-2 text-center"
          >
            <span className="text-xl font-bold leading-none text-brand-strong">{dayNumber}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase text-brand-strong">
              {monthName}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-snug">
              <Link to={eventPath(event.slug)} className="hover:underline">
                {event.title}
              </Link>
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                {event.mode === 'online' ? (
                  <Video size={13} aria-hidden="true" />
                ) : (
                  <MapPin size={13} aria-hidden="true" />
                )}
                {t(`events.modes.${event.mode}`)}
              </span>
              <span>{clock}</span>
              {event.venue.length > 0 ? <span className="fab-truncate">{event.venue}</span> : null}
              <span>
                {t('events.goingCount', { total: formatNumber(event.going, language) })}
                {event.capacity !== null ? ` / ${formatNumber(event.capacity, language)}` : ''}
              </span>
              {live ? <Badge tone="green">{t('events.live')}</Badge> : null}
              {full ? <Badge tone="neutral">{t('events.full')}</Badge> : null}
            </p>
          </div>

          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
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
            <EventShareActions
              event={{
                id: event.id,
                slug: event.slug,
                title: event.title,
                description: '',
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                venue: event.venue,
                city: event.city,
                mode: event.mode,
                url,
                isCancelled: false,
              }}
            />
          </div>
        </div>
      </Card>
    </motion.li>
  );
}
