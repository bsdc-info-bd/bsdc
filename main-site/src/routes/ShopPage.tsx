import { Heart, ShoppingBag, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AdSlot } from '@/components/ads/AdSlot';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeading,
  SelectField,
  TextField,
} from '@/design-system';
import { useShopCatalog } from '@/hooks/use-market';
import {
  averageRating,
  CATALOG_SORTS,
  discountPercent,
  formatMoney,
  isPurchasable,
  type CatalogSort,
} from '@/lib/market/market-types';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { productPath, ROUTES, SITE } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** The storefront: everything on sale from shops that are trading today. */
export default function ShopPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const catalog = useShopCatalog();

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('shop.title'),
    itemListElement: catalog.products.slice(0, 20).map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.title,
        description: product.summary,
        url: new URL(productPath(product.slug), SITE.url).toString(),
        offers: {
          '@type': 'Offer',
          price: (product.price / 100).toFixed(2),
          priceCurrency: product.currency,
          availability: isPurchasable(product)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        },
      },
    })),
  };

  return (
    <>
      <Seo
        title={t('shop.metaTitle')}
        description={t('shop.metaDescription')}
        path={ROUTES.shop}
        jsonLd={[itemList]}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('shop.title')} description={t('shop.description')} />

        <Card className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label={t('shop.search')}
              type="search"
              value={catalog.filters.search}
              maxLength={80}
              onChange={(event) => {
                catalog.setFilters({ ...catalog.filters, search: event.target.value });
              }}
            />
            <SelectField
              label={t('shop.category')}
              value={catalog.filters.category ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                catalog.setFilters({ ...catalog.filters, category: value === '' ? null : value });
              }}
              options={[
                { value: '', label: t('shop.anyCategory') },
                ...catalog.categories.map((category) => ({ value: category, label: category })),
              ]}
            />
            <SelectField
              label={t('shop.sort')}
              value={catalog.filters.sort}
              onChange={(event) => {
                catalog.setFilters({
                  ...catalog.filters,
                  sort: event.target.value as CatalogSort,
                });
              }}
              options={CATALOG_SORTS.map((sort) => ({
                value: sort,
                label: t(`shop.sorts.${sort}`),
              }))}
            />
          </div>
        </Card>

        <AdSlot placement="shop" className="mt-4" />

        {catalog.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {catalog.isError ? <Alert tone="danger" title={t('shop.failed')} className="mt-4" /> : null}

        {!catalog.isLoading && !catalog.isError && catalog.products.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<ShoppingBag size={22} />}
              title={t('shop.emptyTitle')}
              description={t('shop.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {catalog.products.map((product) => {
            const saving = discountPercent(product.price, product.priceOriginal);
            const rating = averageRating(product.ratingSum, product.ratingCount);
            return (
              <Card as="li" key={product.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 text-base font-semibold">
                    <Link to={productPath(product.slug)} className="fab-link">
                      {product.title}
                    </Link>
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!isSignedIn}
                    aria-pressed={product.wishlisted}
                    onClick={() => {
                      catalog.wish(product.id);
                    }}
                  >
                    <Heart
                      size={14}
                      className={cn(product.wishlisted && 'fill-current text-green-700')}
                    />
                    <span className="fab-sr-only">{t('shop.wishlist')}</span>
                  </Button>
                </div>

                <p className="mt-1 text-xs text-muted">{product.shopName}</p>

                <p className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-semibold">
                    {formatMoney(product.price, product.currency, language)}
                  </span>
                  {product.priceOriginal !== null && saving !== null ? (
                    <>
                      <span className="text-xs text-muted line-through">
                        {formatMoney(product.priceOriginal, product.currency, language)}
                      </span>
                      <Badge tone="green">{t('shop.saving', { percent: saving })}</Badge>
                    </>
                  ) : null}
                </p>

                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {rating !== null ? (
                    <span className="flex items-center gap-1">
                      <Star size={12} aria-hidden="true" />
                      {formatNumber(rating, language)} (
                      {formatNumber(product.ratingCount, language)})
                    </span>
                  ) : (
                    <span>{t('shop.noRatings')}</span>
                  )}
                  {isPurchasable(product) ? (
                    product.isDigital ? (
                      <Badge tone="neutral">{t('shop.digital')}</Badge>
                    ) : (
                      <span>
                        {t('shop.inStock', { total: formatNumber(product.stock, language) })}
                      </span>
                    )
                  ) : (
                    <Badge tone="neutral">{t('shop.outOfStock')}</Badge>
                  )}
                </p>
              </Card>
            );
          })}
        </ul>
      </div>
    </>
  );
}
