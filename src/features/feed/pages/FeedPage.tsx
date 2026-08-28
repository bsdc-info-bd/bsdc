import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { FeedSkeleton } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { PenLine, TrendingUp, Users, Clock } from 'lucide-react';

export default function FeedPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <>
        <Seo title="Feed" noindex />
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Sign in to see your personalized feed.</p>
          <Link to="/login"><Button variant="primary">{t('common.login')}</Button></Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Seo title="Feed" description="Your personalized developer feed" noindex />
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Composer */}
        <div className="card p-4">
          <Link to="/create" className="flex items-center gap-3 w-full">
            <div className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">
              <PenLine className="h-4 w-4" />
              {t('feed.whatsOnYourMind')}
            </div>
          </Link>
        </div>

        {/* Feed Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar">
          {[
            { id: 'foryou', label: t('feed.forYou'), icon: <TrendingUp className="h-4 w-4" /> },
            { id: 'following', label: t('feed.following'), icon: <Users className="h-4 w-4" /> },
            { id: 'latest', label: t('feed.latest'), icon: <Clock className="h-4 w-4" /> },
          ].map((tab, i) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                i === 0
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Feed content */}
        <FeedSkeleton count={5} />
      </div>
    </>
  );
}
