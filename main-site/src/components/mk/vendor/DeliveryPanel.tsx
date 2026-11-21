import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, PageSkeleton, TextField } from '@/design-system';
import { LocationPicker, type PinnedLocation } from '@/components/mk/LocationPicker';
import { useSetVendorDelivery, useSetVendorSchedule, useVendorDelivery } from '@/hooks/use-mk';
import type { MkCopy } from '@/lib/mk/mk-copy';
import {
  DAY_KEYS,
  defaultDayHoursMap,
  formatHhMm,
  isValidHhMm,
  type DayKey,
  type Language,
} from '@/lib/mk/mk-logic';
import type { MkDayHours, MkFeeMode, MkVendorShop } from '@/lib/mk/mk-types';

interface DeliveryPanelProps {
  copy: MkCopy;
  language: Language;
  shop: MkVendorShop;
}

/**
 * Lets an active vendor configure:
 *   1. Delivery area (radius vs all Bangladesh), delivery centre pin, and 3-mode
 *      delivery fee (`default`, `fixed`, or `per_km`).
 *   2. Optional daily opening & closing schedule in Bangladesh time (`Asia/Dhaka`).
 */
export function DeliveryPanel({ copy: c, language, shop }: DeliveryPanelProps) {
  const query = useVendorDelivery();
  const saveDelivery = useSetVendorDelivery();
  const saveSchedule = useSetVendorSchedule();

  const [scope, setScope] = useState<'radius' | 'all_bd'>('radius');
  const [radius, setRadius] = useState('10');
  const [feeMode, setFeeMode] = useState<MkFeeMode>('default');
  const [charge, setCharge] = useState('150');
  const [perKmRate, setPerKmRate] = useState('20');
  const [centre, setCentre] = useState<PinnedLocation | null>(null);
  const [deliveryError, setDeliveryError] = useState('');

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [days, setDays] = useState<Record<DayKey, MkDayHours>>(() => defaultDayHoursMap());
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    const d = query.data;
    if (!d) return;
    setScope(d.scope);
    setRadius(String(d.radius_km));
    setFeeMode(d.fee_mode ?? 'fixed');
    setCharge(String(Math.round((d.fixed_fee_poisha ?? d.fee_poisha) / 100)));
    setPerKmRate(String(Math.round((d.per_km_rate_poisha ?? 2000) / 100)));
    setCentre({ lat: d.center_lat, lng: d.center_lng, label: '' });

    if (d.schedule) {
      setScheduleEnabled(d.schedule.enabled);
      const nextDays = defaultDayHoursMap();
      for (const k of DAY_KEYS) {
        const row = d.schedule.days?.[k];
        if (row) {
          nextDays[k] = {
            open: Boolean(row.open),
            start: row.start || '09:00',
            end: row.end || '22:00',
          };
        }
      }
      setDays(nextDays);
    }
  }, [query.data]);

  if (query.isLoading || !query.data) {
    return <PageSkeleton label={c.loading} />;
  }

  const radiusNumber = Number.parseInt(radius, 10);
  const chargeNumber = Number.parseInt(charge, 10);
  const perKmNumber = Number.parseInt(perKmRate, 10);

  async function submitDelivery(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDeliveryError('');
    if (!Number.isInteger(radiusNumber) || radiusNumber < 1 || radiusNumber > 500) {
      setDeliveryError(c.delivery.radiusError);
      return;
    }
    const resolvedFixed =
      feeMode === 'fixed'
        ? chargeNumber
        : Math.max(0, Number.isInteger(chargeNumber) ? chargeNumber : 150);
    const resolvedPerKm =
      feeMode === 'per_km'
        ? perKmNumber
        : Math.max(0, Number.isInteger(perKmNumber) ? perKmNumber : 20);

    if (
      feeMode === 'fixed' &&
      (!Number.isInteger(chargeNumber) || chargeNumber < 0 || chargeNumber > 100_000)
    ) {
      setDeliveryError(c.delivery.chargeError);
      return;
    }
    if (
      feeMode === 'per_km' &&
      (!Number.isInteger(perKmNumber) || perKmNumber < 0 || perKmNumber > 10_000)
    ) {
      setDeliveryError(c.delivery.perKmError);
      return;
    }
    const needsCentre = scope === 'radius' || feeMode === 'per_km';
    if (needsCentre && centre === null) {
      setDeliveryError(c.delivery.centreError);
      return;
    }
    try {
      await saveDelivery.mutateAsync({
        scope,
        radiusKm: radiusNumber,
        feeMode,
        feeTaka: Math.min(100_000, resolvedFixed),
        perKmTaka: Math.min(10_000, resolvedPerKm),
        center: centre ? { lat: centre.lat, lng: centre.lng } : null,
      });
      toast.success(c.delivery.saved);
      void query.refetch();
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : c.delivery.centreError);
    }
  }

  async function submitSchedule(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setScheduleError('');
    for (const k of DAY_KEYS) {
      const row = days[k];
      if (!isValidHhMm(row.start, false) || !isValidHhMm(row.end, true)) {
        setScheduleError(c.schedule.timeError);
        return;
      }
      if (row.open && row.start === row.end) {
        setScheduleError(c.schedule.timeError);
        return;
      }
    }
    try {
      await saveSchedule.mutateAsync({
        enabled: scheduleEnabled,
        days,
      });
      toast.success(c.schedule.saved);
      void query.refetch();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : c.schedule.timeError);
    }
  }

  function updateDay(key: DayKey, patch: Partial<MkDayHours>): void {
    setDays((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  const liveSchedule = query.data.schedule;
  const showCentrePicker = scope === 'radius' || feeMode === 'per_km';
  const shopLat = query.data.shop_lat;
  const shopLng = query.data.shop_lng;

  return (
    <div className="space-y-6">
      <Card padded>
        <h2 className="text-lg font-semibold text-text">{c.delivery.title}</h2>
        <p className="mt-1 text-sm text-muted">{c.delivery.lead}</p>

        <form onSubmit={(e) => void submitDelivery(e)} className="mt-5 space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setScope('radius')}
              className={`rounded-xl border p-3 text-left text-sm transition ${
                scope === 'radius'
                  ? 'border-green-700 bg-green-700/10 font-semibold text-text'
                  : 'border-border hover:bg-surface-2'
              }`}
            >
              {c.delivery.scopeRadius}
            </button>
            <button
              type="button"
              onClick={() => setScope('all_bd')}
              className={`rounded-xl border p-3 text-left text-sm transition ${
                scope === 'all_bd'
                  ? 'border-green-700 bg-green-700/10 font-semibold text-text'
                  : 'border-border hover:bg-surface-2'
              }`}
            >
              {c.delivery.scopeAll}
            </button>
          </div>

          {scope === 'radius' && (
            <TextField
              label={c.delivery.radius}
              inputMode="numeric"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              required
            />
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-text">{c.delivery.feeModeLabel}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ['per_km', c.delivery.feeModePerKm],
                  ['fixed', c.delivery.feeModeFixed],
                  ['default', c.delivery.feeModeDefault],
                ] as const
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setFeeMode(modeKey)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    feeMode === modeKey
                      ? 'border-green-700 bg-green-700/10 font-semibold text-text'
                      : 'border-border hover:bg-surface-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {feeMode === 'default' && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              {c.delivery.feeModeDefaultHint}
            </p>
          )}

          {feeMode === 'fixed' && (
            <TextField
              label={c.delivery.charge}
              inputMode="numeric"
              value={charge}
              onChange={(e) => setCharge(e.target.value)}
              required
            />
          )}

          {feeMode === 'per_km' && (
            <div className="space-y-1.5">
              <TextField
                label={c.delivery.perKmRate}
                inputMode="numeric"
                value={perKmRate}
                onChange={(e) => setPerKmRate(e.target.value)}
                required
              />
              <p className="text-xs text-muted">{c.delivery.perKmHint}</p>
            </div>
          )}

          {showCentrePicker && (
            <div className="space-y-2">
              <LocationPicker
                value={centre}
                onChange={setCentre}
                language={language}
                radiusKm={
                  scope === 'radius' && Number.isFinite(radiusNumber) && radiusNumber > 0
                    ? radiusNumber
                    : null
                }
                labels={{
                  title: c.delivery.centre,
                  hint: c.delivery.centreHint,
                  search: c.searchPlaceholder,
                  useCurrent: c.useCurrent,
                  outside: c.fieldErrors.location_outside_bd,
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setCentre({
                    lat: shopLat,
                    lng: shopLng,
                    label: shop.place_label ?? '',
                  })
                }
              >
                {c.delivery.useShop}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted">
            {scope === 'all_bd'
              ? c.delivery.allArea
              : c.delivery.currentArea(Number.isFinite(radiusNumber) ? radiusNumber : 10)}
          </p>

          {deliveryError && <p className="text-sm font-medium text-danger">{deliveryError}</p>}

          <Button type="submit" loading={saveDelivery.isPending}>
            {c.delivery.save}
          </Button>
        </form>
      </Card>

      <Card padded>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-text">{c.schedule.title}</h2>
            <p className="mt-1 text-sm text-muted">{c.schedule.lead}</p>
          </div>
          {liveSchedule && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                liveSchedule.is_open
                  ? 'bg-success-soft text-success'
                  : 'bg-danger-soft text-danger-text'
              }`}
            >
              {liveSchedule.enabled
                ? liveSchedule.is_open
                  ? liveSchedule.closes_at
                    ? c.schedule.closesAtLabel(formatHhMm(liveSchedule.closes_at, language))
                    : c.schedule.openNow
                  : c.schedule.closedNow
                : c.schedule.open24Hours}
            </span>
          )}
        </div>

        <form onSubmit={(e) => void submitSchedule(e)} className="mt-5 space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium text-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-green-700"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
            />
            <span>{c.schedule.enableLabel}</span>
          </label>

          {!scheduleEnabled ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              {c.schedule.alwaysOpenNote}
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {DAY_KEYS.map((dayKey) => {
                const row = days[dayKey];
                return (
                  <div
                    key={dayKey}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  >
                    <label className="flex min-w-[140px] cursor-pointer items-center gap-2 font-medium text-text">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-green-700"
                        checked={row.open}
                        onChange={(e) => updateDay(dayKey, { open: e.target.checked })}
                      />
                      <span>{c.schedule.days[dayKey]}</span>
                    </label>
                    {row.open ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <span>{c.schedule.opensAt}</span>
                          <input
                            type="time"
                            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text"
                            value={row.start}
                            onChange={(e) => updateDay(dayKey, { start: e.target.value })}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <span>{c.schedule.closesAt}</span>
                          <input
                            type="time"
                            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text"
                            value={row.end === '24:00' ? '23:59' : row.end}
                            onChange={(e) => updateDay(dayKey, { end: e.target.value })}
                          />
                        </label>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{c.schedule.dayClosed}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {scheduleError && <p className="text-sm font-medium text-danger">{scheduleError}</p>}

          <Button type="submit" loading={saveSchedule.isPending}>
            {c.schedule.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
