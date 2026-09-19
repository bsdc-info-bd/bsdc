/**
 * BSDC — src/pages/admin/AdminRecoveryPage.tsx
 * Purpose : The recovery bin screen.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The bin is assembled on the device from soft-deleted mirror rows, which is what lets a
 *   person recover their own work with no network at all. It is then reconciled with the server when
 *   a restore or a purge succeeds, and re-read after either.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Heading, Skeleton } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { AdminScope, RecoveryBin } from '@/features/admin';
import { listRecovery } from '@/entities/admin/repository';
import type { RecoveryEntry } from '@/entities/admin/recovery';

/**
 * Renders the recovery bin route.
 * @returns the page element
 */
export function AdminRecoveryPage(): React.ReactElement {
  const { t } = useTranslation('admin');
  const { profile, session, locale } = useSession();
  const [entries, setEntries] = useState<readonly RecoveryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback((): void => {
    void listRecovery()
      .then(setEntries)
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  const role = profile?.role ?? 'guest';
  const isStaff = role === 'support' || role === 'moderator' || role === 'admin' || role === 'root';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('recovery.title')}
        </Heading>
      </header>
      {loading ? (
        <Skeleton height={320} />
      ) : (
        <RecoveryBin
          entries={entries}
          viewerUid={session.uid ?? ''}
          isStaff={isStaff}
          locale={locale}
          onChanged={reload}
        />
      )}
      <AdminScope role={role} root={session.claims.root} locale={locale}>
        <span />
      </AdminScope>
    </Container>
  );
}
