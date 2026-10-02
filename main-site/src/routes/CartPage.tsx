import { ShoppingCart, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Button,
  Card,
  Divider,
  EmptyState,
  LinkButton,
  PageSkeleton,
  SectionHeading,
} from '@/design-system';
import { useCart } from '@/hooks/use-market';
import { formatMoney, groupByShop } from '@/lib/market/market-types';
import { formatNumber } from '@/lib/format';
import { productPath, ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** The cart. Quantities are stored server-side, so it follows the member. */
export default function CartPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const cart = useCart();
  const currency = cart.lines[0]?.currency ?? 'BDT';

  async function change(productId: string, quantity: number) {
    try {
      await cart.setQuantity(productId, quantity);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('cart.metaTitle')}
        description={t('cart.metaDescription')}
        path={ROUTES.cart}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading title={t('cart.title')} description={t('cart.description')} />

        {!isSignedIn ? (
          <Alert tone="info" title={t('cart.signInTitle')} className="mt-4">
            <p>{t('cart.signInBody')}</p>
          </Alert>
        ) : null}

        {cart.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {isSignedIn && !cart.isLoading && cart.lines.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<ShoppingCart size={22} />}
              title={t('cart.emptyTitle')}
              description={t('cart.emptyBody')}
            />
          </div>
        ) : null}

        {cart.totals.unavailable.length > 0 ? (
          <Alert tone="warning" title={t('cart.unavailableTitle')} className="mt-4">
            <p>{t('cart.unavailableBody')}</p>
          </Alert>
        ) : null}

        {groupByShop(cart.lines).map((group) => (
          <section key={group.shopId} className="mt-4" aria-labelledby={`shop-${group.shopId}`}>
            <h2 id={`shop-${group.shopId}`} className="text-sm font-semibold">
              {group.shopName}
            </h2>
            <ul className="mt-2 grid gap-2">
              {group.lines.map((line) => (
                <Card as="li" key={line.productId}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <Link to={productPath(line.slug)} className="fab-link">
                          {line.title}
                        </Link>
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {formatMoney(line.unitPrice, line.currency, language)} ×{' '}
                        {formatNumber(line.quantity, language)}
                      </p>
                      {!line.inStock ? (
                        <p className="mt-1 text-xs text-red-700">{t('cart.lineUnavailable')}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted" htmlFor={`qty-${line.productId}`}>
                        {t('cart.quantity')}
                      </label>
                      <input
                        id={`qty-${line.productId}`}
                        type="number"
                        min={1}
                        max={Math.max(line.available, 1)}
                        value={line.quantity}
                        className="h-9 w-20 rounded-lg border border-border bg-bg px-2 text-sm"
                        onChange={(event) => {
                          void change(line.productId, Number.parseInt(event.target.value, 10));
                        }}
                      />
                      <span className="min-w-24 text-end text-sm font-semibold">
                        {formatMoney(line.lineTotal, line.currency, language)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={cart.isUpdating}
                        onClick={() => {
                          void change(line.productId, 0);
                        }}
                      >
                        <Trash2 size={14} />
                        <span className="fab-sr-only">{t('cart.remove')}</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </ul>
          </section>
        ))}

        {cart.lines.length > 0 ? (
          <Card className="mt-6">
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between">
                <dt>{t('cart.subtotal')}</dt>
                <dd>{formatMoney(cart.totals.subtotal, currency, language)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('cart.shipping')}</dt>
                <dd>
                  {cart.totals.shipping === 0
                    ? t('cart.freeShipping')
                    : formatMoney(cart.totals.shipping, currency, language)}
                </dd>
              </div>
            </dl>
            <Divider />
            <div className="flex justify-between text-base font-semibold">
              <span>{t('cart.total')}</span>
              <span>{formatMoney(cart.totals.total, currency, language)}</span>
            </div>
            <p className="mt-1 text-2xs text-muted">{t('cart.totalHint')}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {cart.canCheckout ? (
                <LinkButton to={ROUTES.checkout}>{t('cart.checkout')}</LinkButton>
              ) : (
                <Button disabled>{t('cart.checkout')}</Button>
              )}
              <Button
                variant="ghost"
                disabled={cart.isUpdating}
                onClick={() => {
                  void cart.clear();
                }}
              >
                {t('cart.clear')}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
