import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState } from '@/components/ui';
import { Briefcase } from 'lucide-react';

export default function JobsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.jobs')} description="Developer jobs in Bangladesh and worldwide" canonical="/jobs" />
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.jobs')}</h1>
        <EmptyState icon={<Briefcase className="h-16 w-16" />} title="No jobs listed yet" description="Job listings will appear here once Firebase is configured and companies start posting." />
      </div>
    </>
  );
}
