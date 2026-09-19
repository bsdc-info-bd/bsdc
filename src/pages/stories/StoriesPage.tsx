/**
 * BSDC — src/pages/stories/StoriesPage.tsx
 * Purpose : The story screen: what is live right now, and the one you have not posted yet.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Stories are the only thing on BSDC that is allowed to disappear, so the page says when
 *   each frame goes rather than leaving it unsaid. Your own frames stay listed after they expire for
 *   as long as this device remembers them, because seeing your own day is different from showing it
 *   to everyone.
 *   No video, ever: the composer refuses it in the same code path as every other upload surface.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Container, EmptyState, Heading, Skeleton, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { StoryComposer, StoryRail, StoryViewer } from '@/features/stories';
import { listLiveStories } from '@/entities/story/repository';
import { groupByAuthor, hoursRemaining, type Story } from '@/entities/story/model';

/**
 * Renders the stories route.
 * @returns the stories page
 */
export function StoriesPage(): React.ReactElement {
  const { t } = useTranslation('stories');
  const { session, profile, locale } = useSession();
  const [stories, setStories] = useState<readonly Story[]>([]);
  const [seen, setSeen] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    void listLiveStories()
      .then((next) => setStories(next.items))
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, []);

  const lang = locale === 'bn' ? 'bn' : 'en';
  const groups = groupByAuthor(stories);
  const active = viewing === null ? undefined : groups.find((group) => group.authorUid === viewing);

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
      </header>

      {loading ? (
        <Skeleton height={140} />
      ) : (
        <StoryRail
          stories={stories}
          locale={locale}
          viewerUid={session.uid ?? ''}
          viewerName={profile?.displayName ?? ''}
          viewerPhotoUrl={profile?.photoUrl ?? ''}
          seenIds={seen}
          onOpen={setViewing}
          onCompose={() => setComposing(true)}
        />
      )}

      {composing && profile !== null ? (
        <StoryComposer
          author={profile}
          locale={locale}
          onPublished={(story) => {
            setStories((current) => [story, ...current]);
            setComposing(false);
          }}
          onCancel={() => setComposing(false)}
        />
      ) : null}

      {active !== undefined ? (
        <StoryViewer
          frames={active.frames}
          locale={locale}
          viewerUid={session.uid ?? ''}
          onClose={() => setViewing(null)}
          onSeen={(storyId) => setSeen((current) => [...current, storyId])}
        />
      ) : null}

      {!loading && stories.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('empty.title')}
          description={t('empty.description')}
          lang={lang}
          action={
            profile !== null ? (
              <Button variant="primary" onClick={() => setComposing(true)}>
                {t('empty.action')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('expiryNote')}
      </Text>

      {stories.length > 0 ? (
        <Text as="p" size="xs" tone="muted" lang={lang}>
          {t('soonestExpiry', {
            hours: Math.min(...stories.map((story) => hoursRemaining(story))),
          })}
        </Text>
      ) : null}
    </Container>
  );
}
