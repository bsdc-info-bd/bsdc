import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, LocateFixed, MapPin, Search, Star, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { OrderTimeline } from '@/components/mk/customer/OrderTimeline';
import { EmptyState, PageSkeleton } from '@/design-system';
import { useListedShops, useMyOrders } from '@/hooks/use-mk';
import { mkCopy } from '@/lib/mk/mk-copy';
import { isBdPoint, SHOP_TYPE_EMOJI, SHOP_TYPES, type Language, type ShopType } from '@/lib/mk/mk-logic';
import type { MkListedShop } from '@/lib/mk/mk-types';
import { ROUTES } from '@/lib/site';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export default function MarketplacePage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const reduce = useReducedMotion() ?? false;

  const [query, setQuery] = useState('');
  const [type, setType] = useState<ShopType | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const debounced = useDebounced(query, 300);
  const shops = useListedShops(type, debounced, origin);
  const orders = useMyOrders();

  const active = useMemo(
    () => (orders.data ?? []).filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders.data],
  );

  function locate(): void {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (isBdPoint(next.lat, next.lng)) setOrigin(next);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="fab-container max-w-6xl py-6 sm:py-8">
      <Seo title={copy.buyer.marketTitle} description={copy.buyer.marketLead} path={ROUTES.market} />
      <MarketNav copy={copy} />

      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-green-800 via-green-700 to-green-500 p-6 text-white shadow-lg sm:p-8">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10"
          animate={reduce ? {} : { scale: [1, 1.08, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <h1 className="relative text-2xl font-bold sm:text-3xl">{copy.buyer.marketTitle}</h1>
        <p className="relative mt-2 max-w-xl text-sm text-white/90">{copy.buyer.marketLead}</p>
        <div className="relative mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.buyer.searchShops}
              aria-label={copy.buyer.searchShops}
              className="w-full rounded-xl border border-white/20 bg-white px-10 py-2.5 text-sm text-text shadow-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white/60"
            />
          </div>
          <button
            type="button"
            onClick={locate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/25"
          >
            <LocateFixed size={16} aria-hidden />
            {copy.buyer.useCurrent}
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {active.length > 0 ? (
          <motion.section
            key="tracker"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? {} : { opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
            aria-label={copy.buyer.activeOrders}
          >
            <Link to={ROUTES.marketOrders} className="block rounded-2xl border border-green-600/30 bg-green-600/5 p-4 transition hover:bg-green-600/10">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text">{copy.buyer.activeOrders}: {active.length}</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">{copy.buyer.trackOrder} <ArrowRight size={12} aria-hidden /></span>
              </div>
              <OrderTimeline status={active[0]?.status ?? 'placed'} copy={copy} />
            </Link>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <div role="radiogroup" aria-label={copy.typeLabels.other} className="mb-6 flex gap-2 overflow-x-auto pb-1">
        <TypeChip label={copy.buyer.allTypes} selected={type === null} onClick={() => setType(null)} />
        {SHOP_TYPES.map((t) => (
          <TypeChip key={t} label={`${SHOP_TYPE_EMOJI[t]} ${copy.typeLabels[t]}`} selected={type === t} onClick={() => setType(t)} />
        ))}
      </div>

      {shops.isLoading ? <PageSkeleton label={copy.loading} /> : null}

      {!shops.isLoading && (shops.data ?? []).length === 0 ? (
        <EmptyState icon={<Store size={28} />} title={copy.buyer.marketTitle} description={copy.buyer.noShops} />
      ) : null}

      <motion.ul layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(shops.data ?? []).map((shop, i) => (
          <ShopCard key={shop.slug} shop={shop} index={i} copy={copy} />
        ))}
      </motion.ul>
    </div>
  );
}

function TypeChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected ? 'border-green-700 bg-green-700 text-white shadow-sm' : 'border-border bg-surface text-text hover:bg-surface-2'
      }`}
    >
      {label}
    </button>
  );
}

function ShopCard({ shop, index, copy }: { shop: MkListedShop; index: number; copy: ReturnType<typeof mkCopy> }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.li
      layout
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 9) * 0.04, duration: 0.3 }}
    >
      <Link
        to={`/marketplace/shop/${shop.slug}`}
        className="group block overflow-hidden rounded-3xl border border-border bg-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
      >
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-green-700/80 to-green-400/60">
          {shop.cover_url ? <img src={shop.cover_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : null}
          <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            {SHOP_TYPE_EMOJI[shop.vendor_type]} {copy.typeLabels[shop.vendor_type]}
          </span>
        </div>
        <div className="-mt-8 px-4 pb-4">
          <div className="flex items-end gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-4 border-surface bg-surface-2 shadow-md">
              {shop.logo_url ? <img src={shop.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="m-4 text-muted" aria-hidden />}
            </div>
            <div className="min-w-0 pb-1">
              <p className="truncate font-bold text-text">{shop.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin size={12} aria-hidden />{shop.place_label}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span className="inline-flex items-center gap-1"><Star size={12} className="fill-amber-400 text-amber-400" aria-hidden />{shop.rating.toFixed(1)} · {shop.review_count} {copy.buyer.reviews}</span>
            {shop.distance_km !== null ? <span className="font-semibold text-green-700">{shop.distance_km.toFixed(1)} {copy.buyer.kmAway}</span> : <span>{shop.product_count} {copy.buyer.products}</span>}
          </div>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-green-700">
            {copy.buyer.products} <ArrowRight size={14} aria-hidden className="transition group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </motion.li>
  );
}

