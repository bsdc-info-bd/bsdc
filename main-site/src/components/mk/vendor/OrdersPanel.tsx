import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, MapPin, Phone, Package } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, EmptyState, Modal, TextField } from '@/design-system';
import { useSetOrderStatus, useVendorOrders } from '@/hooks/use-mk';
import { formatTaka, ORDER_STATUSES, vendorActionsFor, type Language, type OrderStatus } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { MkVendorOrder } from '@/lib/mk/mk-types';

interface Props {
  copy: MkCopy;
  language: Language;
  enabled: boolean;
}

function actionLabel(next: OrderStatus, copy: MkCopy): string {
  switch (next) {
    case 'accepted':
      return copy.accept;
    case 'packaged':
      return copy.packaged;
    case 'out_for_delivery':
      return copy.outForDelivery;
    case 'delivered':
      return copy.markDelivered;
    default:
      return copy.statusLabels[next];
  }
}

const STATUS_TONE: Record<OrderStatus, 'neutral' | 'green' | 'blue' | 'danger' | 'warn'> = {
  placed: 'warn',
  accepted: 'blue',
  packaged: 'blue',
  out_for_delivery: 'blue',
  delivered: 'green',
  cancelled: 'danger',
};

export function OrdersPanel({ copy, language, enabled }: Props) {
  const orders = useVendorOrders(enabled);
  const setStatus = useSetOrderStatus();
  const reduceMotion = useReducedMotion() ?? false;
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [declining, setDeclining] = useState<MkVendorOrder | null>(null);
  const [reason, setReason] = useState('');

  const list = (orders.data ?? []).filter((o) => filter === 'all' || o.status === filter);

  async function move(order: MkVendorOrder, next: OrderStatus, why = ''): Promise<void> {
    try {
      await setStatus.mutateAsync({ orderId: order.id, next, reason: why });
      toast.success(copy.statusLabels[next]);
      setDeclining(null);
      setReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  return (
    <section aria-labelledby="orders-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="orders-h" className="text-lg font-semibold text-text">{copy.tabs.orders}</h2>
        <Badge tone="green" icon={<Bell size={14} />}>{copy.liveUpdates}</Badge>
      </div>

      <div role="radiogroup" aria-label={copy.tabs.orders} className="flex gap-2 overflow-x-auto pb-1">
        {(['all', ...ORDER_STATUSES] as const).map((status) => {
          const active = filter === status;
          const label = status === 'all' ? copy.tabs.orders : copy.statusLabels[status];
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFilter(status)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                active ? 'border-green-700 bg-green-700 text-white' : 'border-border bg-surface text-text hover:bg-surface-2'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {orders.isLoading ? <p className="text-sm text-muted">{copy.loading}</p> : null}

      {!orders.isLoading && list.length === 0 ? (
        <EmptyState icon={<Package size={28} />} title={copy.tabs.orders} description={copy.noOrders} />
      ) : null}

      <ul className="grid gap-4 xl:grid-cols-2">
        <AnimatePresence initial={false}>
          {list.map((order) => {
            const actions = vendorActionsFor(order.status);
            return (
              <motion.li
                key={order.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? {} : { opacity: 0, scale: 0.97 }}
                className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted">#{order.code}</p>
                    <p className="text-xs text-muted">{new Date(order.placed_at).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB')}</p>
                  </div>
                  <Badge tone={STATUS_TONE[order.status]}>{copy.statusLabels[order.status]}</Badge>
                </div>

                <div className="mt-3 grid gap-2 text-sm">
                  <p className="font-semibold text-text">{copy.customer}: {order.customer_name}</p>
                  <a href={`tel:${order.customer_phone}`} className="inline-flex items-center gap-2 text-green-700 hover:underline">
                    <Phone size={14} aria-hidden /> {order.customer_phone}
                  </a>
                  <p className="flex items-start gap-2 text-text">
                    <MapPin size={14} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0">
                      {order.address_line}
                      {order.landmark ? ` · ${order.landmark}` : ''}
                      {order.distance_km !== null ? ` · ${order.distance_km.toFixed(1)} ${copy.distance}` : ''}
                    </span>
                  </p>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=17/${order.lat}/${order.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-700 hover:underline"
                  >
                    {copy.openMap}
                  </a>
                  {order.note ? <p className="rounded-lg bg-surface-2 p-2 text-xs text-muted">{order.note}</p> : null}
                </div>

                <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
                  {order.items.map((item) => (
                    <li key={`${item.name}-${item.unit_price}`} className="flex items-center justify-between gap-2 p-2">
                      <span className="min-w-0 truncate">{item.qty} × {item.name}</span>
                      <span className="shrink-0 font-medium">{formatTaka(item.line_total, language)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">{copy.total}</span>
                  <span className="text-lg font-bold text-text">{formatTaka(order.total_poisha, language)}</span>
                </div>

                {actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {actions.map((next) => {
                      if (next === 'cancelled') {
                        return (
                          <Button key={next} type="button" variant="ghost" size="sm" onClick={() => setDeclining(order)}>
                            {order.status === 'placed' ? copy.decline : copy.cancelOrder}
                          </Button>
                        );
                      }
                      return (
                        <Button
                          key={next}
                          type="button"
                          size="sm"
                          loading={setStatus.isPending}
                          onClick={() => void move(order, next)}
                        >
                          {actionLabel(next, copy)}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <Modal
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={copy.cancelOrder}
        closeLabel={copy.cancel}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeclining(null)}>{copy.cancel}</Button>
            <Button
              type="button"
              variant="danger"
              loading={setStatus.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => declining && void move(declining, 'cancelled', reason.trim())}
            >
              {copy.cancelOrder}
            </Button>
          </div>
        }
      >
        <TextField label={copy.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </section>
  );
}
