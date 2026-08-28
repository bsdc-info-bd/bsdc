import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState } from '@/components/ui';
import { FolderGit2 } from 'lucide-react';

export default function ProjectsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.projects')} description="Showcase developer projects" canonical="/projects" />
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.projects')}</h1>
        <EmptyState icon={<FolderGit2 className="h-16 w-16" />} title="No projects showcased yet" description="Projects will appear here once Firebase is configured and developers start sharing." />
      </div>
    </>
  );
}
