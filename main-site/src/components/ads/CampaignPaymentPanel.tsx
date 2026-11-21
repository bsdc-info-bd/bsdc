import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, Button, Card, TextField } from '@/design-system';
import { useAdBuilder } from '@/hooks/use-ad-builder';
import { BUILDER_LIMITS, normaliseSender } from '@/lib/ads/ads-builder';
import type { AdPaymentRequest } from '@/lib/ads/ads-types';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';
import { dataErrorKey } from '@/lib/supabase/errors';

interface CampaignPaymentPanelProps {
  campaignId: string;
  budgetPoisha: number;
  language: Language;
  /** The newest payment report for this campaign, if any. */
  latest: AdPaymentRequest | null;
  onDone?: () => void;
}

/**
 * Pay the budget the way a vendor pays for credits: send the money to the BSDC
 * bKash number, then report the sender, account name and transaction ID. Staff
 * approve the transaction before the wallet is credited.
 */
export function CampaignPaymentPanel({
  campaignId,
  budgetPoisha,
  language,
  latest,
  onDone,
}: CampaignPaymentPanelProps) {
  const { t } = useTranslation();
  const { instructions, instructionsError, submitPayment, isPaying } = useAdBuilder();
  const [sender, setSender] = useState('');
  const [account, setAccount] = useState('');
  const [txn, setTxn] = useState('');
  const [senderError, setSenderError] = useState(false);
  const [accountError, setAccountError] = useState(false);
  const [txnError, setTxnError] = useState(false);
  const [failed, setFailed] = useState(false);

  const amount = formatTaka(budgetPoisha, language);
  const waiting = latest?.status === 'pending';

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailed(false);
    const number = normaliseSender(sender);
    const accountOk =
      account.trim().length >= BUILDER_LIMITS.accountMin &&
      account.trim().length <= BUILDER_LIMITS.accountMax;
    const txnOk =
      txn.trim().length >= BUILDER_LIMITS.txnMin && txn.trim().length <= BUILDER_LIMITS.txnMax;
    setSenderError(number === null);
    setAccountError(!accountOk);
    setTxnError(!txnOk);
    if (number === null || !accountOk || !txnOk) return;
    try {
      await submitPayment(campaignId, { sender: number, account, txn });
      toast.success(t('ads.builder.paymentSent'));
      setSender('');
      setAccount('');
      setTxn('');
      onDone?.();
    } catch (error) {
      setFailed(true);
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <Card as="section" aria-labelledby={`pay-${campaignId}`} className="grid gap-4">
      <div>
        <h3 id={`pay-${campaignId}`} className="font-semibold">
          {t('ads.builder.payTitle')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('ads.builder.payIntro', { amount })}</p>
      </div>

      {latest?.status === 'rejected' ? (
        <Alert tone="danger" title={t('ads.builder.paymentRejected')}>
          {t('ads.builder.rejectedHint', { note: latest.reviewNote })}
        </Alert>
      ) : null}
      {waiting ? (
        <Alert tone="info" title={t('ads.builder.paymentPending')}>
          {t('ads.builder.pendingHint', { txn: latest?.txnId ?? '' })}
        </Alert>
      ) : null}

      <div className="rounded-xl bg-success-soft p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {t('ads.builder.payNumber')}
        </p>
        {instructions?.bikashNumber ? (
          <p
            className="mt-1 font-mono text-2xl font-bold tracking-wider"
            data-testid="bkash-number"
          >
            {instructions.bikashNumber}
          </p>
        ) : (
          <p className="mt-1 text-sm">
            {instructionsError
              ? t('ads.builder.payNumberError')
              : t('ads.builder.payNumberMissing')}
          </p>
        )}
        <p className="mt-2 text-sm">
          {t('ads.builder.payAmount')}: <strong>{amount}</strong>
        </p>
      </div>

      {!waiting ? (
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('ads.builder.sender')}
              inputMode="tel"
              autoComplete="tel"
              value={sender}
              hint={t('ads.builder.senderHint')}
              onChange={(event) => setSender(event.target.value)}
              error={senderError ? t('ads.builder.errors.sender') : undefined}
              required
            />
            <TextField
              label={t('ads.builder.account')}
              autoComplete="name"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              error={accountError ? t('ads.builder.errors.account') : undefined}
              required
            />
          </div>
          <TextField
            label={t('ads.builder.txn')}
            autoComplete="off"
            value={txn}
            onChange={(event) => setTxn(event.target.value)}
            error={txnError ? t('ads.builder.errors.txn') : undefined}
            required
          />
          {failed ? <Alert tone="danger" title={t('ads.builder.genericError')} /> : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={isPaying}
              disabled={isPaying || !instructions?.bikashNumber}
            >
              {t('ads.builder.submitPayment')}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
