import { CheckCircle2, Megaphone, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, Badge, Button, Card, EmptyState, Modal, TextareaField } from '@/design-system';
import { useAdCreditQueue, type AdCreditQueueRow } from '@/hooks/use-ad-credits';
import { formatRelativeTime } from '@/lib/format';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';

/**
 * The staff queue for advertising credit requests.
 *
 * Every row is money a member says they have already sent by bKash. Approving
 * credits their wallet once — the database enforces that with a unique index on
 * the ledger row, so two reviewers pressing approve at the same time cannot
 * double-credit anyone. Rejecting requires a reason, and the reason is delivered
 * to the member rather than filed: a rejection they cannot read is a rejection
 * they cannot fix.
 */
export function AdCreditsReviewPanel({
  language,
  enabled,
}: {
  language: Language;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const queue = useAdCreditQueue(status, enabled);
  const [rejecting, setRejecting] = useState<AdCreditQueueRow | null>(null);
  const [note, setNote] = useState('');

  if (!enabled) return null;

  async function decide(row: AdCreditQueueRow, decision: 'approve' | 'reject'): Promise<void> {
    try {
      await queue.decide(row.id, decision, decision === 'approve' ? '' : note.trim());
      toast.success(
        decision === 'approve' ? t('admin.ads.credits.approved') : t('admin.ads.credits.rejected'),
      );
      setRejecting(null);
      setNote('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

  const tabs = ['pending', 'approved', 'rejected'] as const;

  return (
    <Card padded className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Megaphone size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text">{t('admin.ads.credits.title')}</h2>
            <p className="text-sm text-muted">{t('admin.ads.credits.lead')}</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void queue.refresh()}
          loading={queue.isLoading}
          iconStart={<RefreshCw size={14} />}
        >
          {t('admin.ads.credits.refresh')}
        </Button>
      </header>

      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={t('admin.ads.credits.filter')}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="radio"
            aria-checked={status === tab}
            onClick={() => setStatus(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              status === tab
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-border text-text hover:bg-surface-2'
            }`}
          >
            {t(`admin.ads.credits.tab.${tab}`)}
          </button>
        ))}
      </div>

      {queue.isError ? <Alert tone="danger" title={t('admin.ads.credits.failed')} /> : null}

      {queue.isLoading ? <p className="text-sm text-muted">{t('common.loading')}</p> : null}

      {!queue.isLoading && queue.rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={22} />}
          title={t('admin.ads.credits.emptyTitle')}
          description={t('admin.ads.credits.emptyBody')}
        />
      ) : null}

      <ul className="grid gap-3">
        {queue.rows.map((row) => {
          const busy = queue.decidingId === row.id;
          return (
            <li key={row.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{row.displayName}</p>
                  {row.username.length > 0 ? (
                    <p className="text-xs text-muted">@{row.username}</p>
                  ) : null}
                </div>
                <Badge
                  tone={
                    row.status === 'approved'
                      ? 'green'
                      : row.status === 'rejected'
                        ? 'danger'
                        : 'warn'
                  }
                >
                  {t(`ads.credits.status.${row.status}`, { defaultValue: row.status })}
                </Badge>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">{t('admin.ads.credits.credits')}</dt>
                  <dd className="font-semibold text-text">{row.credits}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('admin.ads.credits.amount')}</dt>
                  <dd className="font-semibold text-text">
                    {formatTaka(row.pricePoisha, language)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('admin.ads.credits.sender')}</dt>
                  <dd className="font-mono text-sm text-text">{row.senderNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('admin.ads.credits.txn')}</dt>
                  <dd className="break-all font-mono text-sm text-text">{row.txnId}</dd>
                </div>
              </dl>

              <p className="mt-2 text-xs text-muted">
                {formatRelativeTime(new Date(row.createdAt), language)}
              </p>

              {row.reviewNote.length > 0 ? (
                <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-text">
                  {row.reviewNote}
                </p>
              ) : null}

              {row.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={busy}
                    disabled={queue.isDeciding}
                    onClick={() => void decide(row, 'approve')}
                    iconStart={<CheckCircle2 size={14} />}
                  >
                    {t('admin.ads.credits.approve')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={queue.isDeciding}
                    onClick={() => {
                      setRejecting(row);
                      setNote('');
                    }}
                    iconStart={<XCircle size={14} />}
                  >
                    {t('admin.ads.credits.reject')}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={t('admin.ads.credits.rejectTitle')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={note.trim().length < 5}
              onClick={() => {
                if (rejecting !== null) void decide(rejecting, 'reject');
              }}
            >
              {t('admin.ads.credits.reject')}
            </Button>
          </div>
        }
      >
        <TextareaField
          label={t('admin.ads.credits.reasonLabel')}
          hint={t('admin.ads.credits.reasonHint')}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Modal>
    </Card>
  );
}
