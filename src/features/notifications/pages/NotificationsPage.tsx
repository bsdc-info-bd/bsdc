import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState, Button } from '@/components/ui';
import { Bell, CheckCheck } from 'lucide-react';

export default function NotificationsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.notifications')} noindex />
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.notifications')}</h1>
          <Button variant="ghost" size="sm">
            <CheckCheck className="h-4 w-4" />
            {t('notifications.markAllRead')}
          </Button>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar">
          {['all', 'mentions', 'reactions', 'comments', 'follows'].map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${
                i === 0 ? 'border-brand-500 text-brand-500' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {t(`notifications.${tab}`)}
            </button>
          ))}
        </div>

        <EmptyState
          icon={<Bell className="h-16 w-16" />}
          title={t('notifications.noNotifications')}
          description="When someone interacts with your content, you'll see it here."
        />
      </div>
    </>
  );
}
