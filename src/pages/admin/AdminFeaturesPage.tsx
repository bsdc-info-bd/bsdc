/**
 * BSDC — src/pages/admin/AdminFeaturesPage.tsx
 * Purpose : The feature register screen.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Reads the device-held register first so the screen is never blank while the network
 *   answers, then watches the live register so a kill switch reaches an open session without a
 *   reload. Every read that can fail ends in ignoreReadFailure: an administrator who cannot reach
 *   the backend still sees the last known state of their own platform, which is the state they have
 *   to reason about while it is down.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Heading, Skeleton, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { AdminScope, FlagMatrix } from '@/features/admin';
import { listFlagStates, peekFlagStates, watchFlagStates } from '@/entities/admin/repository';
import type { FlagState } from '@/core/config/flags';

/**
 * Renders the feature register route.
 * @returns the page element
 */
export function AdminFeaturesPage(): React.ReactElement {
  const { t } = useTranslation('admin');
  const { profile, session, locale } = useSession();
  const [states, setStates] = useState<readonly FlagState[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback((): void => {
    void listFlagStates()
      .then(setStates)
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void peekFlagStates().then((cached) => {
      if (cached.length > 0) setStates(cached);
    });
    reload();
    const release = watchFlagStates(setStates);
    return release;
  }, [reload]);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('flags.title')}
        </Heading>
      </header>
      <AdminScope role={profile?.role ?? 'guest'} root={session.claims.root} locale={locale}>
        {loading && states.length === 0 ? (
          <Skeleton height={420} />
        ) : (
          <FlagMatrix states={states} locale={locale} timezone={timezone} onChanged={reload} />
        )}
      </AdminScope>
      <Text as="p" size="xs" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
        {timezone}
      </Text>
    </Container>
  );
}
