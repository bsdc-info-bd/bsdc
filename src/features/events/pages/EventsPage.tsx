import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState } from '@/components/ui';
import { Calendar } from 'lucide-react';

export default function EventsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.events')} description="Developer events and meetups" canonical="/events" />
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.events')}</h1>
        <EmptyState icon={<Calendar className="h-16 w-16" />} title="No events scheduled yet" description="Events will appear here once Firebase is configured and organizers start creating them." />
      </div>
    </>
  );
}
