import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, MapPin, ShoppingBag, Star, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { ProductCard } from '@/components/mk/customer/ProductCard';
import { EmptyState, PageSkeleton } from '@/design-system';
import { useMyCart, useSetCartQty, useVendorPage } from '@/hooks/use-mk';
import { mkCopy } from '@/lib/mk/mk-copy';
import { formatTaka, SHOP_TYPE_EMOJI, type Language } from '@/lib/mk/mk-logic';
import { ROUTES } from '@/lib/site';

export default function MarketShopPage() {
  const { slug = '' } = useParams();
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const reduce = useReducedMotion() ?? false;
  const page = useVendorPage(slug);
  const cart = useMyCart();
  const setQty = useSetCartQty();
  const [category, setCategory] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart.data ?? []) map.set(line.product_id, line.qty);
    return map;
  }, [cart.data]);

  const shopLines = (cart.data ?? []).filter((line) => line.vendor_slug === slug);
  const shopCount = shopLines.reduce((sum, line) => sum + line.qty, 0);
  const shopTotal = shopLines.reduce((sum, line) => sum + line.line_total, 0);

  if (page.isLoading) return <PageSkeleton label={copy.loading} />;
  const data = page.data;
  if (!data) {
    return (
      <div className="fab-container max-w-3xl py-12">
        <EmptyState icon={<Store size={28} />} title={copy.buyer.marketTitle} description={copy.buyer.noShops} action={<Link className="font-semibold text-green-700" to={ROUTES.market}>{copy.buyer.marketTitle}</Link>} />
      </div>
    );
  }

  const products = data.products.filter((p) => category === null || p.category_id === category);

  async function changeQty(productId: string, next: number): Promise<void> {
    setBusyId(productId);
    try {
      await setQty.mutateAsync({ productId, qty: next });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fab-container max-w-6xl space-y-6 pb-28 pt-6 sm:pt-8">
      <Seo title={data.vendor.name} description={data.vendor.description || copy.buyer.marketLead} path={`/marketplace/shop/${slug}`} />
      <MarketNav copy={copy} />

      <header className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="relative h-44 bg-gradient-to-br from-green-800 to-green-500 sm:h-60">
          {data.vendor.cover_url ? <motion.img initial={reduce ? false : { scale: 1.06 }} animate={{ scale: 1 }} transition={{ duration: 1.2 }} src={data.vendor.cover_url} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:gap-5">
          <div className="-mt-14 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-surface bg-surface-2 shadow-lg">
            {data.vendor.logo_url ? <img src={data.vendor.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="m-6 text-muted" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-text sm:text-3xl">{data.vendor.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{SHOP_TYPE_EMOJI[data.vendor.vendor_type]} {copy.typeLabels[data.vendor.vendor_type]}</span>
              <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden />{data.vendor.place_label}</span>
              <span className="inline-flex items-center gap-1"><Star size={14} className="fill-amber-400 text-amber-400" aria-hidden />{data.rating.toFixed(1)} · {data.review_count} {copy.buyer.reviews}</span>
            </p>
            {data.vendor.description ? <p className="mt-2 max-w-2xl text-sm text-text">{data.vendor.description}</p> : null}
            <p className="mt-2 text-xs font-medium text-green-700">{copy.buyer.deliveryPromise}</p>
          </div>
        </div>
      </header>

      <nav aria-label={copy.buyer.products} className="flex gap-2 overflow-x-auto pb-1">
        <CategoryChip label={copy.buyer.allTypes} selected={category === null} onClick={() => setCategory(null)} />
        {data.categories.map((c) => (
          <CategoryChip key={c.id} label={c.name} selected={category === c.id} onClick={() => setCategory(c.id)} />
        ))}
      </nav>

      {products.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={28} />} title={copy.buyer.products} description={copy.buyer.noShops} />
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            language={language}
            copy={copy}
            index={i}
            inCart={qtyByProduct.get(product.id) ?? 0}
            busy={busyId === product.id}
            onChangeQty={(next) => void changeQty(product.id, next)}
          />
        ))}
      </ul>

      <AnimatePresence>
        {shopCount > 0 ? (
          <motion.div
            key="cartbar"
            initial={reduce ? false : { y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? {} : { y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-green-800 px-4 py-3 text-white shadow-2xl"
          >
            <div className="min-w-0">
              <p className="text-xs text-white/80">{shopCount} × {copy.buyer.inCart}</p>
              <p className="font-bold tabular-nums">{formatTaka(shopTotal, language)}</p>
            </div>
            <Link to={ROUTES.marketCart} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-green-800 transition hover:bg-green-50">
              {copy.buyer.cartTitle} <ArrowRight size={16} aria-hidden />
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CategoryChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
        selected ? 'border-green-700 bg-green-700 text-white' : 'border-border bg-surface hover:bg-surface-2'
      }`}
    >
      {label}
    </button>
  );
}
