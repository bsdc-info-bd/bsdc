import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Clock3,
  CreditCard,
  Package,
  Star,
  Store,
  XCircle,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { CatalogPanel } from '@/components/mk/vendor/CatalogPanel';
import { OrdersPanel } from '@/components/mk/vendor/OrdersPanel';
import { CreditsPanel, ShopProfilePanel } from '@/components/mk/vendor/ShopPanels';
import { Alert, Button, Card, EmptyState, PageSkeleton, StatCard } from '@/design-system';
import { useMyApplication, useVendorDashboard } from '@/hooks/use-mk';
import { useAuthStore } from '@/store/auth-store';
import { creditState, formatTaka, type Language } from '@/lib/mk/mk-logic';
import { mkCopy } from '@/lib/mk/mk-copy';
import { ROUTES } from '@/lib/site';

type Tab = 'orders' | 'products' | 'shop' | 'credits';
const TABS: readonly Tab[] = ['orders', 'products', 'shop', 'credits'];

export default function VendorConsolePage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const dashboard = useVendorDashboard();
  const application = useMyApplication();
  const reduceMotion = useReducedMotion() ?? false;
  const [tab, setTab] = useState<Tab>('orders');

  if (uid === null) {
    return (
      <div className="fab-container max-w-2xl py-12">
        <EmptyState
          icon={<Store size={28} />}
          title={copy.consoleTitle}
          description={copy.noShop}
          action={
            <Button onClick={() => (window.location.href = ROUTES.login)}>{copy.openApply}</Button>
          }
        />
      </div>
    );
  }

  if (dashboard.isLoading || application.isLoading) {
    return <PageSkeleton label={copy.loading} />;
  }

  const data = dashboard.data;
  const pending = application.data;
  if (!data?.has_shop || !data.vendor) {
    return (
      <div className="fab-container max-w-2xl py-12">
        <Seo
          title={copy.consoleTitle}
          description={copy.applyLead}
          path={ROUTES.vendorConsole}
          noindex
        />
        {pending?.status === 'submitted' ? (
          <Card padded className="text-center">
            <Clock3 className="mx-auto mb-3 text-blue" size={32} aria-hidden />
            <h1 className="text-xl font-semibold">{copy.underReview}</h1>
            <p className="mt-2 text-sm text-muted">{copy.submittedBody}</p>
          </Card>
        ) : (
          <EmptyState
            icon={<Store size={28} />}
            title={copy.noShop}
            description={copy.applyLead}
            action={
              <a
                href={ROUTES.vendorApply}
                className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
              >
                {copy.openApply} <ArrowRight size={16} aria-hidden />
              </a>
            }
          />
        )}
      </div>
    );
  }

  const shop = data.vendor;
  const credits = data.credits ?? 0;
  const state = creditState(credits);
  const listed = data.listed === true;

  return (
    <div className="fab-container max-w-6xl space-y-6 py-6 sm:py-8">
      <Seo
        title={copy.consoleTitle}
        description={copy.applyLead}
        path={ROUTES.vendorConsole}
        noindex
      />

      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-green-800 via-green-700 to-green-500 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/70">{copy.consoleTitle}</p>
            <h1 className="truncate text-2xl font-bold sm:text-3xl">{shop.name}</h1>
            <p className="mt-1 text-sm text-white/85">{copy.typeLabels[shop.vendor_type]}</p>
          </div>
          <motion.span
            layout
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${listed ? 'bg-white text-green-800' : 'bg-red-600 text-white'}`}
            animate={reduceMotion ? {} : { scale: [1, 1.04, 1] }}
            transition={{ duration: 0.5 }}
          >
            {listed ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
            {listed ? copy.listed : copy.unlisted}
          </motion.span>
        </div>
      </header>

      {state === 'empty' ? (
        <Alert tone="danger" title={copy.unlisted}>
          <p className="text-sm">{copy.creditsEmptyBody}</p>
          <div className="mt-3">
            <Button
              size="sm"
              onClick={() => setTab('credits')}
              iconStart={<CreditCard size={16} />}
            >
              {copy.buyCredits}
            </Button>
          </div>
        </Alert>
      ) : null}
      {state === 'low' ? (
        <Alert tone="warning" title={copy.creditsLeft}>
          <p className="text-sm">{copy.creditsLowBody}</p>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<ClipboardList size={18} />}
          label={copy.pendingOrders}
          value={String(data.orders_pending ?? 0)}
        />
        <StatCard
          icon={<Package size={18} />}
          label={copy.ordersToday}
          value={String(data.orders_today ?? 0)}
        />
        <StatCard
          icon={<CreditCard size={18} />}
          label={copy.creditsLeft}
          value={String(credits)}
        />
        <StatCard
          icon={<Star size={18} />}
          label={copy.rating}
          value={data.rating ? data.rating.toFixed(1) : '—'}
          hint={
            data.delivered_poisha
              ? `${copy.delivered}: ${formatTaka(data.delivered_poisha, language)}`
              : ''
          }
        />
      </div>

      <nav aria-label={copy.consoleTitle}>
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1">
          {TABS.map((id) => {
            const active = tab === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(id)}
                className="relative shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-muted transition hover:text-text"
              >
                {active && !reduceMotion ? (
                  <motion.span
                    layoutId="vendor-tab"
                    className="absolute inset-0 rounded-xl bg-surface shadow-sm"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                ) : active ? (
                  <span className="absolute inset-0 rounded-xl bg-surface shadow-sm" />
                ) : null}
                <span className={`relative ${active ? 'text-text' : ''}`}>{copy.tabs[id]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? {} : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'orders' ? <OrdersPanel copy={copy} language={language} enabled /> : null}
          {tab === 'products' ? <CatalogPanel copy={copy} language={language} enabled /> : null}
          {tab === 'shop' ? <ShopProfilePanel copy={copy} shop={shop} /> : null}
          {tab === 'credits' ? (
            <CreditsPanel
              copy={copy}
              language={language}
              credits={credits}
              purchases={data.purchases ?? []}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
