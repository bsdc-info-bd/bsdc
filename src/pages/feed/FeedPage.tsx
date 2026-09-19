/**
 * BSDC — src/pages/feed/FeedPage.tsx
 * Purpose : The feed route: compose, choose a sort, and read what the community published.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The composer sits above the stream on this route only; everywhere else the stream is
 *   embedded without it, so a group page is about the group and not about the person.
 *   Sorting is a real choice with two honest options. Neither invents a ranking the platform
 *   cannot justify: `latest` is chronological and `trending` orders by the reactions and comments
 *   the posts actually received.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/shared/ui/Chip';
import { Container } from '@/shared/ui/Container';
import { Heading, Text } from '@/shared/ui/Typography';
import { useSession } from '@/features/auth';
import { FeedStream, type FeedSort } from '@/features/feed';
import { PostComposer } from '@/features/composer';
import { SignInCard } from '@/features/auth';

/**
 * Renders the feed route.
 * @returns the feed page
 */
export function FeedPage(): React.ReactElement {
  const { t } = useTranslation('feed');
  const { session, profile, locale } = useSession();
  const [sort, setSort] = useState<FeedSort>('latest');
  const signedIn = session.status === 'signed-in';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('subtitle')}
        </Text>
        <div className="bsdc-page__filters" role="group" aria-label={t('sortLabel')}>
          {(['latest', 'trending'] as const).map((option) => (
            <Chip key={option} selected={sort === option} onToggle={() => setSort(option)}>
              {t(`sort.${option}`)}
            </Chip>
          ))}
        </div>
      </header>

      {signedIn && profile !== null ? (
        <PostComposer
          author={profile}
          locale={locale}
          showScheduling
          onPublished={() => setSort('latest')}
        />
      ) : (
        <SignInCard reason="default" />
      )}

      <FeedStream
        viewer={profile}
        locale={locale}
        sort={sort}
        pullToRefresh
        canModerate={
          session.claims.role === 'moderator' ||
          session.claims.role === 'admin' ||
          session.claims.root
        }
      />
    </Container>
  );
}
