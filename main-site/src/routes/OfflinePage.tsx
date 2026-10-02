import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Button, EmptyState } from '@/design-system';
import { ROUTES } from '@/lib/site';

export default function OfflinePage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo
        title={`${t('errors.offlineTitle')} — BSDC`}
        description={t('errors.offlineBody')}
        path={ROUTES.offline}
        noindex
      />
      <div className="fab-container py-10">
        <EmptyState
          icon={<CloudOff size={36} />}
          title={t('errors.offlineTitle')}
          description={t('errors.offlineBody')}
          action={
            <Button onClick={() => window.location.reload()} variant="outline">
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    </>
  );
}
