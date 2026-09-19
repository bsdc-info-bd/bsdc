/**
 * BSDC — src/features/events/EventList.tsx
 * Purpose : The event directory: filters, phases, and the honest empty state.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Filters are additive and every one of them is removable from the rail that shows them,
 *   because a filter you cannot find is a filter that silently hides the thing you came for. The
 *   list is virtualised past a hundred rows — a national community's event archive is not twenty
 *   items and pretending otherwise is how a list becomes unusable at exactly the moment it matters.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Chip, ChipRail, EmptyState, VirtualList } from '@/shared/ui';
import { FEED_BUDGETS } from '@/core/config/limits';
import type { Locale } from '@/core/config/app';
import { EVENT_MODES, EVENT_MODE_LABELS, type EventMode } from '@/core/config/opportunities';
import { sortEvents, type BsdcEvent } from '@/entities/event/model';
import { EventCard } from './EventCard';

/** Props for the event list. */
export interface EventListProps {
  readonly events: readonly BsdcEvent[];
  readonly locale: Locale;
  readonly activeMode: EventMode | null;
  readonly onModeChange: (mode: EventMode | null) => void;
  readonly height?: (number | string) | undefined;
}

/**
 * Renders the event directory.
 * @param props component props
 * @returns the list element
 */
export function EventList({
  events,
  locale,
  activeMode,
  onModeChange,
  height = 720,
}: EventListProps): React.ReactElement {
  const { t } = useTranslation('events');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const ordered = sortEvents(events);

  if (ordered.length === 0) {
    return (
      <EmptyState
        illustration="empty-state"
        title={t('list.empty.title')}
        description={t('list.empty.description')}
        lang={lang}
      />
    );
  }

  return (
    <div className="bsdc-eventList">
      <ChipRail label={t('list.filterLabel')}>
        <Chip selected={activeMode === null} onToggle={() => onModeChange(null)}>
          {t('list.all')}
        </Chip>
        {EVENT_MODES.map((mode) => (
          <Chip key={mode} selected={activeMode === mode} onToggle={() => onModeChange(mode)}>
            {EVENT_MODE_LABELS[mode][locale === 'bn' ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>

      {ordered.length > FEED_BUDGETS.virtualizationThreshold ? (
        <VirtualList
          items={ordered}
          itemHeight={148}
          height={height}
          label={t('list.label')}
          renderItem={(event) => <EventCard event={event} locale={locale} />}
        />
      ) : (
        <ul className="bsdc-eventList__grid">
          {ordered.map((event) => (
            <li key={event.id}>
              <EventCard event={event} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
