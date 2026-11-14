import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, ImageOff, ShoppingBag, Star, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { QuantityStepper } from '@/components/mk/customer/QuantityStepper';
import { Button, EmptyState, PageSkeleton } from '@/design-system';
import { useMyCart, useProductDetail, useSetCartQty } from '@/hooks/use-mk';
import { mkCopy } from '@/lib/mk/mk-copy';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';

export default function MarketProductPage() {
  const { id = '' } = useParams();
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const product = useProductDetail(id);
  const cart = useMyCart();
  const setQty = useSetCartQty();
  const [picked, setPicked] = useState(0);
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState(false);

  const inCart = (cart.data ?? []).find((line) => line.product_id === id)?.qty ?? 0;
  const maxQty = Math.max(1, Math.min(product.data?.stock ?? 1, 10));

  useEffect(() => {
    setPicked(0);
    setAdded(false);
  }, [id]);

  useEffect(() => {
    if (picked === 0 && product.data) setPicked(1);
  }, [product.data, picked]);

  if (product.isLoading) return <PageSkeleton label={copy.loading} />;
  const data = product.data;
  if (!data) {
    return (
      <div className="fab-container max-w-3xl py-12">
        <EmptyState icon={<ShoppingBag size={28} />} title={copy.buyer.products} description={copy.buyer.noShops} />
      </div>
    );
  }

  const images = data.images.filter(Boolean);
  const shopSlug = data.vendor.slug;

  async function addToCart(): Promise<void> {
    try {
      await setQty.mutateAsync({ productId: id, qty: inCart + picked });
      setAdded(true);
      toast.success(copy.buyer.inCart);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  function buyNow(): void {
    const params = new URLSearchParams({ product: id, qty: String(picked) });
    navigate(`/marketplace/checkout/${shopSlug}?${params.toString()}`);
  }

  return (
    <div className="fab-container max-w-5xl space-y-6 py-6 sm:py-8">
      <Seo title={data.name} description={data.description.slice(0, 150)} path={`/marketplace/product/${id}`} />
      <MarketNav copy={copy} />
      <Link to={`/marketplace/shop/${shopSlug}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> {data.vendor.name}
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label={data.name} className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-surface-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={images[active] ?? 'none'}
                src={images[active]}
                alt={data.name}
                initial={reduce ? false : { opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? {} : { opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </AnimatePresence>
            {images.length === 0 ? <span className="grid h-full place-items-center text-muted"><ImageOff size={40} aria-hidden /></span> : null}
          </div>
          {images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`${i + 1}`}
                  aria-pressed={active === i}
                  onClick={() => setActive(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${active === i ? 'border-green-700' : 'border-transparent'}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-text sm:text-3xl">{data.name}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden />{data.rating.toFixed(1)}
            </p>
          </div>
          <p className="text-3xl font-extrabold text-green-700 tabular-nums">{formatTaka(data.price_poisha, language)}</p>

          <p className={`text-sm font-semibold ${data.in_stock ? 'text-green-700' : 'text-red-600'}`}>
            {data.in_stock ? `${data.stock} ${copy.buyer.stockLeft}` : copy.buyer.outOfStock}
          </p>

          {data.in_stock ? (
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-text">{copy.buyer.qty}</span>
                <QuantityStepper value={picked} min={1} max={maxQty} onChange={setPicked} label={copy.buyer.qty} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="secondary" className="flex-1" loading={setQty.isPending} iconStart={added ? <Check size={16} /> : <ShoppingBag size={16} />} onClick={() => void addToCart()}>
                  {added ? copy.buyer.inCart : copy.buyer.addToCart}
                </Button>
                <Button type="button" className="flex-1" iconStart={<Zap size={16} />} onClick={buyNow}>
                  {copy.buyer.buyNow}
                </Button>
              </div>
              {inCart > 0 ? <p className="text-xs text-muted">{copy.buyer.inCart}: {inCart}</p> : null}
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-text">{copy.buyer.description}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{data.description || '—'}</p>
          </div>
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">{copy.buyer.codNote}</p>
        </section>
      </div>
    </div>
  );
}
