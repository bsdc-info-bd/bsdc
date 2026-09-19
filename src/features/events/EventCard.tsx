/**
 * BSDC — src/features/events/EventCard.tsx
 * Purpose : One event, in the list: when, where, and whether there is room.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The card leads with the date because that is the first question anybody asks, and it
 *   states plainly when an event is full rather than quietly keeping the button enabled until the
 *   write fails. A phase badge — live, upcoming, ended — is derived from the event's own times, so
 *   the card and the detail screen can never disagree about whether the thing is happening now.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Icon, Text } from '@/shared/ui';
import { formatDateTime } from '@/shared/lib/date';
import type { Locale } from '@/core/config/app';
import {
  EVENT_MODE_LABELS,
  EVENT_STATUS_LABELS,
  type EventMode,
} from '@/core/config/opportunities';
import { eventPhase, seatsLeft, type BsdcEvent } from '@/entities/event/model';

/** Props for the event card. */
export interface EventCardProps {
  readonly event: BsdcEvent;
  readonly locale: Locale;
  readonly now?: Date | undefined;
}

/**
 * Renders an event card.
 * @param props component props
 * @returns the card element
 */
export function EventCard({ event, locale, now }: EventCardProps): React.ReactElement {
  const { t } = useTranslation('events');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const phase = eventPhase(event, now);
  const left = seatsLeft(event);
  const title = locale === 'bn' && event.titleBn.length > 0 ? event.titleBn : event.title;
  const modeLabel = EVENT_MODE_LABELS[event.mode][locale === 'bn' ? 'bn' : 'en'];

  return (
    <Card as="article" className="bsdc-eventCard">
      <Link className="bsdc-eventCard__link" to={`/events/${event.id}`}>
        {event.coverUrl.length > 0 ? (
          <img
            className="bsdc-eventCard__cover"
            src={event.coverUrl}
            alt=""
            width={640}
            height={320}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="bsdc-eventCard__body">
          <div className="bsdc-eventCard__badges">
            <Badge
              tone={phase === 'live' ? 'success' : phase === 'ended' ? 'neutral' : 'brand'}
              variant="outline"
            >
              {t(`phase.${phase}`)}
            </Badge>
            <Badge tone="neutral" variant="outline">
              {modeLabel}
            </Badge>
            {event.status !== 'published' ? (
              <Badge tone="warning" variant="outline">
                {EVENT_STATUS_LABELS[event.status][locale === 'bn' ? 'bn' : 'en']}
              </Badge>
            ) : null}
          </div>
          <h3 className="bsdc-eventCard__title" lang={lang}>
            {title}
          </h3>
          <p className="bsdc-eventCard__when" lang={lang}>
            <Icon name="calendar" size={15} />
            {formatDateTime(event.startsAt, locale)}
          </p>
          {event.venue !== null ? (
            <p className="bsdc-eventCard__where" lang={lang}>
              <Icon name="mapPin" size={15} />
              {[event.venue.label, event.venue.area].filter((part) => part.length > 0).join(', ')}
            </p>
          ) : (
            <p className="bsdc-eventCard__where" lang={lang}>
              <Icon name="globe" size={15} />
              {t('online')}
            </p>
          )}
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {left === null
              ? t('rsvpCount', { count: event.rsvpCount })
              : left > 0
                ? t('seatsLeft', { count: left })
                : t('full')}
          </Text>
        </div>
      </Link>
    </Card>
  );
}

/**
 * Reports the label to use for a mode, in one place, so a filter rail and a card agree.
 * @param mode the event mode
 * @param locale viewer locale
 * @returns the label
 */
export function modeLabel(mode: EventMode, locale: Locale): string {
  return EVENT_MODE_LABELS[mode][locale === 'bn' ? 'bn' : 'en'];
}
