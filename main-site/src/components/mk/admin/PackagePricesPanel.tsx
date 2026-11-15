import { Package, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, Button, Card, TextField } from '@/design-system';
import { useAdminPackages, useSetAdminPackage } from '@/hooks/use-mk';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { MkAdminPackage } from '@/lib/mk/mk-repository';

interface PackagePricesPanelProps {
  copy: MkCopy;
  language: Language;
  enabled: boolean;
}

/**
 * Edits the price and on-sale state of the order packages (10, 50, 100).
 * Raising and lowering are both allowed. The database checks each value again.
 */
export function PackagePricesPanel({ copy, language, enabled }: PackagePricesPanelProps) {
  const packages = useAdminPackages(enabled);
  const save = useSetAdminPackage();

  if (!enabled) return null;

  return (
    <Card padded className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Package size={20} aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold">{copy.packages.title}</h2>
          <p className="text-sm text-muted">{copy.packages.lead}</p>
        </div>
      </header>

      {packages.isError ? <Alert tone="danger" title={copy.errorGeneric} /> : null}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(packages.data ?? []).map((pkg) => (
          <li key={pkg.code}>
            <PackageRow
              pkg={pkg}
              copy={copy}
              language={language}
              saving={save.isPending}
              onSave={async (input) => {
                try {
                  await save.mutateAsync({
                    code: pkg.code,
                    orders: pkg.orders,
                    pricePoisha: input.pricePoisha,
                    isActive: input.isActive,
                  });
                  toast.success(copy.packages.saved);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : copy.errorGeneric);
                }
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PackageRow({
  pkg,
  copy,
  language,
  saving,
  onSave,
}: {
  pkg: MkAdminPackage;
  copy: MkCopy;
  language: Language;
  saving: boolean;
  onSave: (input: { pricePoisha: number; isActive: boolean }) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(pkg.price_poisha / 100));
  const [active, setActive] = useState(pkg.is_active);
  const [error, setError] = useState<string | null>(null);

  // Reflect the saved values after a refetch.
  useEffect(() => {
    setPrice(String(pkg.price_poisha / 100));
    setActive(pkg.is_active);
  }, [pkg.price_poisha, pkg.is_active]);

  async function submit(): Promise<void> {
    const taka = Number(price);
    if (!Number.isFinite(taka) || taka <= 0 || !Number.isInteger(taka * 100)) {
      setError(copy.packages.priceError);
      return;
    }
    setError(null);
    await onSave({ pricePoisha: Math.round(taka * 100), isActive: active });
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-extrabold">
          {pkg.orders}{' '}
          <span className="text-sm font-semibold text-muted">{copy.packages.orders}</span>
        </p>
        <span className="text-sm text-muted">{formatTaka(pkg.price_poisha, language)}</span>
      </div>
      <TextField
        label={copy.packages.price}
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        error={error ?? undefined}
      />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="accent-primary"
        />
        {copy.packages.active}
      </label>
      <div className="mt-auto flex justify-end">
        <Button type="button" size="sm" onClick={() => void submit()} loading={saving}>
          <Save size={16} aria-hidden /> {copy.packages.save}
        </Button>
      </div>
    </div>
  );
}
