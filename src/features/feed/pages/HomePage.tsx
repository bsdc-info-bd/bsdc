import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { FeedSkeleton } from '@/components/ui';

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('seo.homeTitle')}
        description={t('seo.homeDescription')}
        canonical="/"
      />
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Welcome / Composer area */}
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to {t('common.appFullName')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('common.tagline')}. Sign in to start sharing, learning, and connecting with developers.
          </p>
        </div>

        <FeedSkeleton count={3} />
      </div>
    </>
  );
}
