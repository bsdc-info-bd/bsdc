import { BadgeCheck, Clock, CreditCard, Megaphone, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, EmptyState, TextField } from '@/design-system';
import { useAdCredits, useRequestAdCredits } from '@/hooks/use-ad-credits';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';

/**
 * Buying advertising credits with bKash.
 *
 * One credit is one taka, the floor is 500, and the money only lands in the
 * wallet after a person has matched the bKash transaction to this request. That
 * ordering is deliberate: an automatic credit would mean a stranger could type
 * any transaction id and start spending, so the queue is the control, not an
 * inconvenience to be optimised away.
 *
 * The price shown here is a preview. The server computes the real one from the
 * credit count (`request_ad_credits`), so a tampered request still costs full
 * price.
 */

const MIN_CREDITS = 500;

/** Quick amounts, sized to what a small shop actually spends on ads. */
const QUICK_AMOUNTS = [500, 1000, 2500, 5000] as const;

const STATUS_TONE = {
  pending: 'warn',
  approved: 'green',
  rejected: 'danger',
  cancelled: 'neutral',
} as const;

interface Props {
  language: Language;
  /** The bKash number from `ad_payment_instructions()`, or null when unset. */
  bikashNumber: string | null;
  enabled: boolean;
}

export function AdCreditsPanel({ language, bikashNumber, enabled }: Props) {
  const { t } = useTranslation();
  const credits = useAdCredits(enabled);
  const request = useRequestAdCredits();

  const [amount, setAmount] = useState(String(MIN_CREDITS));
  const [sender, setSender] = useState('');
  const [txn, setTxn] = useState('');
  const [problems, setProblems] = useState<{ amount?: string; sender?: string; txn?: string }>({});
  const [sent, setSent] = useState(false);

  if (!enabled) return null;

  const parsed = Number(amount);
  const amountValid =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= MIN_CREDITS &&
    parsed <= 1_000_000;

  function submit(): void {
    const next: typeof problems = {};
    if (!amountValid) {
      next.amount = t('ads.credits.amountError', { min: formatNumber(MIN_CREDITS, language) });
    }
    if (!/^01[3-9]\d{8}$/.test(sender.trim())) {
      next.sender = t('ads.credits.senderError');
    }
    if (txn.trim().length < 6) {
      next.txn = t('ads.credits.txnError');
    }
    setProblems(next);
    if (Object.keys(next).length > 0) return;

    void request
      .mutateAsync({
        credits: parsed,
        senderNumber: sender.trim(),
        txnId: txn.trim(),
      })
      .then(() => {
        setSent(true);
        setTxn('');
        setProblems({});
      })
      .catch(() => {
        // The message from the server is the useful one (duplicate transaction
        // id, amount below the floor), and the hook surfaces it in the alert.
        setSent(false);
      });
  }

  const balance = credits.data?.balancePoisha ?? 0;
  const history = credits.data?.requests ?? [];

  return (
    <Card padded className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Megaphone size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-text">{t('ads.credits.title')}</h2>
          <p className="text-sm text-muted">{t('ads.credits.lead')}</p>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Wallet size={13} aria-hidden />
            {t('ads.credits.balance')}
          </p>
          <p className="mt-1 text-xl font-bold text-text">{formatTaka(balance, language)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock size={13} aria-hidden />
            {t('ads.credits.pending')}
          </p>
          <p className="mt-1 text-xl font-bold text-text">
            {formatNumber(history.filter((item) => item.status === 'pending').length, language)}
          </p>
        </div>
      </div>

      {credits.isError ? <Alert tone="danger" title={t('ads.credits.failed')} /> : null}

      <div className="rounded-xl border border-border p-3">
        <p className="text-sm font-semibold text-text">{t('ads.credits.howTo')}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>{t('ads.credits.step1')}</li>
          <li>
            {bikashNumber !== null ? (
              <span>
                {t('ads.credits.step2')}{' '}
                <span className="font-mono font-semibold text-text">{bikashNumber}</span>
              </span>
            ) : (
              t('ads.credits.step2NoNumber')
            )}
          </li>
          <li>{t('ads.credits.step3')}</li>
        </ol>
        <p className="mt-2 text-xs text-muted">{t('ads.credits.rate')}</p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-text">{t('ads.credits.chooseAmount')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                aria-pressed={parsed === value}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  parsed === value
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border text-text hover:bg-surface-2'
                }`}
              >
                ৳{formatNumber(value, language)}
              </button>
            ))}
          </div>
        </div>

        <TextField
          label={t('ads.credits.amountLabel')}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={problems.amount}
          hint={t('ads.credits.amountHint', { min: formatNumber(MIN_CREDITS, language) })}
        />

        {amountValid ? (
          <p className="text-sm text-muted">
            {t('ads.credits.summary', {
              credits: formatNumber(parsed, language),
              taka: formatTaka(parsed * 100, language),
            })}
          </p>
        ) : null}

        <TextField
          label={t('ads.credits.senderLabel')}
          inputMode="tel"
          value={sender}
          onChange={(event) => setSender(event.target.value)}
          error={problems.sender}
          hint={t('ads.credits.senderHint')}
        />
        <TextField
          label={t('ads.credits.txnLabel')}
          value={txn}
          onChange={(event) => setTxn(event.target.value)}
          error={problems.txn}
          hint={t('ads.credits.txnHint')}
        />

        {request.isError ? (
          <Alert tone="danger" title={t('ads.credits.requestFailed')}>
            <span>
              {request.error instanceof Error ? request.error.message : t('errors.generic')}
            </span>
          </Alert>
        ) : null}

        {sent ? (
          <Alert tone="success" title={t('ads.credits.sentTitle')}>
            <span>{t('ads.credits.sentBody')}</span>
          </Alert>
        ) : null}

        <Button
          type="button"
          onClick={submit}
          loading={request.isPending}
          disabled={!amountValid || request.isPending}
          iconStart={<CreditCard size={16} />}
        >
          {t('ads.credits.submit')}
        </Button>
      </div>

      <div>
        <p className="text-sm font-semibold text-text">{t('ads.credits.history')}</p>
        {history.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={<BadgeCheck size={22} />}
              title={t('ads.credits.noHistoryTitle')}
              description={t('ads.credits.noHistoryBody')}
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
            {history.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text">
                    {t('ads.credits.historyRow', {
                      credits: formatNumber(item.credits, language),
                      taka: formatTaka(item.pricePoisha, language),
                    })}
                  </p>
                  <p className="text-xs text-muted">
                    {formatRelativeTime(new Date(item.createdAt), language)}
                  </p>
                  {item.reviewNote.length > 0 ? (
                    <p className="mt-1 rounded-lg bg-surface-2 p-2 text-xs text-text">
                      {item.reviewNote}
                    </p>
                  ) : null}
                </div>
                <Badge tone={STATUS_TONE[item.status]}>
                  {t(`ads.credits.status.${item.status}`, { defaultValue: item.status })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
