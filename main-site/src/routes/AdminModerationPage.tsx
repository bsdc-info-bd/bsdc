import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeading,
  SelectField,
  TextField,
} from '@/design-system';
import { useModerationQueue, usePermissions } from '@/hooks/use-admin';
import {
  canClaim,
  canResolve,
  RESOLUTIONS,
  type ModerationActionKind,
} from '@/lib/admin/admin-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

/** The moderation queue: claim a report, then close it with a reason. */
export default function AdminModerationPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const uid = useAuthStore((state) => state.user?.uid ?? '');
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const canRead = permissions.includes('moderation.read');
  const queue = useModerationQueue(canRead);
  const [reason, setReason] = useState('');

  async function claim(reportId: string): Promise<void> {
    try {
      await queue.claim(reportId);
      toast.success(t('admin.moderation.claimed'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function resolve(reportId: string, action: ModerationActionKind): Promise<void> {
    try {
      await queue.resolve(reportId, action, reason.trim());
      toast.success(t('admin.moderation.resolved'));
      setReason('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('admin.moderation.metaTitle')}
        description={t('admin.moderation.metaDescription')}
        path={ROUTES.adminModeration}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading
          title={t('admin.moderation.title')}
          description={t('admin.moderation.description')}
        />

        {permissionsLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {!permissionsLoading && !canRead ? (
          <Alert tone="warning" title={t('admin.denied')} className="mt-4" />
        ) : null}

        {canRead ? (
          <>
            <Card className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={t('admin.moderation.filter')}
                  value={queue.filter}
                  options={[
                    { value: 'open', label: t('admin.moderation.statuses.open') },
                    { value: 'actioned', label: t('admin.moderation.statuses.actioned') },
                    { value: 'dismissed', label: t('admin.moderation.statuses.dismissed') },
                    { value: 'all', label: t('admin.moderation.statuses.all') },
                  ]}
                  onChange={(event) => {
                    queue.setFilter(event.target.value);
                  }}
                />
                <TextField
                  label={t('admin.moderation.reason')}
                  value={reason}
                  hint={t('admin.moderation.reasonHint')}
                  maxLength={500}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                />
              </div>
            </Card>

            {queue.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

            {!queue.isLoading && queue.reports.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<ShieldCheck size={22} />}
                  title={t('admin.moderation.emptyTitle')}
                  description={t('admin.moderation.emptyBody')}
                />
              </div>
            ) : null}

            <ul className="mt-4 grid gap-3">
              {queue.reports.map((report) => {
                const mine = canClaim(report, uid);
                return (
                  <Card as="li" key={report.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {t(`admin.moderation.subjects.${report.subjectType}`, {
                            defaultValue: report.subjectType,
                          })}{' '}
                          · {report.reason}
                        </p>
                        <p className="mt-1 font-mono text-2xs text-muted">{report.subjectId}</p>
                        {report.details.length > 0 ? (
                          <p className="mt-1 text-sm">{report.details}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted">
                          {formatAbsoluteDate(new Date(report.createdAt), language)} ·{' '}
                          {t('admin.moderation.reportCount', {
                            total: formatNumber(report.reportCount, language),
                          })}
                          {report.assignedTo !== null ? ` · ${t('admin.moderation.assigned')}` : ''}
                        </p>
                        {report.resolution.length > 0 ? (
                          <p className="mt-1 text-xs text-muted">{report.resolution}</p>
                        ) : null}
                      </div>
                      <Badge tone={report.status === 'open' ? 'warn' : 'neutral'}>
                        {t(`admin.moderation.statuses.${report.status}`)}
                      </Badge>
                    </div>

                    {report.status === 'open' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.assignedTo === null ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={queue.isSaving}
                            onClick={() => {
                              void claim(report.id);
                            }}
                          >
                            {t('admin.moderation.claim')}
                          </Button>
                        ) : null}
                        {RESOLUTIONS.filter((action) => canResolve(permissions, action)).map(
                          (action) => (
                            <Button
                              key={action}
                              size="sm"
                              variant={action === 'dismiss' ? 'ghost' : 'primary'}
                              disabled={queue.isSaving || !mine}
                              onClick={() => {
                                void resolve(report.id, action);
                              }}
                            >
                              {t(`admin.moderation.actions.${action}`)}
                            </Button>
                          ),
                        )}
                        {!mine ? (
                          <p className="text-xs text-muted">{t('admin.moderation.someoneElse')}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}
