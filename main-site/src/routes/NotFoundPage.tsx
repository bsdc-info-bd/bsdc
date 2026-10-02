import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { EmptyState, LinkButton } from '@/design-system';
import { ROUTES } from '@/lib/site';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo
        title={`${t('errors.notFoundTitle')} — BSDC`}
        description={t('errors.notFoundBody')}
        path="/404"
        noindex
      />
      <div className="fab-container py-10">
        <EmptyState
          icon={<Compass size={36} />}
          title={t('errors.notFoundTitle')}
          description={t('errors.notFoundBody')}
          action={<LinkButton to={ROUTES.home}>{t('common.backHome')}</LinkButton>}
        />
      </div>
    </>
  );
}
