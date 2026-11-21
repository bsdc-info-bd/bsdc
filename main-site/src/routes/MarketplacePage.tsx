import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MediaImage } from '@/components/media/MediaImage';
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
import {
  formatHhMm,
  formatTaka,
  isBdPoint,
  SHOP_TYPES,
  type DayKey,
  type Language,
  type ShopType,
} from '@/lib/mk/mk-logic';
import type { MkListedShop } from '@/lib/mk/mk-types';
import { ROUTES } from '@/lib/site';
import { ShopTypeIcon } from '@/components/mk/ShopTypeIcon';

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
      <Seo
        title={copy.buyer.marketTitle}
        description={copy.buyer.marketLead}
        path={ROUTES.market}
      />
      <MarketNav copy={copy} />

      <header className="relative mb-6 overflow-hidden rounded-3xl bsdc-hero p-6 shadow-lg sm:p-8">
        {/* A compositor animation rather than a motion one: this runs for as
            long as the page is open, and a library-driven loop kept the main
            thread awake for a decorative circle. */}
        <div
          aria-hidden
          className="mk-glow pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-on-hero/10"
        />
        <h1 className="relative text-2xl font-bold sm:text-3xl">{copy.buyer.marketTitle}</h1>
        <p className="relative mt-2 max-w-xl text-sm text-on-hero/90">{copy.buyer.marketLead}</p>
        <div className="relative mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.buyer.searchShops}
              aria-label={copy.buyer.searchShops}
              className="w-full rounded-xl border border-on-hero/20 bg-bg px-10 py-2.5 text-sm text-text shadow-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-on-hero/60"
            />
          </div>
          <button
            type="button"
            onClick={locate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-on-hero/15 px-4 py-2.5 text-sm font-semibold backdrop-blur hover:bg-on-hero/25"
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
            <Link
              to={ROUTES.marketOrders}
              className="block rounded-2xl border border-primary/30 bg-primary/5 p-4 transition hover:bg-primary/10"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text">
                  {copy.buyer.activeOrders}: {active.length}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                  {copy.buyer.trackOrder} <ArrowRight size={12} aria-hidden />
                </span>
              </div>
              <OrderTimeline status={active[0]?.status ?? 'placed'} copy={copy} />
            </Link>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <div
        role="radiogroup"
        aria-label={copy.typeLabels.other}
        className="mb-6 flex gap-2 overflow-x-auto pb-1"
      >
        <TypeChip
          label={copy.buyer.allTypes}
          selected={type === null}
          onClick={() => setType(null)}
        />
        {SHOP_TYPES.map((t) => (
          <TypeChip
            key={t}
            label={copy.typeLabels[t]}
            icon={<ShopTypeIcon type={t} size={14} />}
            selected={type === t}
            onClick={() => setType(t)}
          />
        ))}
      </div>

      {shops.isLoading ? <PageSkeleton label={copy.loading} /> : null}

      {!shops.isLoading && (shops.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Store size={28} />}
          title={copy.buyer.marketTitle}
          description={copy.buyer.noShops}
        />
      ) : null}

      {/* No `layout` here: it makes the browser measure every card on every
          render to animate positions that never change, and that measurement
          is main-thread work on the first screen. */}
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(shops.data ?? []).map((shop, i) => (
          <ShopCard key={shop.slug} shop={shop} index={i} copy={copy} language={language} />
        ))}
      </ul>
    </div>
  );
}

function TypeChip({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? 'border-primary bg-primary text-on-primary shadow-sm'
          : 'border-border bg-surface text-text hover:bg-surface-2'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
  );
}

function ShopCard({
  shop,
  index,
  copy,
  language,
}: {
  shop: MkListedShop;
  index: number;
  copy: ReturnType<typeof mkCopy>;
  language: Language;
}) {
  const reduce = useReducedMotion() ?? false;
  const sched = shop.schedule;
  const isOpen = sched ? sched.is_open : true;
  const nextOpenLabel =
    sched && !sched.is_open && sched.next_open
      ? copy.schedule.opensNextLabel(
          copy.schedule.days[String(sched.next_open.day) as DayKey] ?? '',
          formatHhMm(sched.next_open.start, language),
        )
      : copy.schedule.closedNow;
  const deliveryBadge =
    shop.delivery?.fee_mode === 'per_km'
      ? copy.delivery.perKmBadge(formatTaka(shop.delivery.per_km_rate_poisha ?? 2000, language))
      : shop.delivery
        ? formatTaka(shop.delivery.fee_poisha, language)
        : null;

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.03, duration: 0.25 }}
    >
      <Link
        to={`/marketplace/shop/${shop.slug}`}
        className="group block overflow-hidden rounded-3xl border border-border bg-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
      >
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-hero-from/80 to-hero-via/60">
          {shop.cover_url ? (
            <img
              src={shop.cover_url}
              alt=""
              // The same rule the feed and the other catalogues keep: the cover
              // in the first screen is the largest painted element, so it may not
              // wait for the lazy-load queue. `fetchpriority` is spelled in lower
              // case because React only forwards the attribute it does not own.
              loading={index === 0 ? 'eager' : 'lazy'}
              {...(index === 0 ? { fetchpriority: 'high' } : {})}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : null}
          {sched?.enabled ? (
            <span
              className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur ${
                isOpen ? 'bg-primary text-on-primary' : 'bg-danger text-on-danger'
              }`}
            >
              {isOpen ? copy.schedule.openNow : nextOpenLabel}
            </span>
          ) : null}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-scrim/50 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            <ShopTypeIcon type={shop.vendor_type} size={12} />
            {copy.typeLabels[shop.vendor_type]}
          </span>
        </div>
        <div className="-mt-8 px-4 pb-4">
          <div className="flex items-end gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-4 border-surface bg-surface-2 shadow-md">
              {shop.logo_url ? (
                <MediaImage
                  src={shop.logo_url}
                  alt=""
                  slotWidth={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Store className="m-4 text-muted" aria-hidden />
              )}
            </div>
            <div className="min-w-0 pb-1">
              <p className="truncate font-bold text-text">{shop.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted">
                <MapPin size={12} aria-hidden />
                {shop.place_label}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Star size={12} className="fill-rating text-rating" aria-hidden />
              {shop.rating.toFixed(1)} · {shop.review_count} {copy.buyer.reviews}
            </span>
            {shop.distance_km !== null ? (
              <span className="font-semibold text-green-700">
                {shop.distance_km.toFixed(1)} {copy.buyer.kmAway}
              </span>
            ) : deliveryBadge ? (
              <span className="font-medium text-muted">
                {copy.buyer.deliveryFee}: {deliveryBadge}
              </span>
            ) : (
              <span>
                {shop.product_count} {copy.buyer.products}
              </span>
            )}
          </div>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-green-700">
            {copy.buyer.products}{' '}
            <ArrowRight size={14} aria-hidden className="transition group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </motion.li>
  );
}
