import { Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeading,
  SelectField,
  TextField,
} from '@/design-system';
import { useVendorPayouts, useVendorShop } from '@/hooks/use-vendor';
import { formatAbsoluteDate } from '@/lib/format';
import { formatMoney } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { canRequestPayout } from '@/lib/vendor/vendor-types';

/** Money out: the ledger that explains the balance, and the way to withdraw it. */
export default function VendorPayoutsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { shop } = useVendorShop();
  const { entries, payouts, accounts, isLoading, request, addAccount, isSaving } = useVendorPayouts(
    shop?.id ?? null,
  );

  const [accountId, setAccountId] = useState('');
  const [taka, setTaka] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountRef, setAccountRef] = useState('');

  const amount = useMemo(() => {
    const parsed = Number.parseFloat(taka);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }, [taka]);

  const balance = shop?.balance ?? 0;
  const selected = accountId.length > 0 ? accountId : (accounts[0]?.id ?? '');
  const ready = selected.length > 0 && canRequestPayout(amount, balance);

  async function submitRequest(): Promise<void> {
    try {
      await request(selected, amount);
      toast.success(t('vendor.payouts.requested'));
      setTaka('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function submitAccount(): Promise<void> {
    try {
      await addAccount({
        method: 'bkash',
        accountName: accountName.trim(),
        accountRef: accountRef.trim(),
        bankName: '',
        branch: '',
      });
      toast.success(t('vendor.payouts.accountAdded'));
      setAccountName('');
      setAccountRef('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('vendor.payouts.metaTitle')}
        description={t('vendor.payouts.metaDescription')}
        path={ROUTES.vendorPayouts}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading
          title={t('vendor.payouts.title')}
          description={t('vendor.payouts.description')}
        />

        {shop === null ? <Alert tone="info" title={t('vendor.noShop')} className="mt-4" /> : null}

        {shop !== null ? (
          <Card className="mt-4">
            <p className="text-sm text-muted">{t('vendor.balance')}</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(balance, 'BDT', language)}
            </p>

            {accounts.length === 0 ? (
              <>
                <p className="mt-3 text-sm text-muted">{t('vendor.payouts.needAccount')}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextField
                    label={t('vendor.payouts.accountName')}
                    value={accountName}
                    onChange={(event) => {
                      setAccountName(event.target.value);
                    }}
                  />
                  <TextField
                    label={t('vendor.payouts.accountRef')}
                    inputMode="numeric"
                    value={accountRef}
                    onChange={(event) => {
                      setAccountRef(event.target.value);
                    }}
                  />
                </div>
                <Button
                  className="mt-3"
                  disabled={
                    isSaving || accountName.trim().length < 2 || accountRef.trim().length < 6
                  }
                  onClick={() => {
                    void submitAccount();
                  }}
                >
                  {t('vendor.payouts.addAccount')}
                </Button>
              </>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={t('vendor.payouts.account')}
                  value={selected}
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: `${account.account_name} · ${account.account_ref.slice(-4)}`,
                  }))}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                  }}
                />
                <TextField
                  label={t('vendor.payouts.amount')}
                  inputMode="decimal"
                  value={taka}
                  hint={t('vendor.payouts.amountHint', {
                    max: formatMoney(balance, 'BDT', language),
                  })}
                  onChange={(event) => {
                    setTaka(event.target.value);
                  }}
                />
                <Button
                  className="sm:col-span-2 sm:justify-self-start"
                  disabled={isSaving || !ready}
                  onClick={() => {
                    void submitRequest();
                  }}
                >
                  {t('vendor.payouts.request')}
                </Button>
              </div>
            )}
          </Card>
        ) : null}

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        <h2 className="mt-6 text-lg font-semibold">{t('vendor.payouts.history')}</h2>
        {!isLoading && payouts.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<Wallet size={22} />}
              title={t('vendor.payouts.emptyTitle')}
              description={t('vendor.payouts.emptyBody')}
            />
          </div>
        ) : null}
        <ul className="mt-3 grid gap-2">
          {payouts.map((payout) => (
            <Card
              as="li"
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">
                  {formatMoney(payout.amount, 'BDT', language)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatAbsoluteDate(new Date(payout.requestedAt), language)} ·{' '}
                  {t(`vendor.methods.${payout.method}`)} · ····{payout.accountTail}
                </p>
              </div>
              <Badge
                tone={
                  payout.status === 'paid'
                    ? 'green'
                    : payout.status === 'rejected'
                      ? 'danger'
                      : 'warn'
                }
              >
                {t(`vendor.payoutStatuses.${payout.status}`)}
              </Badge>
            </Card>
          ))}
        </ul>

        <h2 className="mt-6 text-lg font-semibold">{t('vendor.payouts.ledger')}</h2>
        <ul className="mt-3 grid gap-2">
          {entries.map((entry) => (
            <Card
              as="li"
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{t(`vendor.ledgerKinds.${entry.kind}`)}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatAbsoluteDate(new Date(entry.createdAt), language)}
                  {entry.memo.length > 0 ? ` · ${entry.memo}` : ''}
                </p>
              </div>
              <p
                className={
                  entry.amount < 0
                    ? 'font-semibold tabular-nums text-danger'
                    : 'font-semibold tabular-nums text-green-700'
                }
              >
                {formatMoney(entry.amount, 'BDT', language)}
              </p>
            </Card>
          ))}
        </ul>
      </div>
    </>
  );
}
