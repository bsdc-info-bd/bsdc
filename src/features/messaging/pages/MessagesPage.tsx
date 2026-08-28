import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState, Button } from '@/components/ui';
import { MessageSquare, Plus } from 'lucide-react';

export default function MessagesPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.messages')} noindex />
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.messages')}</h1>
          <Button variant="primary" size="sm">
            <Plus className="h-4 w-4" />
            {t('messaging.newMessage')}
          </Button>
        </div>

        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title={t('messaging.noMessages')}
          description="Start a conversation with another developer."
        />
      </div>
    </>
  );
}
