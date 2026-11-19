import { Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdCreditsReviewPanel } from '@/components/ads/AdCreditsReviewPanel';
import { Seo } from '@/components/seo/Seo';
import { EmptyState, PageSkeleton } from '@/design-system';
import { usePermissions } from '@/hooks/use-admin';
import type { Language } from '@/lib/mk/mk-logic';
import { ROUTES } from '@/lib/site';

/**
 * The staff queue for advertising credit requests.
 *
 * A page of its own rather than a card on the marketplace review screen: this
 * is money, the reviewer needs the full width to read a bKash transaction id,
 * and the two queues belong to different permissions (`advertising.review` vs
 * `marketplace.review`) so sharing a page would have to hide half of it.
 */
export default function AdminAdsPage() {
  const { t, i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const { permissions, isLoading } = usePermissions();

  if (isLoading) return <PageSkeleton label={t('common.loading')} />;

  const canReview = permissions.includes('advertising.review') || permissions.includes('owner');

  return (
    <>
      <Seo
        title={t('admin.ads.title')}
        description={t('admin.ads.lead')}
        path={ROUTES.adminAds}
        noindex
      />
      <div className="fab-container max-w-5xl space-y-6 py-6 sm:py-10">
        <header>
          <h1 className="text-2xl font-bold text-text">{t('admin.ads.title')}</h1>
          <p className="text-sm text-muted">{t('admin.ads.lead')}</p>
        </header>

        {canReview ? (
          <AdCreditsReviewPanel language={language} enabled />
        ) : (
          <EmptyState
            icon={<Megaphone size={28} />}
            title={t('admin.ads.deniedTitle')}
            description={t('admin.ads.deniedBody')}
          />
        )}
      </div>
    </>
  );
}
