import { LocateFixed, Save, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LocationPicker, type PinnedLocation } from '@/components/mk/LocationPicker';
import { Alert, Button, Card, TextField } from '@/design-system';
import { useSetVendorDelivery, useVendorDelivery } from '@/hooks/use-mk';
import type { Language } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { MkVendorShop } from '@/lib/mk/mk-types';

interface DeliveryPanelProps {
  copy: MkCopy;
  language: Language;
  shop: MkVendorShop;
}

type Scope = 'radius' | 'all_bd';

const MAX_TAKA = 150;
const MAX_RADIUS_KM = 500;

/**
 * The shop's delivery area and charge. The owner either delivers to every
 * customer in Bangladesh, or within a radius (whole km) of a pinned centre.
 * The database re-checks every value, so this form only gives early feedback.
 */
export function DeliveryPanel({ copy, language, shop }: DeliveryPanelProps) {
  const current = useVendorDelivery();
  const save = useSetVendorDelivery();
  const [scope, setScope] = useState<Scope>('radius');
  const [radius, setRadius] = useState('5');
  const [charge, setCharge] = useState('150');
  const [centre, setCentre] = useState<PinnedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the saved settings once they arrive.
  useEffect(() => {
    const d = current.data;
    if (!d) return;
    setScope(d.scope);
    setRadius(String(d.radius_km));
    setCharge(String(Math.round(d.fee_poisha / 100)));
    setCentre({ lat: d.center_lat, lng: d.center_lng, label: '' });
  }, [current.data]);

  const radiusNumber = Number(radius);
  const chargeNumber = Number(charge);
  const radiusValid =
    Number.isInteger(radiusNumber) && radiusNumber >= 1 && radiusNumber <= MAX_RADIUS_KM;
  const chargeValid =
    charge.trim() !== '' &&
    Number.isInteger(chargeNumber) &&
    chargeNumber >= 0 &&
    chargeNumber <= MAX_TAKA;

  async function submit(): Promise<void> {
    setError(null);
    if (scope === 'radius') {
      if (!radiusValid) {
        setError(copy.delivery.radiusError);
        return;
      }
      if (centre === null) {
        setError(copy.delivery.centreError);
        return;
      }
    }
    if (!chargeValid) {
      setError(copy.delivery.chargeError);
      return;
    }
    try {
      await save.mutateAsync({
        scope,
        radiusKm: scope === 'radius' ? radiusNumber : 1,
        feeTaka: chargeNumber,
        center: scope === 'radius' && centre ? { lat: centre.lat, lng: centre.lng } : null,
      });
      toast.success(copy.delivery.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.errorGeneric);
    }
  }

  const shopCentre: PinnedLocation | null =
    current.data === undefined
      ? null
      : { lat: current.data.shop_lat, lng: current.data.shop_lng, label: shop.place_label };
  const activeRadius = scope === 'radius' && radiusValid ? radiusNumber : null;

  return (
    <Card padded className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Truck size={20} aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold">{copy.delivery.title}</h2>
          <p className="text-sm text-muted">{copy.delivery.lead}</p>
        </div>
      </header>

      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="sr-only">{copy.delivery.title}</legend>
        {(
          [
            ['radius', copy.delivery.scopeRadius],
            ['all_bd', copy.delivery.scopeAll],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm font-semibold transition ${
              scope === value
                ? 'border-primary bg-primary/5 text-text'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            <input
              type="radio"
              name="delivery-scope"
              value={value}
              checked={scope === value}
              onChange={() => setScope(value)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {scope === 'radius' ? (
        <div className="space-y-4">
          <TextField
            label={copy.delivery.radius}
            inputMode="numeric"
            value={radius}
            onChange={(e) => setRadius(e.target.value.replace(/[^0-9]/g, ''))}
            hint={`1 – ${MAX_RADIUS_KM}`}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{copy.delivery.centre}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={shopCentre === null}
                onClick={() => setCentre(shopCentre)}
              >
                <LocateFixed size={16} aria-hidden /> {copy.delivery.useShop}
              </Button>
            </div>
            <p className="text-xs text-muted">{copy.delivery.centreHint}</p>
            <LocationPicker
              value={centre}
              onChange={setCentre}
              language={language}
              radiusKm={activeRadius}
              labels={{
                title: copy.delivery.centre,
                hint: copy.delivery.centreHint,
                search: copy.delivery.centre,
                useCurrent: copy.delivery.useShop,
                outside: copy.delivery.centreError,
              }}
            />
            {activeRadius !== null ? (
              <p className="text-sm text-muted">{copy.delivery.currentArea(activeRadius)}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">{copy.delivery.allArea}</p>
      )}

      <TextField
        label={copy.delivery.charge}
        inputMode="numeric"
        value={charge}
        onChange={(e) => setCharge(e.target.value.replace(/[^0-9]/g, ''))}
        hint={`0 – ${MAX_TAKA}`}
      />

      {error ? <Alert tone="danger" title={error} /> : null}

      <div className="flex justify-end">
        <Button type="button" onClick={() => void submit()} loading={save.isPending}>
          <Save size={16} aria-hidden /> {copy.delivery.save}
        </Button>
      </div>
    </Card>
  );
}
