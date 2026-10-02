import { FileDown } from 'lucide-react';
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
import { usePermissions } from '@/hooks/use-admin';
import { useReports } from '@/hooks/use-analytics';
import {
  REPORT_KINDS,
  type ReportKind,
  type SnapshotSummary,
} from '@/lib/analytics/analytics-types';
import { formatAbsoluteDate } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';

const WINDOWS = [7, 30, 90, 180, 365];

/**
 * Report snapshots. Taking a snapshot freezes the numbers in the database;
 * the PDF is only ever a rendering of what was frozen.
 */
export default function AdminReportsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const allowed = permissions.includes('audit.read');
  const reports = useReports(allowed);

  const [kind, setKind] = useState<ReportKind>('overview');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(30);

  async function take(): Promise<void> {
    try {
      await reports.create(kind, title.trim(), days);
      toast.success(t('reports.created'));
      setTitle('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function print(snapshot: SnapshotSummary): Promise<void> {
    try {
      await reports.download(snapshot);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('reports.metaTitle')}
        description={t('reports.metaDescription')}
        path={ROUTES.adminReports}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading title={t('reports.title')} description={t('reports.description')} />

        {permissionsLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {!permissionsLoading && !allowed ? (
          <Alert tone="warning" title={t('admin.denied')} className="mt-4" />
        ) : null}

        {allowed ? (
          <>
            <Alert tone="info" title={t('reports.englishTitle')} className="mt-4">
              {t('reports.englishBody')}
            </Alert>

            <Card className="mt-4">
              <h2 className="text-lg font-semibold">{t('reports.newTitle')}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextField
                  label={t('reports.fieldTitle')}
                  value={title}
                  maxLength={160}
                  onChange={(event) => {
                    setTitle(event.target.value);
                  }}
                />
                <SelectField
                  label={t('reports.fieldKind')}
                  value={kind}
                  options={REPORT_KINDS.map((item) => ({
                    value: item,
                    label: t(`reports.kinds.${item}`),
                  }))}
                  onChange={(event) => {
                    setKind(event.target.value as ReportKind);
                  }}
                />
                <SelectField
                  label={t('reports.fieldWindow')}
                  value={String(days)}
                  options={WINDOWS.map((item) => ({
                    value: String(item),
                    label: t('analytics.days', { total: item }),
                  }))}
                  onChange={(event) => {
                    setDays(Number.parseInt(event.target.value, 10));
                  }}
                />
              </div>
              <Button
                className="mt-4"
                disabled={reports.isSaving || title.trim().length < 3}
                onClick={() => {
                  void take();
                }}
              >
                {t('reports.create')}
              </Button>
            </Card>

            {reports.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

            {!reports.isLoading && reports.snapshots.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<FileDown size={22} />}
                  title={t('reports.emptyTitle')}
                  description={t('reports.emptyBody')}
                />
              </div>
            ) : null}

            <ul className="mt-4 grid gap-3">
              {reports.snapshots.map((snapshot) => (
                <Card as="li" key={snapshot.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{snapshot.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {snapshot.periodFrom} — {snapshot.periodTo} ·{' '}
                        {formatAbsoluteDate(new Date(snapshot.createdAt), language)}
                      </p>
                    </div>
                    <Badge tone="blue">{t(`reports.kinds.${snapshot.kind}`)}</Badge>
                  </div>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="secondary"
                    disabled={reports.isRendering}
                    iconStart={<FileDown size={16} />}
                    onClick={() => {
                      void print(snapshot);
                    }}
                  >
                    {t('reports.download')}
                  </Button>
                </Card>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}
