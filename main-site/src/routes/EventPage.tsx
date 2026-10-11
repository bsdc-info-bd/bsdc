import { ArrowLeft, CalendarDays, Globe, MapPin, Users, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  PageSkeleton,
} from '@/design-system';
import { useEventDetail } from '@/hooks/use-communities';
import { isEventFull, isEventLive, type RsvpStatus } from '@/lib/communities/community-types';
import { formatNumber } from '@/lib/format';
import { eventJsonLd, formatInZone, safeExternalUrl } from '@/lib/listings/listing-schema';
import { ROUTES, SITE, eventPath } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const RSVP_CHOICES: RsvpStatus[] = ['going', 'interested', 'declined'];

/** One event in full: when and where, the caller's RSVP, and the join link for attendees. */
export default function EventPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const locale = language === 'bn' ? 'bn-BD' : 'en-GB';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const detail = useEventDetail(slug);

  if (detail.isLoading) return <PageSkeleton label={t('events.detail.loading')} />;

  if (detail.isError) {
    return (
      <div className="fab-container py-6">
        <Alert tone="danger" title={t('events.detail.failed')} />
      </div>
    );
  }

  const event = detail.event;
  if (detail.isNotFound || event === null) {
    return (
      <>
        <Seo
          title={t('events.detail.notFoundTitle')}
          description={t('events.detail.notFoundBody')}
          path={eventPath(slug)}
          noindex
        />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={t('events.detail.notFoundTitle')}
            description={t('events.detail.notFoundBody')}
            action={
              <LinkButton to={ROUTES.events} variant="outline" size="sm">
                {t('events.detail.back')}
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  const now = Date.now();
  const ended = Date.parse(event.endsAt) <= now;
  const live = !event.isCancelled && isEventLive(event, now);
  const full = isEventFull(event);
  const going = event.myStatus === 'going';
  const isHost = uid !== null && uid === event.hostUid;
  const canRsvp = !event.isCancelled && !ended;
  const showOnline = event.mode !== 'in_person';
  const showVenue = event.mode !== 'online' && event.venue.length > 0;
  const joinLink = safeExternalUrl(event.joinUrl);
  const path = eventPath(event.slug);
  const url = `${SITE.url}${path}`;
  const summary = event.description.replace(/\s+/g, ' ').trim().slice(0, 155);

  const startText = formatInZone(event.startsAt, event.timezone, locale, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const endText = formatInZone(event.endsAt, event.timezone, locale, { timeStyle: 'short' });

  return (
    <>
      <Seo
        title={t('events.detail.metaTitle', { title: event.title })}
        description={summary.length > 0 ? summary : event.title}
        path={path}
        noindex={event.isCancelled}
        jsonLd={[eventJsonLd(event, url)]}
      />

      <article className="fab-container py-5 sm:py-8">
        <div className="mx-auto grid w-full max-w-4xl gap-4">
          <LinkButton
            to={ROUTES.events}
            variant="ghost"
            size="sm"
            iconStart={<ArrowLeft size={16} />}
            className="w-fit"
          >
            {t('events.detail.back')}
          </LinkButton>

          {event.isCancelled ? <Alert tone="danger" title={t('events.detail.cancelled')} /> : null}

          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">{t(`events.modes.${event.mode}`)}</Badge>
                {live ? <Badge tone="green">{t('events.live')}</Badge> : null}
                {ended && !event.isCancelled ? (
                  <Badge tone="neutral">{t('events.detail.ended')}</Badge>
                ) : null}
                {full ? <Badge tone="neutral">{t('events.full')}</Badge> : null}
              </div>

              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{event.title}</h1>
              {isHost ? (
                <p className="text-sm text-muted">{t('events.detail.hostedByYou')}</p>
              ) : null}

              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li className="flex items-start gap-2">
                  <CalendarDays
                    size={16}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-muted"
                  />
                  <span>
                    {startText} – {endText}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Globe size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>{t('events.detail.timeZone', { zone: event.timezone })}</span>
                </li>
                {showOnline ? (
                  <li className="flex items-start gap-2">
                    <Video size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                    <span>{t('events.detail.online')}</span>
                  </li>
                ) : null}
                {showVenue ? (
                  <li className="flex items-start gap-2">
                    <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                    <span>
                      {event.venue}
                      {event.city.length > 0 ? `, ${event.city}` : ''}
                    </span>
                  </li>
                ) : null}
                <li className="flex items-start gap-2">
                  <Users size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>
                    {t('events.goingCount', { total: formatNumber(event.going, language) })}
                    {event.capacity !== null ? ` / ${formatNumber(event.capacity, language)}` : ''}
                  </span>
                </li>
              </ul>

              {joinLink !== null && !event.isCancelled && (going || isHost) ? (
                <div className="border-t border-border pt-3">
                  <ExternalLink href={joinLink} userGenerated>
                    {t('events.detail.joinLink')}
                  </ExternalLink>
                </div>
              ) : null}
              {showOnline && !event.isCancelled && !going && !isHost ? (
                <p className="border-t border-border pt-3 text-sm text-muted">
                  {t('events.detail.joinHidden')}
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">{t('events.detail.rsvpTitle')}</h2>
            {!isSignedIn ? (
              <p className="mt-3 text-sm text-muted">{t('events.signInToRsvp')}</p>
            ) : canRsvp ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {RSVP_CHOICES.map((choice) => (
                  <Button
                    key={choice}
                    size="sm"
                    variant={event.myStatus === choice ? 'secondary' : 'ghost'}
                    aria-pressed={event.myStatus === choice}
                    disabled={detail.isSaving || (choice === 'going' && full)}
                    onClick={() => {
                      detail.rsvp(choice);
                    }}
                  >
                    {t(`events.rsvp.${choice}`)}
                  </Button>
                ))}
              </div>
            ) : null}
            {detail.saveFailed ? (
              <Alert tone="danger" title={t('events.detail.rsvpFailed')} className="mt-3" />
            ) : null}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">{t('events.detail.about')}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7">{event.description}</p>
          </Card>
        </div>
      </article>
    </>
  );
}
