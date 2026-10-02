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
  Stepper,
  TextField,
} from '@/design-system';
import { useOrders } from '@/hooks/use-market';
import {
  formatMoney,
  ORDER_STEPS,
  orderStepIndex,
  type OrderSummary,
} from '@/lib/market/market-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** A customer's orders, with cancellation while cancellation still means something. */
export default function OrdersPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const orders = useOrders();
  const [target, setTarget] = useState<OrderSummary | null>(null);
  const [reason, setReason] = useState('');

  async function cancel() {
    if (target === null) return;
    try {
      await orders.cancel(target.id, reason.trim());
      toast.success(t('orders.cancelled'));
      setTarget(null);
      setReason('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('orders.metaTitle')}
        description={t('orders.metaDescription')}
        path={ROUTES.orders}
        noindex
      />

      <div className="fab-container max-w-3xl py-6 sm:py-10">
        <SectionHeading title={t('orders.title')} description={t('orders.description')} />

        {!isSignedIn ? (
          <Alert tone="info" title={t('orders.signInTitle')} className="mt-4" />
        ) : null}

        {orders.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {orders.isError ? (
          <Alert tone="danger" title={t('orders.failed')} className="mt-4" />
        ) : null}

        {isSignedIn && !orders.isLoading && orders.orders.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<PackageSearch size={22} />}
              title={t('orders.emptyTitle')}
              description={t('orders.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3">
          {orders.orders.map((order) => {
            const step = orderStepIndex(order.status);
            return (
              <Card as="li" key={order.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{order.code}</p>
                    <p className="mt-1 text-xs text-muted">
                      {order.shopName} · {formatAbsoluteDate(new Date(order.placedAt), language)} ·{' '}
                      {t('orders.itemCount', {
                        total: formatNumber(order.itemCount, language),
                      })}
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
                      <Badge tone="neutral">
                        {t(`orders.paymentStatuses.${order.paymentStatus}`)}
                      </Badge>
                    </p>
                  </div>
                </div>

                {step >= 0 ? (
                  <div className="mt-3">
                    <Stepper
                      steps={ORDER_STEPS.map((status) => t(`orders.statuses.${status}`))}
                      current={step}
                      label={t('orders.progress')}
                    />
                  </div>
                ) : null}

                {order.canCancel ? (
                  <Button
                    className="mt-3"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTarget(order);
                    }}
                  >
                    {t('orders.cancel')}
                  </Button>
                ) : null}
              </Card>
            );
          })}
        </ul>
      </div>

      <Modal
        open={target !== null}
        onClose={() => {
          setTarget(null);
        }}
        title={t('orders.cancelTitle', { code: target?.code ?? '' })}
        closeLabel={t('common.close')}
      >
        <p className="text-sm text-muted">{t('orders.cancelBody')}</p>
        <div className="mt-3">
          <TextField
            label={t('orders.cancelReason')}
            value={reason}
            maxLength={300}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            disabled={orders.isCancelling}
            onClick={() => {
              void cancel();
            }}
          >
            {t('orders.confirmCancel')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setTarget(null);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
