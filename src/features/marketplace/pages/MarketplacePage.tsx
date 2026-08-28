import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { EmptyState } from '@/components/ui';
import { ShoppingBag } from 'lucide-react';

export default function MarketplacePage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('common.marketplace')} description="Developer marketplace for services, templates, and digital products" canonical="/marketplace" />
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('common.marketplace')}</h1>
        <EmptyState icon={<ShoppingBag className="h-16 w-16" />} title="Marketplace is empty" description="Listings will appear here once Firebase is configured and sellers start adding products." />
      </div>
    </>
  );
}
