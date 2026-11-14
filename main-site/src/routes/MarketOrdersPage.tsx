import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ClipboardList, MessageSquarePlus, Star, Store, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { MarketNav } from '@/components/mk/customer/MarketNav';
import { OrderTimeline } from '@/components/mk/customer/OrderTimeline';
import { StarRating } from '@/components/mk/customer/StarRating';
import { Badge, Button, Card, EmptyState, PageSkeleton, TextareaField } from '@/design-system';
import { useCancelMyOrder, useMyOrders, useSubmitReview } from '@/hooks/use-mk';
import { mkCopy } from '@/lib/mk/mk-copy';
import { customerCanCancel, formatTaka, type Language } from '@/lib/mk/mk-logic';
import type { MkCustomerOrder } from '@/lib/mk/mk-types';
import { ROUTES } from '@/lib/site';

type Tab = 'active' | 'past';

export default function MarketOrdersPage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const reduce = useReducedMotion() ?? false;
  const orders = useMyOrders();
  const [tab, setTab] = useState<Tab>('active');

  // A delivered or cancelled order leaves the tracker: it moves to "past", so
  // the live view only ever shows what still needs attention.
  const { active, past } = useMemo(() => {
    const list = orders.data ?? [];
    return {
      active: list.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
      past: list.filter((o) => o.status === 'delivered' || o.status === 'cancelled'),
    };
  }, [orders.data]);

  if (orders.isLoading) return <PageSkeleton label={copy.loading} />;
  const shown = tab === 'active' ? active : past;

  return (
    <div className="fab-container max-w-4xl space-y-6 py-6 sm:py-8">
      <Seo title={copy.buyer.myOrders} description={copy.buyer.trackOrder} path={ROUTES.marketOrders} noindex />
      <MarketNav copy={copy} />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text">{copy.buyer.myOrders}</h1>
        <Badge tone="green">{copy.liveUpdates}</Badge>
      </div>

      <div role="tablist" className="flex gap-2">
        {(['active', 'past'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${tab === id ? 'border-green-700 bg-green-700 text-white' : 'border-border bg-surface hover:bg-surface-2'}`}
          >
            {id === 'active' ? `${copy.buyer.activeOrders} (${active.length})` : `${copy.buyer.pastOrders} (${past.length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title={copy.buyer.myOrders} description={copy.buyer.noOrders} />
      ) : null}

      <ul className="space-y-4">
        <AnimatePresence initial={false}>
          {shown.map((order) => (
            <motion.li
              key={order.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? {} : { opacity: 0, scale: 0.97 }}
            >
              <OrderCard order={order} language={language} copy={copy} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function OrderCard({ order, language, copy }: { order: MkCustomerOrder; language: Language; copy: ReturnType<typeof mkCopy> }) {
  const cancel = useCancelMyOrder();
  const review = useSubmitReview();
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [open, setOpen] = useState<'cancel' | 'review' | null>(null);

  const canCancel = customerCanCancel(order.status);

  async function doCancel(): Promise<void> {
    try {
      await cancel.mutateAsync({ orderId: order.id, reason: reason.trim() });
      toast.success(copy.statusLabels.cancelled);
      setOpen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  async function doReview(): Promise<void> {
    if (rating < 1) return;
    try {
      await review.mutateAsync({ orderId: order.id, rating, body: body.trim() });
      toast.success(copy.buyer.reviewed);
      setOpen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  return (
    <Card padded className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-surface-2">
            {order.vendor.logo_url ? <img src={order.vendor.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="m-2.5 text-muted" size={24} aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-text">{order.vendor.name}</p>
            <p className="font-mono text-xs text-muted">{copy.buyer.orderNumberLabel} {order.code}</p>
          </div>
        </div>
        <span className="text-right text-sm font-bold tabular-nums">{formatTaka(order.total_poisha, language)}</span>
      </div>

      <OrderTimeline status={order.status} copy={copy} />

      <ul className="space-y-1 text-sm text-muted">
        {order.items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{item.qty} × {item.name}</span>
            <span className="shrink-0 tabular-nums">{formatTaka(item.line_total, language)}</span>
          </li>
        ))}
      </ul>

      {canCancel ? (
        <div className="flex flex-wrap items-center gap-2">
          {open === 'cancel' ? (
            <div className="w-full space-y-2 rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">{copy.buyer.cancelHint}</p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={copy.buyer.cancelReason}
                aria-label={copy.buyer.cancelReason}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(null)}>{copy.cancel}</Button>
                <Button type="button" variant="danger" size="sm" loading={cancel.isPending} onClick={() => void doCancel()}>{copy.buyer.cancelOrder}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="sm" iconStart={<XCircle size={14} />} onClick={() => setOpen('cancel')}>
              {copy.buyer.cancelOrder}
            </Button>
          )}
        </div>
      ) : null}

      {order.status === 'delivered' ? (
        <div>
          {order.reviewed ? (
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-green-700"><Star size={14} className="fill-amber-400 text-amber-400" aria-hidden />{copy.buyer.reviewed}</p>
          ) : open === 'review' ? (
            <div className="space-y-3 rounded-xl bg-surface-2 p-3">
              <p className="text-sm font-semibold text-text">{copy.buyer.reviewTitle}</p>
              <StarRating value={rating} onChange={setRating} label={copy.buyer.rating} size={26} />
              <TextareaField label={copy.buyer.reviewBody} value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(null)}>{copy.cancel}</Button>
                <Button type="button" size="sm" disabled={rating < 1} loading={review.isPending} onClick={() => void doReview()}>{copy.buyer.submitReview}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" iconStart={<MessageSquarePlus size={14} />} onClick={() => setOpen('review')}>
              {copy.buyer.leaveReview}
            </Button>
          )}
        </div>
      ) : null}
      {order.status !== 'delivered' && order.status !== 'cancelled' && !canCancel ? (
        <p className="text-xs text-muted">{copy.buyer.reviewAfterDelivery}</p>
      ) : null}
    </Card>
  );
}
