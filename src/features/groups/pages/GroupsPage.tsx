import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState, Button } from '@/components/ui';
import { Users, Plus } from 'lucide-react';

export default function GroupsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.groups')} description="Join developer groups" canonical="/groups" />
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.groups')}</h1>
          <Button variant="primary" size="sm"><Plus className="h-4 w-4" /> Create Group</Button>
        </div>
        <EmptyState icon={<Users className="h-16 w-16" />} title="No groups yet" description="Groups will appear here once Firebase is configured and users start creating them." />
      </div>
    </>
  );
}
