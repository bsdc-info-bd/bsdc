/**
 * BSDC — src/features/admin/AuditTrail.tsx
 * Purpose : The trail: who did what, to whom, and what it was before.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An audit trail that only records what happened is half a trail. Each row carries the
 *   previous value as well as the next one, so a decision can be undone without archaeology, and
 *   the actor's role *at the time* is stored alongside their id, so a later demotion does not
 *   quietly rewrite who was entitled to do what.
 *   The rows are never editable and never deleted by a client — firestore.rules refuses both — and
 *   the screen says so, because a log that can be tidied is not a log, it is a story.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, EmptyState, Input, Select, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import {
  AUDIT_ACTIONS,
  auditActionLabel,
  filterAudit,
  type AuditAction,
} from '@/entities/admin/audit';
import type { AuditEntry, AuditFilter } from '@/entities/admin/audit';

/** Props for the audit trail. */
export interface AuditTrailProps {
  readonly entries: readonly AuditEntry[];
  readonly locale: Locale;
  readonly height?: number | undefined;
}

/**
 * Renders the audit trail.
 * @param props component props
 * @returns the trail element
 */
export function AuditTrail({ entries, locale, height = 640 }: AuditTrailProps): React.ReactElement {
  const { t } = useTranslation('admin');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [action, setAction] = useState<AuditAction | 'all'>('all');
  const [query, setQuery] = useState('');

  const filter = useMemo<AuditFilter>(
    () => ({
      ...(action === 'all' ? {} : { action }),
      ...(query.trim().length > 0 ? { query: query.trim() } : {}),
    }),
    [action, query],
  );

  const visible = filterAudit(entries, filter);

  return (
    <Card as="section" className="bsdc-audit" padding="md">
      <div className="bsdc-audit__head">
        <div>
          <Text as="h2" size="lg" weight={700} lang={lang}>
            {t('audit.title')}
          </Text>
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {t('audit.subtitle')}
          </Text>
        </div>
        <Badge tone="neutral">{t('audit.summary', { count: visible.length })}</Badge>
      </div>

      <div className="bsdc-audit__filters">
        <Input
          type="search"
          label={t('audit.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select<AuditAction | 'all'>
          label={t('audit.action')}
          value={action}
          onValueChange={setAction}
          options={[
            { value: 'all', label: t('audit.action') },
            ...AUDIT_ACTIONS.map((entry) => ({
              value: entry,
              label: auditActionLabel(entry)[lang],
            })),
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('audit.empty')}
          description={t('audit.subtitle')}
          lang={lang}
        />
      ) : (
        <div className="bsdc-audit__scroll" style={{ maxHeight: height }}>
          <table className="bsdc-audit__table">
            <caption className="bsdc-visually-hidden">{t('audit.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('audit.column.when')}</th>
                <th scope="col">{t('audit.column.action')}</th>
                <th scope="col">{t('audit.column.actor')}</th>
                <th scope="col">{t('audit.column.target')}</th>
                <th scope="col">{t('audit.column.change')}</th>
                <th scope="col">{t('audit.column.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt, locale)}</time>
                  </td>
                  <td lang={lang}>{auditActionLabel(entry.action)[lang]}</td>
                  <td>
                    <code>{entry.actorUid}</code>
                    <span className="bsdc-audit__role">{entry.actorRole}</span>
                  </td>
                  <td>
                    {entry.targetType.length > 0 ? (
                      <>
                        <span lang={lang}>{entry.targetType}</span> <code>{entry.targetId}</code>
                      </>
                    ) : (
                      <code>{entry.targetUid}</code>
                    )}
                  </td>
                  <td>
                    <code className="bsdc-audit__before">{entry.before}</code>
                    <span aria-hidden="true"> → </span>
                    <code className="bsdc-audit__after">{entry.after}</code>
                  </td>
                  <td lang={lang}>{entry.reason.length > 0 ? entry.reason : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Formats an instant for the trail, in the viewer's own calendar and language.
 * @param iso ISO instant
 * @param locale the viewer's locale
 * @returns the formatted date and time
 */
function formatWhen(iso: string, locale: Locale): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);
}
