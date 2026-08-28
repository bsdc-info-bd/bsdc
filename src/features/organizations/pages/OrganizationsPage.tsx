import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState } from '@/components/ui';
import { Building2 } from 'lucide-react';

export default function OrganizationsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.organizations')} description="Developer organizations and companies" canonical="/organizations" />
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.organizations')}</h1>
        <EmptyState icon={<Building2 className="h-16 w-16" />} title="No organizations listed yet" description="Organizations will appear here once Firebase is configured." />
      </div>
    </>
  );
}
