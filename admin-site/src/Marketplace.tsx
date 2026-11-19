import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  callRpc,
  listRpc,
  messageOf,
  useAsync,
  useCorporateEnv,
  type CorporateEnv,
} from '@kit';
import {
  marketplaceErrorPresentation,
  packagePriceLabel,
  packageSaveArgs,
  poishaToTakaInput,
  type CreditPackage,
} from './marketplace';

interface MarketplaceToastState {
  readonly tone: 'ok' | 'bad';
  readonly title: string;
  readonly message: string;
}

/** Admin controls for the vendor's 10, 50, and 100 order-credit packages. */
export function Marketplace(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => listRpc<CreditPackage>(env, 'mk_admin_list_packages'), [env]);
  const { state, reload } = useAsync(load, [env]);
  const [toast, setToast] = useState<MarketplaceToastState | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (state.status === 'loading') {
    return (
      <div className="kit-stack">
        <Card title="Marketplace · vendor order credits">
          <Loading label="Loading the vendor credit packages." />
        </Card>
        <MarketplaceToast toast={toast} />
      </div>
    );
  }

  if (state.status === 'error') {
    const failure = marketplaceErrorPresentation(state.message);
    return (
      <div className="kit-stack">
        <Card
          title="Marketplace · vendor order credits"
          actions={
            <Button size="small" variant="quiet" onClick={reload}>
              Retry
            </Button>
          }
        >
          <Banner tone="bad" title={failure.title}>
            <p className="kit-small">{failure.message}</p>
          </Banner>
        </Card>
        <MarketplaceToast toast={toast} />
      </div>
    );
  }

  const packages = [...state.data].sort((left, right) => Number(left.code) - Number(right.code));
  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="Vendor order-credit packages">
        <p className="kit-small">
          Set the Taka price, order allocation, and sale status for the 10, 50, and 100 order
          packages. Prices are stored as integer poisha; each save is checked again by Postgres.
        </p>
      </Banner>
      <Card
        title="Package prices"
        description="Changes apply to new vendor applications. Existing purchases keep their recorded price."
        actions={
          <Button size="small" variant="quiet" onClick={reload}>
            Refresh
          </Button>
        }
      >
        {packages.length === 0 ? (
          <Empty>No vendor credit packages were returned.</Empty>
        ) : (
          <div
            className="kit-stack"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 270px), 1fr))',
              gap: 'var(--sp-3)',
            }}
          >
            {packages.map((pkg) => (
              <PackageCard key={pkg.code} env={env} pkg={pkg} onSaved={reload} onToast={setToast} />
            ))}
          </div>
        )}
      </Card>
      <MarketplaceToast toast={toast} />
    </div>
  );
}

function PackageCard({
  env,
  pkg,
  onSaved,
  onToast,
}: {
  readonly env: CorporateEnv;
  readonly pkg: CreditPackage;
  readonly onSaved: () => void;
  readonly onToast: (toast: MarketplaceToastState) => void;
}): ReactElement {
  const [orders, setOrders] = useState(String(pkg.orders));
  const [priceTaka, setPriceTaka] = useState(poishaToTakaInput(pkg.price_poisha));
  const [isActive, setIsActive] = useState(pkg.is_active);
  const [errors, setErrors] = useState<{ orders?: string; priceTaka?: string }>({});
  const [rowError, setRowError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrders(String(pkg.orders));
    setPriceTaka(poishaToTakaInput(pkg.price_poisha));
    setIsActive(pkg.is_active);
    setErrors({});
    setRowError('');
  }, [pkg.orders, pkg.price_poisha, pkg.is_active]);

  const save = (): void => {
    const validation = packageSaveArgs({
      code: pkg.code,
      orders,
      priceTaka,
      isActive,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      setRowError('');
      return;
    }

    setSaving(true);
    setErrors({});
    setRowError('');
    void (async () => {
      try {
        await callRpc<unknown>(env, 'mk_admin_set_package', { ...validation.args });
        onToast({
          tone: 'ok',
          title: 'Package saved',
          message: `Package ${pkg.code} was updated successfully.`,
        });
        onSaved();
      } catch (cause) {
        const failure = marketplaceErrorPresentation(messageOf(cause));
        setRowError(failure.message);
        onToast({ tone: 'bad', title: failure.title, message: failure.message });
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <Card
      title={`Package ${pkg.code}`}
      description={`${pkg.code} package code · ${pkg.orders} orders currently included`}
      actions={<Badge tone={isActive ? 'ok' : 'warn'}>{isActive ? 'Active' : 'Inactive'}</Badge>}
    >
      <div className="kit-stack">
        <p className="kit-small" style={{ margin: 0 }}>
          Current price: <strong>{packagePriceLabel(pkg.price_poisha)}</strong>
        </p>
        <Field
          label="Price (Taka)"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={20}
          placeholder="100 or 100.50"
          value={priceTaka}
          onChange={(event) => {
            setPriceTaka(event.target.value);
            setErrors({});
            setRowError('');
          }}
          error={errors.priceTaka}
          hint="Enter whole Taka or an exact poisha amount (up to 2 decimals)."
        />
        <Field
          label="Orders included"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={16}
          value={orders}
          onChange={(event) => {
            setOrders(event.target.value);
            setErrors({});
            setRowError('');
          }}
          error={errors.orders}
          hint="Must be a positive whole number."
        />
        <label className="kit-row" style={{ justifyContent: 'flex-start', gap: 'var(--sp-2)' }}>
          <input
            type="checkbox"
            checked={isActive}
            aria-label={`Package ${pkg.code} active`}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          <span>{isActive ? 'Available to new vendors' : 'Hidden from new vendors'}</span>
        </label>
        {rowError !== '' ? (
          <Banner tone="bad" title="This package was not saved">
            <p className="kit-small">{rowError}</p>
          </Banner>
        ) : null}
        <div className="kit-row" style={{ justifyContent: 'flex-end' }}>
          <Button disabled={saving} size="small" onClick={save}>
            {saving ? 'Saving…' : 'Save package'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MarketplaceToast({
  toast,
}: {
  readonly toast: MarketplaceToastState | null;
}): ReactElement | null {
  if (toast === null) return null;
  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 1_000,
        width: 'min(28rem, calc(100vw - 2rem))',
      }}
    >
      <Banner tone={toast.tone} title={toast.title}>
        <p className="kit-small">{toast.message}</p>
      </Banner>
    </div>
  );
}
