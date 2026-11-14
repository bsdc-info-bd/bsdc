import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Banknote, CheckCircle2, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { LocationPicker, type PinnedLocation } from '@/components/mk/LocationPicker';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { Button, Card, EmptyState, PageSkeleton, TextField, TextareaField } from '@/design-system';
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
import { formatTaka, isBdMobile, normaliseBdMobile, type Language } from '@/lib/mk/mk-logic';
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

  if (uid === null) {
    return (
      <div className="fab-container max-w-2xl py-12">
        <EmptyState
          icon={<Banknote size={28} />}
          title={copy.buyer.checkoutTitle}
          description={copy.buyer.cartEmpty}
          action={
            <Link to={ROUTES.login} className="font-semibold text-green-700">
              {copy.buyer.signIn}
            </Link>
          }
        />
      </div>
    );
  }

  if (
    vendorRef.isLoading ||
    shop.isLoading ||
    payment.isLoading ||
    (isDirect && product.isLoading) ||
    cart.isLoading
  ) {
    return <PageSkeleton label={copy.loading} />;
  }

  const vendorId = vendorRef.data ?? null;
  if (vendorId === null) {
    return (
      <div className="fab-container max-w-2xl py-12">
        <EmptyState
          icon={<Banknote size={28} />}
          title={copy.buyer.marketTitle}
          description={copy.buyer.noShops}
          action={
            <Link to="/marketplace" className="font-semibold text-green-700">
              {copy.buyer.marketTitle} →
            </Link>
          }
        />
      </div>
    );
  }

  const fee = payment.data?.delivery_fee_poisha ?? 0;
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const total = subtotal + fee;

  const errors = {
    name: draft.name.trim().length < 2,
    phone: !isBdMobile(draft.phone),
    address: draft.address.trim().length < 5,
    pin: draft.pin === null,
  };
  const valid = !Object.values(errors).some(Boolean) && lines.length > 0;

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

  return (
    <div className="fab-container max-w-5xl space-y-6 py-6 sm:py-8">
      <Seo
        title={copy.buyer.checkoutTitle}
        description={copy.buyer.codNote}
        path={`/marketplace/checkout/${slug}`}
        noindex
      />
      <MarketNav copy={copy} />
      <Link
        to={`/marketplace/shop/${slug}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text"
      >
        <ArrowLeft size={14} aria-hidden /> {shop.data?.vendor.name ?? copy.buyer.fromShop}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card padded className="space-y-5">
          <h1 className="text-xl font-bold text-text">{copy.buyer.checkoutTitle}</h1>
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
              value={draft.phone}
              error={showErrors && errors.phone ? copy.fieldErrors.mobile_invalid : undefined}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </div>
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

          <LocationPicker
            language={language}
            value={draft.pin}
            onChange={(pin) => setDraft({ ...draft, pin })}
            labels={{
              title: copy.buyer.pinTitle,
              hint: copy.buyer.pinHint,
              search: copy.buyer.searchPlaceholder,
              useCurrent: copy.buyer.useCurrent,
              outside: copy.fieldErrors.location_outside_bd,
            }}
          />
          {showErrors && errors.pin ? (
            <p role="alert" className="text-sm text-danger">
              {copy.buyer.pinRequired}
            </p>
          ) : null}

          <div className="rounded-2xl border border-green-600/30 bg-green-600/5 p-4">
            <p className="flex items-center gap-2 font-semibold text-text">
              <Banknote size={18} aria-hidden /> {copy.buyer.cod}
            </p>
            <p className="mt-1 text-sm text-muted">{copy.buyer.codNote}</p>
          </div>
        </Card>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card padded className="space-y-4">
            <h2 className="font-semibold text-text">
              {copy.buyer.fromShop}: {shop.data?.vendor.name ?? ''}
            </h2>
            <ul className="divide-y divide-border text-sm">
              {lines.length === 0 ? (
                <li className="py-2 text-muted">{copy.buyer.cartEmpty}</li>
              ) : null}
              {lines.map((line) => (
                <li key={line.key} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {line.qty} × {line.name}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatTaka(line.total, language)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{copy.buyer.subtotal}</dt>
                <dd className="tabular-nums">{formatTaka(subtotal, language)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{copy.buyer.deliveryFee}</dt>
                <dd className="tabular-nums">{formatTaka(fee, language)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-extrabold">
                <dt>{copy.buyer.total}</dt>
                <dd className="tabular-nums text-green-700">{formatTaka(total, language)}</dd>
              </div>
            </dl>
            <Button
              type="button"
              className="w-full"
              size="lg"
              loading={place.isPending}
              disabled={lines.length === 0}
              onClick={() => void submit()}
            >
              {copy.buyer.placeOrder}
            </Button>
          </Card>
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
              initial={reduce ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center shadow-2xl"
            >
              <motion.div
                className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-green-600 text-white"
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <CheckCircle2 size={44} aria-hidden />
              </motion.div>
              <h2 className="text-xl font-bold text-text">{copy.buyer.orderPlaced}</h2>
              <p className="mt-2 text-sm text-muted">{copy.buyer.orderPlacedBody}</p>
              <p className="mt-4 text-xs text-muted">{copy.buyer.orderCode}</p>
              <p className="font-mono text-lg font-bold text-text">{placed.code}</p>
              <p className="mt-1 text-sm font-semibold text-green-700">
                {formatTaka(placed.total_poisha, language)}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button type="button" onClick={() => navigate('/marketplace/orders')}>
                  {copy.buyer.trackOrder}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate('/marketplace')}>
                  {copy.buyer.marketTitle}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
