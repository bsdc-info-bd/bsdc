import { Banknote, Boxes, ClipboardList, Store, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  LinkButton,
  PageSkeleton,
  SectionHeading,
  StatCard,
  TextField,
} from '@/design-system';
import { useVendorShop } from '@/hooks/use-vendor';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { bpsToPercent, slugify } from '@/lib/vendor/vendor-types';

/** The vendor's home: the shop's standing, its money, and the way in. */
export default function VendorPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { shop, isLoading, isError, open, isOpening } = useVendorShop();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [city, setCity] = useState('');

  const derivedSlug = slug.trim().length > 0 ? slug.trim() : slugify(name);

  async function submit(): Promise<void> {
    try {
      await open({
        slug: derivedSlug,
        name: name.trim(),
        tagline: tagline.trim(),
        city: city.trim(),
      });
      toast.success(t('vendor.openSubmitted'));
      setName('');
      setSlug('');
      setTagline('');
      setCity('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('vendor.metaTitle')}
        description={t('vendor.metaDescription')}
        path={ROUTES.vendor}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading title={t('vendor.title')} description={t('vendor.description')} />

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {isError ? <Alert tone="danger" title={t('vendor.failed')} className="mt-4" /> : null}

        {!isLoading && shop === null ? (
          <Card className="mt-4">
            <h2 className="text-lg font-semibold">{t('vendor.openTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('vendor.openBody')}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('vendor.shopName')}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <TextField
                label={t('vendor.shopSlug')}
                value={slug}
                hint={derivedSlug.length > 0 ? `/shop?shop=${derivedSlug}` : t('vendor.slugHint')}
                onChange={(event) => {
                  setSlug(event.target.value);
                }}
              />
              <TextField
                label={t('vendor.tagline')}
                value={tagline}
                onChange={(event) => {
                  setTagline(event.target.value);
                }}
              />
              <TextField
                label={t('vendor.city')}
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                }}
              />
            </div>
            <Button
              className="mt-4"
              disabled={isOpening || name.trim().length < 3 || derivedSlug.length === 0}
              onClick={() => {
                void submit();
              }}
            >
              {t('vendor.openAction')}
            </Button>
          </Card>
        ) : null}

        {shop !== null ? (
          <>
            <Card className="mt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Store size={18} aria-hidden="true" />
                    <span className="fab-truncate">{shop.name}</span>
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {t('vendor.commission', { percent: bpsToPercent(shop.commissionBps) })}
                  </p>
                </div>
                <Badge
                  tone={
                    shop.status === 'active'
                      ? 'green'
                      : shop.status === 'pending'
                        ? 'warn'
                        : 'danger'
                  }
                >
                  {t(`vendor.shopStatuses.${shop.status}`)}
                </Badge>
              </div>

              {shop.status === 'pending' ? (
                <Alert tone="info" title={t('vendor.pendingTitle')} className="mt-3">
                  {t('vendor.pendingBody')}
                </Alert>
              ) : null}
              {shop.status === 'suspended' ? (
                <Alert tone="danger" title={t('vendor.suspendedTitle')} className="mt-3">
                  {shop.suspensionReason.length > 0
                    ? shop.suspensionReason
                    : t('vendor.suspendedBody')}
                </Alert>
              ) : null}
            </Card>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Wallet size={16} />}
                label={t('vendor.balance')}
                value={formatMoney(shop.balance, 'BDT', language)}
                hint={t('vendor.balanceHint')}
              />
              <StatCard
                icon={<Banknote size={16} />}
                label={t('vendor.lifetime')}
                value={formatMoney(shop.lifetimeSales, 'BDT', language)}
              />
              <StatCard
                icon={<ClipboardList size={16} />}
                label={t('vendor.openOrders')}
                value={formatNumber(shop.openOrders, language)}
                hint={t('vendor.ordersTotal', {
                  total: formatNumber(shop.ordersCount, language),
                })}
              />
              <StatCard
                icon={<Boxes size={16} />}
                label={t('vendor.productCount')}
                value={formatNumber(shop.productCount, language)}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton to={ROUTES.vendorOrders}>{t('vendor.manageOrders')}</LinkButton>
              <LinkButton to={ROUTES.vendorProducts} variant="secondary">
                {t('vendor.manageProducts')}
              </LinkButton>
              <LinkButton to={ROUTES.vendorPayouts} variant="secondary">
                {t('vendor.managePayouts')}
              </LinkButton>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
