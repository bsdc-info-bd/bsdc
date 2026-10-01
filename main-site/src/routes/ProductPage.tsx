import { Minus, Plus, ShoppingCart, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MarkdownView } from '@/components/content/MarkdownView';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  PageSkeleton,
  SectionHeading,
  TextareaField,
} from '@/design-system';
import { useProduct } from '@/hooks/use-market';
import {
  averageRating,
  discountPercent,
  formatMoney,
  isPurchasable,
  purchaseCeiling,
} from '@/lib/market/market-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { productPath, ROUTES, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** One product: price, availability, verified reviews and a buy button. */
export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const detail = useProduct(slug);

  const [quantity, setQuantity] = useState(1);
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');

  const product = detail.product;
  const ceiling =
    product === null
      ? 0
      : purchaseCeiling({
          stock: product.stock,
          isDigital: product.is_digital,
          maxPerOrder: product.max_per_order,
        });

  async function add() {
    try {
      await detail.add(quantity);
      toast.success(t('shop.addedToCart'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function sendReview() {
    try {
      await detail.review(rating, reviewBody.trim());
      setReviewBody('');
      toast.success(t('shop.reviewSaved'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  if (detail.isLoading) {
    return (
      <div className="fab-container py-10">
        <PageSkeleton label={t('common.loading')} />
      </div>
    );
  }

  if (detail.isError || product === null) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('shop.productNotFound')}>
          <Link to={ROUTES.shop} className="fab-link">
            {t('shop.backToShop')}
          </Link>
        </Alert>
      </div>
    );
  }

  const saving = discountPercent(product.price, product.price_original);
  const average = averageRating(product.rating_sum, product.rating_count);
  const available = isPurchasable({ stock: product.stock, isDigital: product.is_digital });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.summary,
    sku: product.slug,
    image: product.images.slice(0, 5),
    url: new URL(productPath(product.slug), SITE.url).toString(),
    brand: { '@type': 'Brand', name: detail.shop?.name ?? SITE.shortName },
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: detail.shop?.name ?? SITE.name },
    },
    ...(average !== null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: average,
            reviewCount: product.rating_count,
          },
        }
      : {}),
  };

  return (
    <>
      <Seo
        title={`${product.title} — ${t('shop.title')}`}
        description={product.summary.length > 0 ? product.summary : t('shop.metaDescription')}
        path={productPath(product.slug)}
        jsonLd={[jsonLd]}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={product.title} description={product.summary} />

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            {product.description.length > 0 ? (
              <Card>
                <MarkdownView markdown={product.description} />
              </Card>
            ) : null}

            <section className="mt-6" aria-labelledby="reviews">
              <h2 id="reviews" className="text-lg font-semibold">
                {t('shop.reviews')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('shop.reviewsHint')}</p>

              {detail.reviews.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t('shop.noReviews')}</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {detail.reviews.map((review) => (
                    <Card as="li" key={review.id}>
                      <p className="flex items-center gap-1 text-sm font-semibold">
                        {Array.from({ length: review.rating }, (_, index) => (
                          <Star key={index} size={13} className="fill-current text-green-700" />
                        ))}
                        <span className="fab-sr-only">
                          {t('shop.ratingOf', { rating: review.rating })}
                        </span>
                        <Badge tone="green">{t('shop.verifiedPurchase')}</Badge>
                      </p>
                      {review.body.length > 0 ? (
                        <p className="mt-1 text-sm">{review.body}</p>
                      ) : null}
                      <p className="mt-1 text-2xs text-muted">
                        {formatAbsoluteDate(new Date(review.created_at), language)}
                      </p>
                    </Card>
                  ))}
                </ul>
              )}

              {isSignedIn ? (
                <Card className="mt-3">
                  <h3 className="text-sm font-semibold">{t('shop.writeReview')}</h3>
                  <div className="mt-2 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Button
                        key={value}
                        variant="ghost"
                        size="sm"
                        aria-pressed={rating === value}
                        onClick={() => {
                          setRating(value);
                        }}
                      >
                        <Star
                          size={16}
                          className={value <= rating ? 'fill-current text-green-700' : undefined}
                        />
                        <span className="fab-sr-only">{t('shop.ratingOf', { rating: value })}</span>
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <TextareaField
                      label={t('shop.reviewBody')}
                      rows={3}
                      value={reviewBody}
                      maxLength={4000}
                      counterMax={4000}
                      onChange={(event) => {
                        setReviewBody(event.target.value);
                      }}
                    />
                  </div>
                  <Button
                    className="mt-3"
                    disabled={detail.isReviewing}
                    onClick={() => {
                      void sendReview();
                    }}
                  >
                    {t('shop.submitReview')}
                  </Button>
                </Card>
              ) : null}
            </section>
          </div>

          <aside>
            <Card>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold">
                  {formatMoney(product.price, product.currency, language)}
                </span>
                {product.price_original !== null && saving !== null ? (
                  <>
                    <span className="text-sm text-muted line-through">
                      {formatMoney(product.price_original, product.currency, language)}
                    </span>
                    <Badge tone="green">{t('shop.saving', { percent: saving })}</Badge>
                  </>
                ) : null}
              </p>

              <p className="mt-2 text-xs text-muted">
                {available
                  ? product.is_digital
                    ? t('shop.digital')
                    : t('shop.inStock', { total: formatNumber(product.stock, language) })
                  : t('shop.outOfStock')}
              </p>

              {average !== null ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Star size={12} aria-hidden="true" />
                  {formatNumber(average, language)} ·{' '}
                  {t('shop.reviewCount', { total: formatNumber(product.rating_count, language) })}
                </p>
              ) : null}

              {detail.shop !== null ? (
                <p className="mt-2 text-xs text-muted">
                  {t('shop.soldBy', { shop: detail.shop.name })}
                </p>
              ) : null}

              {available ? (
                <>
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={quantity <= 1}
                      onClick={() => {
                        setQuantity((value) => Math.max(1, value - 1));
                      }}
                    >
                      <Minus size={14} />
                      <span className="fab-sr-only">{t('shop.decrease')}</span>
                    </Button>
                    <span className="min-w-8 text-center text-sm font-semibold">
                      {formatNumber(quantity, language)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={quantity >= ceiling}
                      onClick={() => {
                        setQuantity((value) => Math.min(ceiling, value + 1));
                      }}
                    >
                      <Plus size={14} />
                      <span className="fab-sr-only">{t('shop.increase')}</span>
                    </Button>
                  </div>
                  <p className="mt-1 text-2xs text-muted">
                    {t('shop.maxPerOrder', { total: ceiling })}
                  </p>

                  {isSignedIn ? (
                    <Button
                      className="mt-3 w-full"
                      disabled={detail.isAdding}
                      onClick={() => {
                        void add();
                      }}
                    >
                      <ShoppingCart size={16} />
                      {t('shop.addToCart')}
                    </Button>
                  ) : (
                    <p className="mt-3 text-sm text-muted">{t('shop.signInToBuy')}</p>
                  )}
                </>
              ) : null}
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
