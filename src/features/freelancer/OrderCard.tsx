/**
 * BSDC — src/features/freelancer/OrderCard.tsx
 * Purpose : One order, and the two or three actions a person can take on it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An order shows only the actions that are actually available right now. A buyer can
 *   cancel before work starts and rate after it completes; a freelancer can accept, deliver and
 *   complete. Offering "cancel" on an order that is already delivered would be a lie, and offering
 *   "complete" on one that was never accepted would be worse.
 *   The due date is shown as days remaining when it is close and as a plain date otherwise, because
 *   "due in two days" is the sentence that gets a reply.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Text, Textarea, showToast } from '@/shared/ui';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/core/config/opportunities';
import type { Locale } from '@/core/config/app';
import { daysToDue, isCancellable, type GigOrder } from '@/entities/gig/model';
import { reviewOrder, setOrderStatus } from '@/entities/gig/repository';

/** Actions each side may take, derived from the status rather than from who is looking. */
const FREELANCER_ACTIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['in-progress', 'cancelled'],
  'in-progress': ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  disputed: ['completed', 'cancelled'],
};

/** Props for the order card. */
export interface OrderCardProps {
  readonly order: GigOrder;
  readonly locale: Locale;
  /** True when the viewer is the freelancer rather than the buyer. */
  readonly asFreelancer: boolean;
  readonly onChange: (order: GigOrder) => void;
}

/**
 * Renders an order card.
 * @param props component props
 * @returns the card element
 */
export function OrderCard({
  order,
  locale,
  asFreelancer,
  onChange,
}: OrderCardProps): React.ReactElement {
  const { t } = useTranslation('freelancer');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');

  const days = daysToDue(order);

  const move = (status: OrderStatus): void => {
    setBusy(true);
    void setOrderStatus(order.id, status)
      .then((outcome) => {
        if (outcome.synced || outcome.queued) {
          onChange({ ...order, status });
          showToast(locale, {
            titleBn: t('order.updated.bn'),
            titleEn: t('order.updated.en'),
            tone: 'success',
          });
        }
      })
      .finally(() => setBusy(false));
  };

  const rate = (): void => {
    setBusy(true);
    void reviewOrder(order.id, rating, review)
      .then((outcome) => {
        if (outcome.synced || outcome.queued) {
          onChange({ ...order, rating, review });
          showToast(locale, {
            titleBn: t('order.rated.bn'),
            titleEn: t('order.rated.en'),
            tone: 'success',
          });
        }
      })
      .finally(() => setBusy(false));
  };

  const actions = asFreelancer
    ? FREELANCER_ACTIONS[order.status]
    : isCancellable(order)
      ? (['cancelled'] as const)
      : [];

  return (
    <Card as="article" className="bsdc-orderCard">
      <div className="bsdc-orderCard__head">
        <h3 className="bsdc-orderCard__title" lang={lang}>
          {order.gigTitle}
        </h3>
        <Badge
          tone={
            order.status === 'completed'
              ? 'success'
              : order.status === 'cancelled'
                ? 'danger'
                : 'brand'
          }
          variant="outline"
        >
          {ORDER_STATUS_LABELS[order.status][bn ? 'bn' : 'en']}
        </Badge>
      </div>
      <dl className="bsdc-orderCard__facts">
        <div>
          <dt lang={lang}>{t('order.ref')}</dt>
          <dd>{order.readableId}</dd>
        </div>
        <div>
          <dt lang={lang}>{t('order.package')}</dt>
          <dd lang={lang}>{order.packageName}</dd>
        </div>
        <div>
          <dt lang={lang}>{t('order.price')}</dt>
          <dd lang={lang}>৳{order.priceBdt.toLocaleString(bn ? 'bn-BD' : 'en-US')}</dd>
        </div>
        <div>
          <dt lang={lang}>{t('order.due')}</dt>
          <dd lang={lang}>
            {order.status === 'completed' || order.status === 'cancelled'
              ? '—'
              : days <= 3
                ? t('order.dueIn', { count: days })
                : order.dueAt.slice(0, 10)}
          </dd>
        </div>
      </dl>
      <Text as="p" size="sm" lang={lang} className="bsdc-orderCard__requirement">
        {order.requirement}
      </Text>

      {actions.length > 0 ? (
        <div className="bsdc-orderCard__actions">
          {actions.map((status) => (
            <Button
              key={status}
              variant={status === 'cancelled' ? 'secondary' : 'primary'}
              size="sm"
              loading={busy}
              onClick={() => move(status)}
            >
              {ORDER_STATUS_LABELS[status][bn ? 'bn' : 'en']}
            </Button>
          ))}
        </div>
      ) : null}

      {!asFreelancer && order.status === 'completed' && order.rating === 0 ? (
        <div className="bsdc-orderCard__review">
          <label className="bsdc-orderCard__rating" htmlFor={`rating-${order.id}`} lang={lang}>
            {t('order.rateLabel')}
            <select
              id={`rating-${order.id}`}
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {String(value)}
                </option>
              ))}
            </select>
          </label>
          <Textarea
            label={t('order.reviewLabel')}
            value={review}
            onChange={(event) => setReview(event.target.value)}
            maxLength={600}
          />
          <Button size="sm" variant="primary" loading={busy} onClick={rate}>
            {t('order.submitReview')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
