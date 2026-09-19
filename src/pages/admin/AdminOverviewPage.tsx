/**
 * BSDC — src/pages/admin/AdminOverviewPage.tsx
 * Purpose : The administration home: how much is switched off, how much is about to be lost, and
 *   where to go to do something about either.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An overview is only worth having if it says something the panels do not. It leads with
 *   the two numbers that change a person's day — how many features are off, and how many deleted
 *   things are about to leave the bin — and then gets out of the way.
 *   Every panel is a real route, so a deep link works, a bookmark works, and the back button takes
 *   you where you expect instead of to a tab you have to re-find.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, Container, Grid, Heading, Icon, Skeleton, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { AdminScope } from '@/features/admin';
import { FLAG_REGISTRY } from '@/core/config/features';
import { countDisabled } from '@/core/config/flags';
import { listFlagStates, listAudit, listRecovery } from '@/entities/admin/repository';
import { countExpiringSoon } from '@/entities/admin/recovery';
import { summariseAudit } from '@/entities/admin/audit';
import type { AuditEntry } from '@/entities/admin/audit';
import type { RecoveryEntry } from '@/entities/admin/recovery';
import type { FlagState } from '@/core/config/flags';

/** One panel on the overview. */
interface Panel {
  readonly to: string;
  readonly titleKey: string;
  readonly icon: 'palette' | 'shield' | 'clock' | 'trash';
  readonly detail: string;
}

/**
 * Renders the administration home.
 * @returns the page element
 */
export function AdminOverviewPage(): React.ReactElement {
  const { t } = useTranslation('admin');
  const { profile, session, locale } = useSession();
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [states, setStates] = useState<readonly FlagState[]>([]);
  const [audit, setAudit] = useState<readonly AuditEntry[]>([]);
  const [recovery, setRecovery] = useState<readonly RecoveryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      listFlagStates().catch(() => [] as readonly FlagState[]),
      listAudit().catch(() => [] as readonly AuditEntry[]),
      listRecovery().catch(() => [] as readonly RecoveryEntry[]),
    ])
      .then(([flags, entries, bin]) => {
        setStates(flags);
        setAudit(entries);
        setRecovery(bin);
      })
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, []);

  const defaults = new Map(FLAG_REGISTRY.map((flag) => [flag.key, flag.defaultOn]));
  const off = countDisabled(defaults, states);
  const expiring = countExpiringSoon(recovery);
  const top = summariseAudit(audit).slice(0, 3);

  const panels: readonly Panel[] = [
    {
      to: '/admin/features',
      titleKey: 'nav.flags',
      icon: 'palette',
      detail: t('overview.flagsOff', { count: off, total: FLAG_REGISTRY.length }),
    },
    {
      to: '/admin/roles',
      titleKey: 'nav.members',
      icon: 'shield',
      detail: t('members.rootNote'),
    },
    {
      to: '/admin/audit',
      titleKey: 'nav.audit',
      icon: 'clock',
      detail: t('audit.summary', { count: audit.length }),
    },
    {
      to: '/admin/recovery',
      titleKey: 'nav.recovery',
      icon: 'trash',
      detail: t('overview.expiring', { count: expiring }),
    },
  ];

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

      <AdminScope role={profile?.role ?? 'guest'} root={session.claims.root} locale={locale}>
        {loading ? (
          <Skeleton height={280} />
        ) : (
          <>
            <Grid className="bsdc-admin__panels">
              {panels.map((panel) => (
                <Card as="article" key={panel.to} padding="md" className="bsdc-admin__panel">
                  <Link to={panel.to} className="bsdc-admin__panelLink">
                    <Icon name={panel.icon} size={22} />
                    <Text as="h2" size="md" weight={600} lang={lang}>
                      {t(panel.titleKey)}
                    </Text>
                    <Text as="p" size="sm" tone="muted" lang={lang}>
                      {panel.detail}
                    </Text>
                  </Link>
                </Card>
              ))}
            </Grid>

            <Card as="section" padding="md" className="bsdc-admin__recent">
              <Text as="h2" size="md" weight={600} lang={lang}>
                {t('overview.pendingAudit')}
              </Text>
              {top.length === 0 ? (
                <Text as="p" size="sm" tone="muted" lang={lang}>
                  {t('overview.empty')}
                </Text>
              ) : (
                <ul className="bsdc-admin__recentList">
                  {top.map((entry) => (
                    <li key={entry.action}>
                      <Badge tone="neutral">{entry.count}</Badge>
                      <span lang={lang}>{t(`audit.column.action`)}</span>
                      <code>{entry.action}</code>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </AdminScope>
    </Container>
  );
}
