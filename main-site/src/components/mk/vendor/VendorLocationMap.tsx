import { Check, Copy, MapPin, Navigation } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeliveryMapView } from '@/components/mk/DeliveryMap';
import { googleMapsDirectionsUrl } from '@/lib/mk/maps';
import type { Language } from '@/lib/mk/mk-logic';

/**
 * The shop's own pin, with its delivery area drawn as a ring.
 *
 * This used to be a second, private Leaflet implementation — its own tile
 * layer, its own pin, its own popup with hand-escaped HTML, its own resize
 * timer — which is how it drifted from the delivery map: a light-only
 * background, a pin colour written as a hex, and a copy button that turned
 * green with a class no theme defines. It is now the shared surface plus the
 * two controls this card needs, so there is one Leaflet integration in the
 * marketplace and one place to fix it.
 */

interface Props {
  lat: number;
  lng: number;
  placeLabel: string;
  language: Language;
  radiusKm?: number | null;
  /** Delivery centre, which may differ from the shop pin. */
  centerLat?: number | null;
  centerLng?: number | null;
  heightClassName?: string;
}

const COPY = {
  bn: {
    pin: 'দোকানের পিন',
    mapLabel: 'দোকানের অবস্থান ও ডেলিভারি এলাকা',
    copied: 'কপি হয়েছে',
    copy: 'কোঅর্ডিনেট কপি',
    directions: 'দিকনির্দেশনা',
    unavailable: 'এই দোকানের মানচিত্রের অবস্থান নেই।',
    loading: 'মানচিত্র লোড হচ্ছে…',
    loadFailed: 'মানচিত্র লোড করা যায়নি।',
    locateDenied: 'আপনার অবস্থান পাওয়া যায়নি',
    locateUnsupported: 'এই ব্রাউজারে লোকেশন সাপোর্ট নেই',
    radius: 'ডেলিভারি এলাকা',
    googleMaps: 'গুগল ম্যাপে খুলুন',
    googleMapsShort: 'গুগল ম্যাপ',
  },
  en: {
    pin: 'Shop pin',
    mapLabel: 'Shop location and delivery area',
    copied: 'Copied',
    copy: 'Copy coords',
    directions: 'Directions',
    unavailable: 'This shop has no map location.',
    loading: 'Loading map…',
    loadFailed: 'The map could not load.',
    locateDenied: 'Could not get your location',
    locateUnsupported: 'Location is not supported in this browser',
    radius: 'Delivery area',
    googleMaps: 'Open in Google Maps',
    googleMapsShort: 'Google Maps',
  },
} as const;

export function VendorLocationMap({
  lat,
  lng,
  placeLabel,
  language,
  radiusKm = null,
  centerLat = null,
  centerLng = null,
  heightClassName = 'h-56 sm:h-72',
}: Props) {
  const copy = COPY[language];
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const withRing = radiusKm !== null && radiusKm > 0 && radiusKm <= 500;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = useCallback(async () => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [lat, lng]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm ${heightClassName}`}
    >
      <DeliveryMapView
        lat={lat}
        lng={lng}
        label={copy.mapLabel}
        title={copy.mapLabel}
        placeLabel={placeLabel}
        copy={copy}
        radiusKm={radiusKm}
        centerLat={centerLat}
        centerLng={centerLng}
        showCircle={withRing}
        zoom={withRing ? 13 : 15}
        // 44 px of control chrome sits over the bottom edge of this card.
        reservedBottom={56}
      />

      <div className="pointer-events-none absolute inset-x-2 top-2 z-20 hidden sm:block">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface/95 px-2.5 py-1 text-2xs font-medium text-text shadow-sm backdrop-blur">
          <MapPin size={11} className="text-primary" aria-hidden />
          <span className="fab-truncate">{placeLabel}</span>
        </span>
      </div>

      <div className="absolute bottom-2 right-2 z-20 flex flex-wrap justify-end gap-1.5">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-2.5 py-1.5 text-2xs font-medium text-text shadow-sm backdrop-blur transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={copy.copy}
        >
          {copied ? (
            <Check size={12} className="text-primary" aria-hidden />
          ) : (
            <Copy size={12} aria-hidden />
          )}
          <span className="tabular-nums">
            {copied ? copy.copied : `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
          </span>
        </button>
        <a
          href={googleMapsDirectionsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary shadow-sm transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Navigation size={12} aria-hidden />
          {copy.directions}
        </a>
      </div>
    </div>
  );
}
