import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, MapPin, ShoppingBag, Star, Store, Info, MessageSquare, Navigation, Clock, Truck } from 'lucide-react';
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { MediaImage } from '@/components/media/MediaImage';
import { PageSkeleton, EmptyState } from '@/design-system';
import { VendorInfo } from '@/components/mk/vendor/VendorInfo';
import { VendorReviews } from '@/components/mk/vendor/VendorReviews';
import { useVendorDetails, useVendorPage, useVendorReviews } from '@/hooks/use-mk';
import { mkCopy } from '@/lib/mk/mk-copy';
import { formatTaka, formatHhMm, type Language, type DayKey } from '@/lib/mk/mk-logic';
import { ROUTES } from '@/lib/site';
import { ShopTypeIcon } from '@/components/mk/ShopTypeIcon';

type Tab = 'menu' | 'info' | 'reviews';

export default function MarketVendorDetailsPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const reduce = useReducedMotion() ?? false;

  const [tab, setTab] = useState<Tab>('info');
  const [reviewOffset, setReviewOffset] = useState(0);
  const details = useVendorDetails(slug);
  const page = useVendorPage(slug);
  const reviews = useVendorReviews(slug, 20, reviewOffset);

  const data = details.data;
  const shopPage = page.data;

  if (details.isLoading || page.isLoading) return <PageSkeleton label={copy.loading} />;

  if (!data || !shopPage) {
    return (
      <div className="fab-container max-w-3xl py-12">
        <EmptyState
          icon={<Store size={28} />}
          title={copy.buyer.marketTitle}
          description={copy.buyer.noShops}
          action={
            <Link className="font-semibold text-green-700" to={ROUTES.market}>
              {copy.buyer.marketTitle}
            </Link>
          }
        />
      </div>
    );
  }

  const vendor = data.vendor;
  const delivery = vendor.delivery;
  const schedule = vendor.schedule ?? shopPage.vendor.schedule;
  const isOpen = schedule ? schedule.is_open : true;

  const feeBadge =
    delivery?.fee_mode === 'per_km'
      ? copy.delivery.perKmBadge(formatTaka(delivery.per_km_rate_poisha ?? 2000, language))
      : delivery
        ? formatTaka(delivery.fee_poisha, language)
        : null;

  const scheduleText = schedule?.enabled
    ? isOpen
      ? schedule.closes_at
        ? copy.schedule.closesAtLabel(formatHhMm(schedule.closes_at, language))
        : copy.schedule.openNow
      : schedule.next_open
        ? copy.schedule.opensNextLabel(
            copy.schedule.days[String(schedule.next_open.day) as DayKey] ?? '',
            formatHhMm(schedule.next_open.start, language),
          )
        : copy.schedule.closedNow
    : copy.schedule.open24Hours;

  return (
    <div className="fab-container max-w-6xl pb-10 pt-4 sm:pt-6">
      <Seo title={`${vendor.name} — ${copy.buyer.marketTitle}`} description={vendor.description || copy.buyer.marketLead} path={`/marketplace/vendor/${slug}`} />

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text shadow-sm hover:bg-surface-2"
      >
        <ArrowLeft size={14} aria-hidden />
        {copy.back}
      </button>

      {/* Hero — Foodpanda style: cover + overlapping card */}
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-sm">
        <div className="relative h-44 bg-gradient-to-br from-hero-from to-hero-via sm:h-56">
          {vendor.cover_url ? (
            <motion.img
              initial={reduce ? false : { scale: 1.04 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1 }}
              src={vendor.cover_url}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" aria-hidden />
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between sm:bottom-4 sm:left-5 sm:right-5">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
              <ShopTypeIcon type={vendor.vendor_type} size={12} />
              {copy.typeLabels[vendor.vendor_type]}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur ${isOpen ? 'bg-emerald-500 text-white' : 'bg-danger text-white'}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
              {isOpen ? copy.schedule.openNow : copy.schedule.closedNow}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-end sm:gap-5 sm:px-6">
          <div className="-mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-surface bg-surface-2 shadow-lg sm:-mt-14 sm:h-28 sm:w-28">
            {vendor.logo_url ? (
              <MediaImage src={vendor.logo_url} alt="" slotWidth={112} className="h-full w-full object-cover" />
            ) : (
              <Store className="m-6 text-muted sm:m-8" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-text sm:text-2xl">{vendor.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} aria-hidden />
                {vendor.place_label}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1">
                <Star size={13} className="fill-rating text-rating" aria-hidden />
                {data.rating.toFixed(1)} · {data.review_count} {copy.buyer.reviews}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium">
              {feeBadge ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-text">
                  <Truck size={11} aria-hidden />
                  {copy.buyer.deliveryFee}: {feeBadge}
                </span>
              ) : null}
              {(delivery?.min_order_poisha ?? 0) > 0 ? (
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text">
                  {copy.buyer.minOrder}: {formatTaka(delivery?.min_order_poisha ?? 0, language)}
                </span>
              ) : null}
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${isOpen ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-danger-soft text-danger-text'}`}>
                <Clock size={11} aria-hidden />
                {scheduleText}
              </span>
            </div>
          </div>
          <Link
            to={`/marketplace/shop/${slug}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary-active"
          >
            <ShoppingBag size={16} aria-hidden />
            {copy.buyer.products}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[56px] z-20 -mx-4 mt-6 border-b border-border bg-bg/85 px-4 backdrop-blur sm:mx-0 sm:px-0">
        <div role="tablist" className="flex gap-1 overflow-x-auto py-2">
          {(
            [
              { id: 'info' as Tab, label: language === 'bn' ? 'তথ্য' : 'Info', icon: Info, count: null as number | null },
              { id: 'reviews' as Tab, label: language === 'bn' ? 'রিভিউ' : 'Reviews', count: data.review_count, icon: MessageSquare },
              { id: 'menu' as Tab, label: copy.buyer.products, count: shopPage.products.length, icon: ShoppingBag },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            const c = (t as { count: number | null }).count;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface border border-border text-text hover:bg-surface-2'}`}
              >
                <Icon size={14} aria-hidden />
                {t.label}
                {typeof c === 'number' ? (
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold ${active ? 'bg-on-primary text-primary' : 'bg-surface-2 text-muted'}`}>{c}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? {} : { opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mt-6"
        >
          {tab === 'info' ? <VendorInfo details={data} language={language} /> : null}
          {tab === 'reviews' ? (
            <VendorReviews
              rating={reviews.data?.rating ?? data.rating}
              reviewCount={reviews.data?.review_count ?? data.review_count}
              reviews={reviews.data?.reviews ?? data.recent_reviews ?? []}
              language={language}
              loading={reviews.isLoading}
              hasMore={(reviews.data?.reviews?.length ?? 0) >= 20}
              onLoadMore={() => setReviewOffset((o) => o + 20)}
            />
          ) : null}
          {tab === 'menu' ? (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-sm text-muted">{language === 'bn' ? 'মেনু দেখতে দোকানের পাতায় যান।' : 'Browse the full menu on the shop page.'}</p>
              <Link
                to={`/marketplace/shop/${slug}`}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-active"
              >
                <Navigation size={16} aria-hidden />
                {language === 'bn' ? 'মেনু খুলুন' : 'Open menu'}
              </Link>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
