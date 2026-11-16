import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ShoppingBag, Trash2, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { QuantityStepper } from '@/components/mk/customer/QuantityStepper';
import { Button, Card, EmptyState, PageSkeleton } from '@/design-system';
import { usePaymentInstructions, useMyCart, useSetCartQty } from '@/hooks/use-mk';
import { mkCopy } from '@/lib/mk/mk-copy';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';
import type { MkCartLine } from '@/lib/mk/mk-types';
import { ROUTES } from '@/lib/site';

export default function MarketCartPage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const reduce = useReducedMotion() ?? false;
  const cart = useMyCart();
  const setQty = useSetCartQty();
  const payment = usePaymentInstructions();
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();

  const groups = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; lines: MkCartLine[] }>();
    for (const line of cart.data ?? []) {
      const group = map.get(line.vendor_slug) ?? {
        slug: line.vendor_slug,
        name: line.vendor_name,
        lines: [],
      };
      group.lines.push(line);
      map.set(line.vendor_slug, group);
    }
    return [...map.values()];
  }, [cart.data]);

  if (cart.isLoading) return <PageSkeleton label={copy.loading} />;

  async function change(productId: string, next: number): Promise<void> {
    setBusy(productId);
    try {
      await setQty.mutateAsync({ productId, qty: next });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    } finally {
      setBusy(null);
    }
  }

  const fee = payment.data?.delivery_fee_poisha ?? 0;

  return (
    <div className="fab-container max-w-4xl space-y-6 py-6 sm:py-8">
      <Seo
        title={copy.buyer.cartTitle}
        description={copy.buyer.cartEmpty}
        path={ROUTES.marketCart}
        noindex
      />
      <MarketNav copy={copy} />
      <h1 className="text-2xl font-bold text-text">{copy.buyer.cartTitle}</h1>

      {groups.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={28} />}
          title={copy.buyer.cartTitle}
          description={copy.buyer.cartEmpty}
          action={
            <Link to={ROUTES.market} className="font-semibold text-green-700">
              {copy.buyer.marketTitle} →
            </Link>
          }
        />
      ) : null}

      <AnimatePresence initial={false}>
        {groups.map((group) => {
          const subtotal = group.lines.reduce(
            (sum, line) => sum + (line.orderable ? line.line_total : 0),
            0,
          );
          const orderable = group.lines.some((line) => line.orderable);
          return (
            <motion.div
              key={group.slug}
              layout
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? {} : { opacity: 0, scale: 0.98 }}
            >
              <Card padded className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/marketplace/shop/${group.slug}`}
                    className="inline-flex min-w-0 items-center gap-2 font-semibold text-text hover:underline"
                  >
                    <Store size={16} aria-hidden />
                    <span className="truncate">{group.name}</span>
                  </Link>
                  <span className="text-xs text-muted">{copy.buyer.deliveryPromise}</span>
                </div>

                <ul className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {group.lines.map((line) => (
                      <motion.li
                        key={line.product_id}
                        layout
                        initial={reduce ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reduce ? {} : { opacity: 0, x: 24 }}
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                          {line.image_url ? (
                            <img
                              src={line.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/marketplace/product/${line.product_id}`}
                            className="block truncate text-sm font-semibold text-text hover:underline"
                          >
                            {line.product_name}
                          </Link>
                          <p className="text-xs text-muted">
                            {formatTaka(line.price_poisha, language)}
                          </p>
                          {!line.orderable ? (
                            <p className="text-xs font-semibold text-red-600">
                              {copy.buyer.outOfStock}
                            </p>
                          ) : null}
                        </div>
                        <QuantityStepper
                          value={line.qty}
                          min={0}
                          max={Math.max(1, Math.min(line.stock, 50))}
                          onChange={(n) => void change(line.product_id, n)}
                          label={line.product_name}
                          disabled={busy === line.product_id}
                        />
                        <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums">
                          {formatTaka(line.line_total, language)}
                        </span>
                        <button
                          type="button"
                          aria-label={`${copy.cancel} ${line.product_name}`}
                          onClick={() => void change(line.product_id, 0)}
                          className="rounded-lg p-2 text-muted hover:bg-red-500/10 hover:text-red-600"
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                <dl className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">{copy.buyer.subtotal}</dt>
                    <dd className="tabular-nums">{formatTaka(subtotal, language)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">{copy.buyer.deliveryFee}</dt>
                    <dd className="tabular-nums">{formatTaka(fee, language)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-bold">
                    <dt>{copy.buyer.total}</dt>
                    <dd className="tabular-nums">{formatTaka(subtotal + fee, language)}</dd>
                  </div>
                </dl>

                <Button
                  type="button"
                  className="w-full"
                  disabled={!orderable}
                  iconEnd={<ArrowRight size={16} />}
                  onClick={() => navigate(`/marketplace/checkout/${group.slug}`)}
                >
                  {copy.buyer.checkout}
                </Button>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
