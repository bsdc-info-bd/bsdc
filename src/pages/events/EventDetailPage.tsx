/**
 * BSDC — src/pages/events/EventDetailPage.tsx
 * Purpose : One event: when, where, who is coming, and your answer.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The venue is shown on a map only when the event has coordinates, and the map is loaded
 *   lazily so a visitor reading an online event never downloads Leaflet. The "open in OpenStreetMap"
 *   link is always present for an on-site event, because a picture of a place is not a route to it.
 *   The live attendee count comes from the Realtime Database and is labelled as what it is: the
 *   number the host's device last published, not a turnstile.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Container, EmptyState, Heading, Icon, Skeleton, Text } from '@/shared/ui';
import { OSM } from '@/core/config/app';
import { EVENT_MODE_LABELS, EVENT_STATUS_LABELS } from '@/core/config/opportunities';
import { useSession } from '@/features/auth';
import { RsvpBar } from '@/features/events';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { loadEvent, loadRsvp, watchAttendeeCount } from '@/entities/event/repository';
import {
  eventPhase,
  osmLink,
  seatsLeft,
  venueThumbnail,
  type BsdcEvent,
  type Rsvp,
} from '@/entities/event/model';

/**
 * Renders the event detail route.
 * @returns the event page
 */
export function EventDetailPage(): React.ReactElement {
  const { t } = useTranslation('events');
  const { eventId = '' } = useParams<{ eventId: string }>();
  const { session, locale } = useSession();
  const [event, setEvent] = useState<BsdcEvent | null>(null);
  const [rsvp, setRsvp] = useState<Rsvp | null>(null);
  const [attendees, setAttendees] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void loadEvent(eventId)
      .then((next) => setEvent(next ?? null))
      .finally(() => setLoading(false));
    const uid = session.uid;
    if (uid !== null && uid.length > 0) {
      void loadRsvp(eventId, uid)
        .then((next) => setRsvp(next ?? null))
        .catch(ignoreReadFailure);
    }
  }, [eventId, session.uid]);

  useEffect(() => {
    if (event === null) return;
    return watchAttendeeCount(event.id, setAttendees);
  }, [event]);

  const lang = locale === 'bn' ? 'bn' : 'en';

  if (loading) {
    return (
      <Container className="py-6">
        <Skeleton height={420} />
      </Container>
    );
  }

  if (event === null) {
    return (
      <Container className="py-6">
        <EmptyState
          illustration="not-found"
          title={t('detail.missing.title')}
          description={t('detail.missing.description')}
          lang={lang}
        />
      </Container>
    );
  }

  const phase = eventPhase(event);
  const left = seatsLeft(event);
  const title = locale === 'bn' && event.titleBn.length > 0 ? event.titleBn : event.title;

  return (
    <Container className="py-6">
      <article className="bsdc-eventDetail">
        <Heading level={1} size="xl" lang={lang}>
          {title}
        </Heading>
        <div className="bsdc-eventDetail__badges">
          <Badge tone={phase === 'live' ? 'success' : 'neutral'} variant="outline">
            {t(`phase.${phase}`)}
          </Badge>
          <Badge tone="neutral" variant="outline">
            {EVENT_MODE_LABELS[event.mode][locale === 'bn' ? 'bn' : 'en']}
          </Badge>
          {event.status !== 'published' ? (
            <Badge tone="warning" variant="outline">
              {EVENT_STATUS_LABELS[event.status][locale === 'bn' ? 'bn' : 'en']}
            </Badge>
          ) : null}
        </div>

        {event.coverUrl.length > 0 ? (
          <img
            className="bsdc-eventDetail__cover"
            src={event.coverUrl}
            alt=""
            width={960}
            height={480}
            loading="lazy"
            decoding="async"
          />
        ) : null}

        <Text as="p" lang={lang} className="bsdc-eventDetail__description">
          {event.description}
        </Text>

        <dl className="bsdc-eventDetail__facts">
          <div>
            <dt lang={lang}>{t('detail.starts')}</dt>
            <dd lang={lang}>{event.startsAt.replace('T', ' ').slice(0, 16)}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('detail.ends')}</dt>
            <dd lang={lang}>{event.endsAt.replace('T', ' ').slice(0, 16)}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('detail.timezone')}</dt>
            <dd>{event.timezone}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('detail.going')}</dt>
            <dd lang={lang}>{String(event.rsvpCount)}</dd>
          </div>
          {left !== null ? (
            <div>
              <dt lang={lang}>{t('detail.seats')}</dt>
              <dd lang={lang}>{String(left)}</dd>
            </div>
          ) : null}
        </dl>

        <RsvpBar
          event={event}
          viewerUid={session.uid ?? ''}
          rsvp={rsvp}
          locale={locale}
          onChanged={setRsvp}
        />

        {event.venue !== null ? (
          <section className="bsdc-eventDetail__venue" aria-label={t('detail.venueLabel')}>
            <Heading level={2} size="md" lang={lang}>
              {t('detail.venue')}
            </Heading>
            <p lang={lang}>
              {[event.venue.label, event.venue.addressLine, event.venue.area]
                .filter((part) => part.length > 0)
                .join(', ')}
            </p>
            <a
              className="bsdc-eventDetail__mapLink"
              href={osmLink(event.venue)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={venueThumbnail(event.venue)}
                alt={t('detail.mapAlt', { place: event.venue.label })}
                width={640}
                height={320}
                loading="lazy"
                decoding="async"
              />
            </a>
            <p className="bsdc-eventDetail__attribution">
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
              >
                {OSM.attribution}
              </a>
            </p>
          </section>
        ) : null}

        {event.onlineUrl.length > 0 ? (
          <p className="bsdc-eventDetail__online">
            <Icon name="globe" size={16} />
            <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer nofollow">
              {t('detail.joinOnline')}
            </a>
          </p>
        ) : null}

        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('detail.liveCount', { count: attendees })}
        </Text>

        <Button variant="secondary" to="/events">
          {t('detail.back')}
        </Button>
      </article>
    </Container>
  );
}
