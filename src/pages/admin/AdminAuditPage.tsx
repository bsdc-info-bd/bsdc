/**
 * BSDC — src/pages/admin/AdminAuditPage.tsx
 * Purpose : The audit trail screen.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The trail is read with admin claims and is never written by a client. This screen shows
 *   the device-held copy first, then replaces it with the live one, so an administrator looking at
 *   what happened during an outage sees what this device knows rather than an empty table that
 *   implies nothing happened.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Heading, Skeleton } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { AdminScope, AuditTrail } from '@/features/admin';
import { listAudit, peekAudit, watchAudit } from '@/entities/admin/repository';
import type { AuditEntry } from '@/entities/admin/audit';

/**
 * Renders the audit trail route.
 * @returns the page element
 */
export function AdminAuditPage(): React.ReactElement {
  const { t } = useTranslation('admin');
  const { profile, session, locale } = useSession();
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback((): void => {
    void listAudit()
      .then(setEntries)
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void peekAudit().then((cached) => {
      if (cached.length > 0) setEntries(cached);
    });
    reload();
    const release = watchAudit({}, setEntries);
    return release;
  }, [reload]);

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('audit.title')}
        </Heading>
      </header>
      <AdminScope role={profile?.role ?? 'guest'} root={session.claims.root} locale={locale}>
        {loading && entries.length === 0 ? (
          <Skeleton height={420} />
        ) : (
          <AuditTrail entries={entries} locale={locale} />
        )}
      </AdminScope>
    </Container>
  );
}
