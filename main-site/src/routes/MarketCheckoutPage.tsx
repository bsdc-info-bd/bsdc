import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  MapPin,
  Phone,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { LocationPicker, type PinnedLocation } from '@/components/mk/LocationPicker';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { Button, EmptyState, PageSkeleton, TextField, TextareaField } from '@/design-system';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';
import { ROUTES } from '@/lib/site';
import {
  useMyCart,
  usePaymentInstructions,
  usePlaceOrder,
  useProductDetail,
  useVendorPage,
} from '@/hooks/use-mk';
import * as repo from '@/lib/mk/mk-repository';
import { mkCopy } from '@/lib/mk/mk-copy';
import {
  evaluateShopDelivery,
  formatTaka,
  isBdMobile,
  normaliseBdMobile,
  type Language,
} from '@/lib/mk/mk-logic';
import type { MkAddress, MkPlacedOrder } from '@/lib/mk/mk-types';

interface Draft {
  name: string;
  phone: string;
  address: string;
  landmark: string;
  note: string;
  pin: PinnedLocation | null;
}

const EMPTY: Draft = { name: '', phone: '', address: '', landmark: '', note: '', pin: null };

export default function MarketCheckoutPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const directProduct = params.get('product') ?? '';
  const directQty = Math.min(50, Math.max(1, Number(params.get('qty') ?? '1') || 1));
  const isDirect = directProduct !== '';

  const vendorRef = useQuery({
    queryKey: ['mk', 'vendor-ref', slug],
    queryFn: () => repo.fetchVendorRef(slug),
    enabled: slug !== '',
  });

  const shop = useVendorPage(slug);
  const product = useProductDetail(isDirect ? directProduct : '');
  const cart = useMyCart();
  const payment = usePaymentInstructions();
  const place = usePlaceOrder();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [placed, setPlaced] = useState<MkPlacedOrder | null>(null);

  const lines = useMemo(() => {
    if (isDirect) {
      const p = product.data;
      if (!p) return [];
      return [
        {
          key: p.id,
          name: p.name,
          qty: directQty,
          unit: p.price_poisha,
          total: p.price_poisha * directQty,
        },
      ];
    }
    return (cart.data ?? [])
      .filter((line) => line.vendor_slug === slug && line.orderable)
      .map((line) => ({
        key: line.product_id,
        name: line.product_name,
        qty: line.qty,
        unit: line.price_poisha,
        total: line.line_total,
      }));
  }, [isDirect, product.data, directQty, cart.data, slug]);

  const shell = (children: ReactNode) => (
    <div className="fab-container max-w-5xl space-y-6 py-6 sm:py-8">
      <Seo
        title={copy.buyer.checkoutTitle}
        description={copy.buyer.codNote}
        path={`/marketplace/checkout/${slug}`}
        noindex
      />
      <MarketNav copy={copy} />
      {children}
    </div>
  );

  if (uid === null) {
    return shell(
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-10">
        <EmptyState
          icon={<Banknote size={28} />}
          title={copy.buyer.checkoutTitle}
          description={copy.buyer.cartEmpty}
          action={
            <Link
              to={ROUTES.login}
              className="inline-flex items-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-green-800"
            >
              {copy.buyer.signIn}
            </Link>
          }
        />
      </div>,
    );
  }

  if (
    vendorRef.isLoading ||
    shop.isLoading ||
    payment.isLoading ||
    (isDirect && product.isLoading) ||
    cart.isLoading
  ) {
    return shell(<PageSkeleton label={copy.loading} />);
  }

  const vendorId = vendorRef.data ?? null;
  if (vendorId === null) {
    return shell(
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-10">
        <EmptyState
          icon={<Store size={28} />}
          title={copy.buyer.marketTitle}
          description={copy.buyer.noShops}
          action={
            <Link
              to="/marketplace"
              className="inline-flex items-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-green-800"
            >
              {copy.buyer.marketTitle} →
            </Link>
          }
        />
      </div>,
    );
  }

  // Evaluate 3-mode delivery charge (`default`, `fixed`, `per_km`), radius eligibility,
  // and live Dhaka opening schedule identically to `mk_place_order` on the server.
  const deliveryConfig = shop.data?.vendor.delivery;
  const deliveryEval = evaluateShopDelivery(
    deliveryConfig,
    draft.pin ? { lat: draft.pin.lat, lng: draft.pin.lng } : null,
  );
  const fee = deliveryEval.feePoisha;
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const total = subtotal + fee;
  const shopName = shop.data?.vendor.name ?? '';
  const shopSchedule = shop.data?.vendor.schedule;
  const shopOpen = shopSchedule ? shopSchedule.is_open : true;

  const errors = {
    name: draft.name.trim().length < 2,
    phone: !isBdMobile(draft.phone),
    address: draft.address.trim().length < 5,
    pin: draft.pin === null,
    area: !deliveryEval.withinArea,
    closed: !shopOpen,
  };
  const contactDone = !errors.name && !errors.phone;
  const addressDone = !errors.address;
  const pinDone = !errors.pin && !errors.area;
  const valid = !Object.values(errors).some(Boolean) && lines.length > 0;

  // Where the buyer is in the flow: details first, then the pin, then confirm.
  const activeStep = !contactDone || !addressDone ? 0 : !pinDone ? 1 : 2;
  const steps = [
    { label: copy.buyer.stepDetails, done: contactDone && addressDone },
    { label: copy.buyer.stepPin, done: pinDone },
    { label: copy.buyer.stepReview, done: valid },
  ];

  async function submit(): Promise<void> {
    if (!valid || vendorId === null) {
      setShowErrors(true);
      return;
    }
    const address: MkAddress = {
      customer_name: draft.name.trim(),
      customer_phone: normaliseBdMobile(draft.phone),
      address_line: draft.address.trim(),
      landmark: draft.landmark.trim(),
      lat: draft.pin?.lat ?? null,
      lng: draft.pin?.lng ?? null,
      place_label: draft.pin?.label ?? '',
      note: draft.note.trim(),
    };
    try {
      const result = await place.mutateAsync({
        vendorId,
        address,
        directItems: isDirect ? [{ product_id: directProduct, qty: directQty }] : null,
      });
      setPlaced(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  return shell(
    <>
      <motion.header
        initial={reduce ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-900 via-green-700 to-emerald-500 p-5 text-white shadow-lg sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl"
        />
        <Link
          to={`/marketplace/shop/${slug}`}
          className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25"
        >
          <ArrowLeft size={14} aria-hidden />
          {shopName || copy.buyer.fromShop}
        </Link>
        <p className="relative mt-5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">
          {copy.buyer.checkoutEyebrow}
        </p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {copy.buyer.checkoutTitle}
        </h1>
        <p className="relative mt-2 max-w-2xl text-sm text-green-50/90 sm:text-base">
          {copy.buyer.checkoutLead}
        </p>

        <ol
          className="relative mt-6 grid max-w-xl grid-cols-3 gap-2"
          aria-label={copy.buyer.checkoutTitle}
        >
          {steps.map((step, index) => {
            const current = index === activeStep && !step.done;
            return (
              <li key={step.label} className="min-w-0">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-colors duration-300',
                    step.done ? 'bg-white' : current ? 'bg-white/70' : 'bg-white/20',
                  )}
                />
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]',
                      step.done ? 'bg-white text-green-800' : 'bg-white/20 text-white',
                    )}
                    aria-hidden
                  >
                    {step.done ? '✓' : index + 1}
                  </span>
                  <span className={cn('truncate', !step.done && !current && 'text-white/70')}>
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </motion.header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-5">
          <FormSection
            icon={<UserRound size={18} aria-hidden />}
            title={copy.buyer.sectionContact}
            done={contactDone}
            doneLabel={copy.buyer.sectionReady}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={copy.buyer.name}
                value={draft.name}
                error={showErrors && errors.name ? copy.fieldErrors.name_short : undefined}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoComplete="name"
              />
              <TextField
                label={copy.buyer.phone}
                inputMode="tel"
                autoComplete="tel"
                iconStart={<Phone size={16} aria-hidden />}
                value={draft.phone}
                error={showErrors && errors.phone ? copy.fieldErrors.mobile_invalid : undefined}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
          </FormSection>

          <FormSection
            icon={<MapPin size={18} aria-hidden />}
            title={copy.buyer.sectionAddress}
            done={addressDone}
            doneLabel={copy.buyer.sectionReady}
          >
            <div className="space-y-4">
              <TextareaField
                label={copy.buyer.addressLine}
                value={draft.address}
                error={showErrors && errors.address ? copy.fieldErrors.address_short : undefined}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={copy.buyer.landmark}
                  value={draft.landmark}
                  onChange={(e) => setDraft({ ...draft, landmark: e.target.value })}
                />
                <TextField
                  label={copy.buyer.note}
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            icon={<MapPin size={18} aria-hidden />}
            title={copy.buyer.sectionPin}
            done={pinDone}
            doneLabel={copy.buyer.sectionReady}
          >
            <LocationPicker
              language={language}
              value={draft.pin}
              onChange={(pin) => setDraft({ ...draft, pin })}
              radiusKm={deliveryConfig?.scope === 'radius' ? deliveryConfig.radius_km : null}
              circleCenter={
                deliveryConfig
                  ? { lat: deliveryConfig.center_lat, lng: deliveryConfig.center_lng }
                  : null
              }
              labels={{
                title: copy.buyer.pinTitle,
                hint: copy.buyer.pinHint,
                search: copy.buyer.searchPlaceholder,
                useCurrent: copy.buyer.useCurrent,
                outside: copy.fieldErrors.location_outside_bd,
              }}
            />
            {deliveryEval.roundedKm !== null ? (
              <p className="mt-2 text-xs text-muted">
                {copy.delivery.distanceRounded(deliveryEval.roundedKm)}
              </p>
            ) : null}
            {showErrors && errors.pin ? (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {copy.buyer.pinRequired}
              </p>
            ) : null}
            {!errors.pin && errors.area && deliveryConfig ? (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {copy.delivery.outsideRadius(deliveryConfig.radius_km)}
              </p>
            ) : null}
          </FormSection>

          <FormSection
            icon={<Banknote size={18} aria-hidden />}
            title={copy.buyer.sectionPayment}
            done
            doneLabel={copy.buyer.sectionReady}
          >
            <div className="flex items-start gap-4 rounded-2xl border border-green-600/25 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:from-green-950/40 dark:to-emerald-950/30">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-green-700 text-white shadow-md">
                <Banknote size={22} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-text">{copy.buyer.cod}</p>
                <p className="mt-1 text-sm text-muted">{copy.buyer.codNote}</p>
              </div>
            </div>
          </FormSection>
        </div>

        <aside className="lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-raised">
            <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-green-50 to-transparent px-5 py-4 dark:from-green-950/30">
              <Receipt size={18} className="text-green-700" aria-hidden />
              <h2 className="font-bold text-text">{copy.buyer.summaryTitle}</h2>
            </div>

            <div className="space-y-4 p-5">
              {shopName ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Store size={14} aria-hidden />
                  <span className="truncate font-medium text-text">{shopName}</span>
                </p>
              ) : null}

              {lines.length === 0 ? (
                <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">
                  {copy.buyer.cartEmpty}
                </p>
              ) : (
                <ul className="space-y-3">
                  {lines.map((line) => (
                    <li key={line.key} className="flex items-start gap-3">
                      <span className="grid h-7 min-w-[1.75rem] shrink-0 place-items-center rounded-lg bg-green-100 px-1.5 text-xs font-bold text-green-800 dark:bg-green-900/50 dark:text-green-100">
                        {line.qty}×
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-text">
                        {line.name}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                        {formatTaka(line.total, language)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">{copy.buyer.subtotal}</dt>
                  <dd className="tabular-nums text-text">{formatTaka(subtotal, language)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{copy.buyer.deliveryFee}</dt>
                  <dd className="text-right tabular-nums text-text">
                    {deliveryEval.needsPinForFee
                      ? copy.delivery.pinToCalculate
                      : formatTaka(fee, language)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <dt className="font-bold text-text">{copy.buyer.total}</dt>
                  <dd className="text-2xl font-extrabold tabular-nums text-green-700 dark:text-green-400">
                    {formatTaka(total, language)}
                  </dd>
                </div>
              </dl>

              {!shopOpen ? (
                <p
                  role="alert"
                  className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-800 dark:text-rose-200"
                >
                  {copy.schedule.closedBanner}
                </p>
              ) : null}

              <Button
                type="button"
                className="w-full rounded-2xl py-3.5 text-base shadow-lg shadow-green-700/25"
                size="lg"
                loading={place.isPending}
                disabled={lines.length === 0 || !shopOpen || errors.area}
                onClick={() => void submit()}
              >
                {copy.buyer.placeOrder}
              </Button>

              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-green-700" aria-hidden />
                {copy.buyer.trustLine}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {place.isPending ? (
          <motion.div
            key="placing"
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-8 shadow-2xl">
              <Loader2 className="animate-spin text-green-700" size={36} aria-hidden />
              <p className="font-semibold text-text">{copy.buyer.placing}</p>
            </div>
          </motion.div>
        ) : null}
        {placed !== null ? (
          <motion.div
            key="placed"
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              initial={reduce ? false : { scale: 0.85, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface p-8 text-center shadow-2xl"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-green-400/30 blur-2xl"
              />
              <motion.div
                className="relative mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg"
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <CheckCircle2 size={44} aria-hidden />
              </motion.div>
              <h2 className="relative text-xl font-extrabold text-text">
                {copy.buyer.orderPlaced}
              </h2>
              <p className="relative mt-2 text-sm text-muted">{copy.buyer.orderPlacedBody}</p>
              <div className="relative mt-5 rounded-2xl border border-dashed border-green-600/40 bg-green-50 p-4 dark:bg-green-950/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {copy.buyer.orderCode}
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-text">{placed.code}</p>
                <p className="mt-1 text-sm font-semibold text-green-700 dark:text-green-400">
                  {formatTaka(placed.total_poisha, language)}
                </p>
              </div>
              <div className="relative mt-6 flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full rounded-2xl"
                  onClick={() => navigate('/marketplace/orders')}
                >
                  <PackageCheck size={16} aria-hidden className="mr-2" />
                  {copy.buyer.trackOrder}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-2xl"
                  onClick={() => navigate('/marketplace')}
                >
                  {copy.buyer.marketTitle}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
  );
}

function FormSection({
  icon,
  title,
  done,
  doneLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  done: boolean;
  doneLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-card transition-shadow duration-200 hover:shadow-raised sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-bold transition-colors duration-300',
            done
              ? 'bg-green-700 text-white shadow-md'
              : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100',
          )}
          aria-hidden
        >
          {done ? <CheckCircle2 size={20} /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-text">{title}</h2>
        </div>
        {done ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-100">
            {doneLabel}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}
