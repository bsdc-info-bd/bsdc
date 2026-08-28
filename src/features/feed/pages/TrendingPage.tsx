import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { FeedSkeleton } from '@/components/ui';
import { TrendingUp } from 'lucide-react';

export default function TrendingPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.trending')} description="Trending developer content" canonical="/trending" />
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.trending')}</h1>
        </div>
        <FeedSkeleton count={4} />
      </div>
    </>
  );
}
