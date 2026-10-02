import { PackageSearch } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageSkeleton,
  SectionHeading,
  TextField,
} from '@/design-system';
import { useVendorOrders, useVendorShop } from '@/hooks/use-vendor';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { formatMoney, type OrderStatus } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import type { ShopOrder } from '@/lib/vendor/vendor-types';

/**
 * Fulfilment. Every button here comes from next_statuses, which the database
 * computed from the same state machine it will check again on write.
 */
export default function VendorOrdersPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { shop } = useVendorShop();
  const { orders, isLoading, advance, markPaid, isSaving } = useVendorOrders();
  const [payTarget, setPayTarget] = useState<ShopOrder | null>(null);
  const [reference, setReference] = useState('');

  async function move(order: ShopOrder, status: OrderStatus): Promise<void> {
    try {
      await advance(order.id, status);
      toast.success(t('vendor.orderMoved', { status: t(`orders.statuses.${status}`) }));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function confirmPaid(): Promise<void> {
    if (payTarget === null) return;
    try {
      await markPaid(payTarget.id, reference.trim());
      toast.success(t('vendor.markedPaid'));
      setPayTarget(null);
      setReference('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('vendor.orders.metaTitle')}
        description={t('vendor.orders.metaDescription')}
        path={ROUTES.vendorOrders}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading
          title={t('vendor.orders.title')}
          description={t('vendor.orders.description')}
        />

        {shop !== null && shop.status !== 'active' ? (
          <Alert tone="warning" title={t('vendor.notActive')} className="mt-4" />
        ) : null}

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {!isLoading && orders.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<PackageSearch size={22} />}
              title={t('vendor.orders.emptyTitle')}
              description={t('vendor.orders.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3">
          {orders.map((order) => (
            <Card as="li" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{order.code}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatAbsoluteDate(new Date(order.placedAt), language)} ·{' '}
                    {t('orders.itemCount', { total: formatNumber(order.itemCount, language) })}
                  </p>
                  <p className="mt-1 text-sm">
                    {order.recipient} · {order.phone}
                  </p>
                  <p className="text-xs text-muted">
                    {order.addressLine}, {order.city}
                  </p>
                </div>
                <div className="text-end">
                  <p className="font-semibold">
                    {formatMoney(order.total, order.currency, language)}
                  </p>
                  <p className="mt-1 flex flex-wrap justify-end gap-1">
                    <Badge tone={order.status === 'cancelled' ? 'neutral' : 'green'}>
                      {t(`orders.statuses.${order.status}`)}
                    </Badge>
                    <Badge tone={order.paymentStatus === 'paid' ? 'green' : 'warn'}>
                      {t(`orders.paymentStatuses.${order.paymentStatus}`)}
                    </Badge>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {order.nextStatuses.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === 'cancelled' || status === 'refunded' ? 'ghost' : 'primary'}
                    disabled={isSaving}
                    onClick={() => {
                      void move(order, status);
                    }}
                  >
                    {t(`vendor.actions.${status}`)}
                  </Button>
                ))}
                {order.paymentStatus !== 'paid' && order.status !== 'cancelled' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => {
                      setPayTarget(order);
                    }}
                  >
                    {t('vendor.markPaid')}
                  </Button>
                ) : null}
                {order.nextStatuses.length === 0 ? (
                  <p className="text-xs text-muted">{t('vendor.orderClosed')}</p>
                ) : null}
              </div>
            </Card>
          ))}
        </ul>
      </div>

      <Modal
        open={payTarget !== null}
        onClose={() => {
          setPayTarget(null);
        }}
        title={t('vendor.markPaidTitle', { code: payTarget?.code ?? '' })}
        closeLabel={t('common.close')}
      >
        <p className="text-sm text-muted">{t('vendor.markPaidBody')}</p>
        <TextField
          className="mt-3"
          label={t('vendor.reference')}
          value={reference}
          onChange={(event) => {
            setReference(event.target.value);
          }}
        />
        <Button
          className="mt-4"
          disabled={isSaving}
          onClick={() => {
            void confirmPaid();
          }}
        >
          {t('vendor.markPaid')}
        </Button>
      </Modal>
    </>
  );
}
