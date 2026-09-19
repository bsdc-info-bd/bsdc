/**
 * BSDC — src/pages/events/EventsPage.tsx
 * Purpose : The event directory: what is happening, and what you said you would attend.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two lists, because they answer different questions — "what can I go to" and "what did I
 *   say yes to". Hosting a form is behind a button rather than open by default, since most visits
 *   to this page are somebody looking for something to attend, not somebody organising one.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Container, Heading, Skeleton, Tabs, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { EventForm, EventList } from '@/features/events';
import { createEvent, listEvents } from '@/entities/event/repository';
import { listMyRsvps } from '@/entities/event/repository';
import type { BsdcEvent } from '@/entities/event/model';
import type { EventMode } from '@/core/config/opportunities';

/**
 * Renders the events route.
 * @returns the events page
 */
export function EventsPage(): React.ReactElement {
  const { t } = useTranslation('events');
  const { session, profile, locale } = useSession();
  const [events, setEvents] = useState<readonly BsdcEvent[]>([]);
  const [mine, setMine] = useState<readonly BsdcEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<EventMode | null>(null);
  const [composing, setComposing] = useState(false);

  const reload = (): void => {
    void listEvents({ ...(mode !== null ? { mode } : {}) })
      .then((next) => setEvents(next.items))
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) {
      setMine([]);
      return;
    }
    void listMyRsvps(uid)
      .then(async (rsvps) => {
        if (rsvps.length === 0) {
          setMine([]);
          return;
        }
        const { loadEvent } = await import('@/entities/event/repository');
        const loaded = await Promise.all(rsvps.map((rsvp) => loadEvent(rsvp.eventId)));
        setMine(loaded.filter((event): event is BsdcEvent => event !== undefined));
      })
      .catch(ignoreReadFailure);
  }, [session.uid]);

  const lang = locale === 'bn' ? 'bn' : 'en';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
        {profile !== null ? (
          <Button
            variant={composing ? 'ghost' : 'primary'}
            iconLeft="plus"
            onClick={() => setComposing((current) => !current)}
          >
            {composing ? t('host.cancel') : t('host.start')}
          </Button>
        ) : null}
      </header>

      {composing && profile !== null ? (
        <EventForm
          ownerUid={profile.uid}
          ownerName={profile.displayName}
          locale={locale}
          onCancel={() => setComposing(false)}
          onSubmit={async (event) => {
            await createEvent(event);
            setComposing(false);
            reload();
          }}
        />
      ) : null}

      {loading ? (
        <Skeleton height={320} />
      ) : (
        <Tabs
          label={t('tabs.label')}
          defaultValue="upcoming"
          items={[
            {
              value: 'upcoming',
              label: t('tabs.upcoming'),
              content: (
                <EventList
                  events={events}
                  locale={locale}
                  activeMode={mode}
                  onModeChange={setMode}
                />
              ),
            },
            {
              value: 'mine',
              label: t('tabs.mine'),
              content:
                mine.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('tabs.mineEmpty')}
                  </Text>
                ) : (
                  <EventList
                    events={mine}
                    locale={locale}
                    activeMode={null}
                    onModeChange={() => undefined}
                  />
                ),
            },
          ]}
        />
      )}
    </Container>
  );
}
