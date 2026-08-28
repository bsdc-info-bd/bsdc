import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { FeedSkeleton } from '@/components/ui';
import { Compass } from 'lucide-react';

export default function ExplorePage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.explore')} description="Explore developer content, people, and topics" canonical="/explore" />
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Compass className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.explore')}</h1>
        </div>
        <FeedSkeleton count={4} />
      </div>
    </>
  );
}
