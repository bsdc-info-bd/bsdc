/**
 * BSDC — src/features/freelancer/OrderDialog.tsx
 * Purpose : Placing an order: what you need, when you need it, and what it costs.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The dialog states plainly that BSDC does not hold money. Payment is arranged between
 *   the two people involved, and the order record is the written agreement between them, not a
 *   receipt. Saying this in four lines before a person commits is worth more than any amount of
 *   reassuring interface language, because the alternative is discovering it later.
 *   The due date is computed from the package's own delivery time and shown before submission, so
 *   nobody is surprised by a deadline they did not read.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Select, Textarea, showToast } from '@/shared/ui';
import { findError } from '@/core/errors/taxonomy';
import type { Locale } from '@/core/config/app';
import {
  newOrder,
  validateOrder,
  type Gig,
  type GigOrder,
  type GigPackage,
} from '@/entities/gig/model';
import { placeOrder } from '@/entities/gig/repository';

/** Props for the order dialog. */
export interface OrderDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly gig: Gig;
  readonly buyerUid: string;
  readonly buyerName: string;
  readonly locale: Locale;
  readonly onPlaced: (order: GigOrder) => void;
}

/**
 * Renders the order dialog.
 * @param props component props
 * @returns the dialog element
 */
export function OrderDialog({
  open,
  onOpenChange,
  gig,
  buyerUid,
  buyerName,
  locale,
  onPlaced,
}: OrderDialogProps): React.ReactElement {
  const { t } = useTranslation('freelancer');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const first = gig.packages[0];
  const [packageName, setPackageName] = useState(first?.name ?? '');
  const [requirement, setRequirement] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen: GigPackage | undefined = useMemo(
    () => gig.packages.find((pack) => pack.name === packageName) ?? gig.packages[0],
    [gig.packages, packageName],
  );

  const due = useMemo(() => {
    if (chosen === undefined) return '';
    const at = new Date(Date.now() + chosen.deliveryDays * 86_400_000);
    return at.toISOString().slice(0, 10);
  }, [chosen]);

  const submit = (): void => {
    if (chosen === undefined) return;
    const validation = validateOrder({
      gig,
      packageName: chosen.name,
      buyerUid,
      buyerName,
      requirement,
    });
    if (validation !== null) {
      setProblem(validation);
      return;
    }
    setProblem(null);
    setBusy(true);
    void placeOrder(gig, chosen.name, buyerUid, buyerName, requirement)
      .then((outcome) => {
        if (!outcome.synced && !outcome.queued) {
          const code = outcome.error?.code ?? 'BSDC-DATA-007';
          const definition = findError(code);
          showToast(locale, {
            tone: 'error',
            titleBn: definition?.bn ?? code,
            titleEn: definition?.en ?? code,
          });
          return;
        }
        const order = newOrder({
          gig,
          packageName: chosen.name,
          buyerUid,
          buyerName,
          requirement,
        });
        onPlaced(order);
        onOpenChange(false);
        showToast(locale, {
          titleBn: t('order.placed.bn'),
          titleEn: t('order.placed.en'),
          tone: 'success',
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('order.title', { gig: gig.title })}
      description={t('order.description')}
      size="md"
      closeLabel={t('order.close')}
      footer={
        <div className="bsdc-orderDialog__actions">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('order.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={requirement.trim().length === 0}
            onClick={submit}
          >
            {t('order.confirm')}
          </Button>
        </div>
      }
    >
      <div className="bsdc-orderDialog">
        <Select<string>
          label={t('order.package')}
          value={chosen?.name ?? ''}
          onValueChange={setPackageName}
          options={gig.packages.map((pack) => ({
            value: pack.name,
            label: `${pack.name} · ৳${pack.priceBdt.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')} · ${pack.deliveryDays}d`,
          }))}
        />
        <Textarea
          label={t('order.requirement')}
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          maxLength={2000}
          hint={t('order.requirementHint')}
          required
        />
        <dl className="bsdc-orderDialog__summary">
          <div>
            <dt lang={lang}>{t('order.price')}</dt>
            <dd lang={lang}>
              ৳{(chosen?.priceBdt ?? 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}
            </dd>
          </div>
          <div>
            <dt lang={lang}>{t('order.due')}</dt>
            <dd lang={lang}>{due}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('order.revisions')}</dt>
            <dd lang={lang}>{String(chosen?.revisions ?? 0)}</dd>
          </div>
        </dl>
        <p className="bsdc-orderDialog__payment" lang={lang}>
          {t('order.paymentNote')}
        </p>
        {problem !== null ? (
          <p className="bsdc-orderDialog__error" role="alert" lang={lang}>
            {t(`error.${problem}.${locale === 'bn' ? 'bn' : 'en'}`)}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
