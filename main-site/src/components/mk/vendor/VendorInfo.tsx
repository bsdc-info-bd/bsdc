import {
  Clock,
  MapPin,
  Truck,
  Info,
  Shield,
  Store,
  CalendarDays,
  Banknote,
  Package,
  Navigation,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/design-system';
import { VendorLocationMap } from './VendorLocationMap';
import { formatTaka, formatHhMm, type Language, type DayKey } from '@/lib/mk/mk-logic';
import { ShopTypeIcon } from '@/components/mk/ShopTypeIcon';
import type { MkVendorDetails } from '@/lib/mk/mk-types';
import { mkCopy } from '@/lib/mk/mk-copy';

interface Props {
  details: MkVendorDetails;
  language: Language;
}

const DAY_ORDER: DayKey[] = ['1', '2', '3', '4', '5', '6', '0'];

export function VendorInfo({ details, language }: Props) {
  const copy = mkCopy(language);
  const v = details.vendor;
  const delivery = v.delivery;
  const schedule = v.schedule;

  const feeBadge =
    delivery?.fee_mode === 'per_km'
      ? copy.delivery.perKmBadge(formatTaka(delivery.per_km_rate_poisha ?? 2000, language))
      : delivery
        ? formatTaka(delivery.fee_poisha, language)
        : formatTaka(15000, language);

  const isOpen = schedule?.is_open ?? true;

  return (
    <div className="space-y-6">
      {/* About + quick facts */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card padded className="md:col-span-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
            <Info size={16} className="text-primary" aria-hidden />
            {language === 'bn' ? 'দোকান সম্পর্কে' : 'About this shop'}
          </h3>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShopTypeIcon type={v.vendor_type} size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{v.name}</p>
              <p className="text-xs text-muted">{copy.typeLabels[v.vendor_type]}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                <MapPin size={11} aria-hidden />
                {v.place_label}
              </p>
            </div>
          </div>
          {v.description ? (
            <p className="mt-4 text-sm leading-relaxed text-text">{v.description}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-text">
              <Store size={11} aria-hidden />
              {v.status === 'active' ? (language === 'bn' ? 'সক্রিয়' : 'Active') : v.status}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-text">
              <CalendarDays size={11} aria-hidden />
              {language === 'bn' ? 'যোগদান' : 'Joined'} {new Date(v.created_at).getFullYear()}
            </span>
          </div>
        </Card>

        <Card padded className="md:col-span-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
            <Truck size={16} className="text-primary" aria-hidden />
            {language === 'bn' ? 'ডেলিভারি তথ্য' : 'Delivery details'}
          </h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-muted">
                <Banknote size={12} aria-hidden />
                {copy.buyer.deliveryFee}
              </dt>
              <dd className="font-semibold text-text">{feeBadge}</dd>
            </div>
            {(delivery?.min_order_poisha ?? 0) > 0 ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted">
                  <Package size={12} aria-hidden />
                  {copy.buyer.minOrder}
                </dt>
                <dd className="font-semibold text-text">
                  {formatTaka(delivery?.min_order_poisha ?? 0, language)}
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{copy.buyer.minOrder}</dt>
                <dd className="font-medium text-muted">{copy.buyer.noMinimum}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">{language === 'bn' ? 'এলাকা' : 'Area'}</dt>
              <dd className="font-medium text-text">
                {delivery?.scope === 'all_bd'
                  ? copy.delivery.allArea
                  : delivery?.radius_km
                    ? copy.delivery.currentArea(delivery.radius_km)
                    : '—'}
              </dd>
            </div>
            {delivery?.fee_mode === 'per_km' ? (
              <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted">
                {copy.delivery.perKmHint}
              </p>
            ) : null}
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Shield size={11} aria-hidden />
            {copy.buyer.deliveryPromise}
          </p>
        </Card>
      </div>

      {/* Schedule */}
      <Card padded>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Clock size={16} className="text-primary" aria-hidden />
          {copy.schedule.title}
          {schedule?.enabled ? (
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isOpen ? 'bg-emerald-500 text-white' : 'bg-danger text-white'}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
              {isOpen ? copy.schedule.openNow : copy.schedule.closedNow}
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
              {copy.schedule.open24Hours}
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs text-muted">{copy.schedule.lead}</p>

        {!schedule?.enabled ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            {copy.schedule.alwaysOpenNote}
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-3 bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted">
              <span>{language === 'bn' ? 'দিন' : 'Day'}</span>
              <span>{language === 'bn' ? 'অবস্থা' : 'Status'}</span>
              <span>{language === 'bn' ? 'সময়' : 'Hours'}</span>
            </div>
            {DAY_ORDER.map((k) => {
              const row = schedule?.days?.[k];
              const dayName = copy.schedule.days[k];
              const isToday = String(schedule?.today_day) === k;
              return (
                <div
                  key={k}
                  className={`grid grid-cols-3 items-center px-3 py-2.5 text-sm ${isToday ? 'bg-primary/5 font-semibold' : 'bg-surface'} border-t border-border first:border-t-0`}
                >
                  <span
                    className={`flex items-center gap-1.5 ${isToday ? 'text-primary' : 'text-text'}`}
                  >
                    {dayName}
                    {isToday ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary">
                        {language === 'bn' ? 'আজ' : 'Today'}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${row?.open ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-surface-2 text-muted'}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${row?.open ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                      aria-hidden
                    />
                    {row?.open ? copy.schedule.dayOpen : copy.schedule.dayClosed}
                  </span>
                  <span className="text-xs tabular-nums text-text">
                    {row?.open
                      ? `${formatHhMm(row.start, language)} – ${formatHhMm(row.end, language)}`
                      : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {schedule?.enabled && schedule?.next_open && !isOpen ? (
          <p className="mt-3 text-sm font-medium text-danger">
            {copy.schedule.opensNextLabel(
              copy.schedule.days[String(schedule.next_open.day) as DayKey] ?? '',
              formatHhMm(schedule.next_open.start, language),
            )}
          </p>
        ) : null}
        {schedule?.enabled && schedule?.closes_at && isOpen ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">
            {copy.schedule.closesAtLabel(formatHhMm(schedule.closes_at, language))}
          </p>
        ) : null}
      </Card>

      {/* Location + delivery area map */}
      <Card padded>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <MapPin size={16} className="text-primary" aria-hidden />
          {language === 'bn' ? 'অবস্থান ও ডেলিভারি এলাকা' : 'Location & delivery area'}
        </h3>
        <p className="mt-1 text-xs text-muted">
          {v.place_label} · {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
        </p>
        <div className="mt-4">
          <VendorLocationMap
            lat={v.lat}
            lng={v.lng}
            placeLabel={v.place_label}
            language={language}
            radiusKm={delivery?.scope === 'radius' ? (delivery?.radius_km ?? null) : null}
            centerLat={delivery?.center_lat ?? null}
            centerLng={delivery?.center_lng ?? null}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-medium text-text">
            <Navigation size={11} aria-hidden />
            {delivery?.scope === 'all_bd'
              ? copy.delivery.allArea
              : delivery?.radius_km
                ? `${delivery.radius_km} km`
                : '—'}
          </span>
          <span className="text-muted">
            {language === 'bn' ? 'কেন্দ্র' : 'Centre'}:{' '}
            {delivery?.center_lat?.toFixed(4) ?? v.lat.toFixed(4)},{' '}
            {delivery?.center_lng?.toFixed(4) ?? v.lng.toFixed(4)}
          </span>
          <Link
            to={`/marketplace/shop/${v.slug}`}
            className="ml-auto font-semibold text-primary hover:underline"
          >
            {language === 'bn' ? 'মেনু দেখুন' : 'View menu'} →
          </Link>
        </div>
      </Card>

      {/* Trust footer */}
      <div className="rounded-2xl bg-primary/5 p-4 text-center">
        <p className="text-sm font-semibold text-text">
          {language === 'bn'
            ? 'BSDC মার্কেটপ্লেস — নিরাপদ ক্যাশ অন ডেলিভারি'
            : 'BSDC Marketplace — safe cash on delivery'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {copy.buyer.codNote} {copy.buyer.trustLine}
        </p>
      </div>
    </div>
  );
}
