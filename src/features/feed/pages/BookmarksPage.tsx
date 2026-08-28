import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState } from '@/components/ui';
import { Bookmark } from 'lucide-react';

export default function BookmarksPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.bookmarks')} noindex />
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.bookmarks')}</h1>
        <EmptyState
          icon={<Bookmark className="h-16 w-16" />}
          title="No bookmarks yet"
          description="Save posts, articles, and other content to read later."
        />
      </div>
    </>
  );
}
