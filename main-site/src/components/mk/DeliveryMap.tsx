import { ExternalLink, Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { Button } from '@/design-system';
import { googleMapsDirectionsUrl, openStreetMapUrl } from '@/lib/mk/maps';
import { isBdPoint, type Language } from '@/lib/mk/mk-logic';

/**
 * Where a marketplace order is going, drawn on OpenStreetMap.
 *
 * Vendors need three things from a delivery pin and they are not the same thing:
 * a glanceable position inside the order card ([DeliveryMap]), the same position
 * big enough to reason about ([DeliveryMapDialog]), and one tap that hands the
 * whole trip to whichever navigation app the driver already owns
 * (`googleMapsDirectionsUrl` in `@/lib/mk/maps`). The map is read-only: it never
 * reports a pin back, because a vendor must not be able to move a customer's
 * delivery address.
 */

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Leaflet's default marker image does not survive the bundler and shows as a
 * broken image, so the pin is inline SVG — the same shape the picker uses.
 */
const PIN_SVG =
  '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" style="fill:var(--bsdc-primary)"/><circle cx="15" cy="15" r="6" style="fill:var(--bsdc-on-primary)"/></svg>';

const MAP_COPY = {
  bn: {
    title: 'কাস্টমারের অবস্থান',
    open: 'মানচিত্র বড় করে দেখুন',
    google: 'গুগল ম্যাপে যান',
    osm: 'ওপেনস্ট্রিটম্যাপে দেখুন',
    close: 'বন্ধ করুন',
    unavailable: 'এই অর্ডারে মানচিত্রের অবস্থান নেই।',
    missing: 'মানচিত্র লোড করা যায়নি।',
  },
  en: {
    title: 'Customer location',
    open: 'Open full screen map',
    google: 'Go to Google Maps',
    osm: 'View on OpenStreetMap',
    close: 'Close',
    unavailable: 'This order has no map location.',
    missing: 'The map could not load.',
  },
} as const;

type MapCopy = (typeof MAP_COPY)[Language];

function useCopy(language: Language): MapCopy {
  return MAP_COPY[language];
}

/**
 * Lazily mounts Leaflet, draws one pin, and keeps it fitted to the container.
 * Leaflet and its stylesheet are imported only when a map is actually shown.
 */
function useLeafletPin(
  containerRef: React.RefObject<HTMLDivElement | null>,
  lat: number,
  lng: number,
  opts: { draggable?: boolean; zoom?: number } = {},
) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [failed, setFailed] = useState(false);
  const zoom = opts.zoom ?? 16;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    async function mount(): Promise<void> {
      const node = containerRef.current;
      if (node === null) return;
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled) return;

        map = L.map(node, {
          zoomControl: true,
          attributionControl: true,
          dragging: true,
          scrollWheelZoom: false,
        }).setView([lat, lng], zoom);

        L.tileLayer(TILES, {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const icon = L.divIcon({
          className: 'bsdc-delivery-pin',
          html: PIN_SVG,
          iconSize: [30, 40],
          iconAnchor: [15, 40],
        });
        L.marker([lat, lng], { icon, draggable: opts.draggable === true }).addTo(map);

        mapRef.current = map;
        // The container is inside a card that may still be animating in; one
        // resize after layout settles is enough to keep the tiles aligned.
        window.setTimeout(() => {
          if (!cancelled) mapRef.current?.invalidateSize();
        }, 120);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void mount();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [containerRef, lat, lng, zoom, opts.draggable]);

  return failed;
}

interface DeliveryMapProps {
  lat: number | null;
  lng: number | null;
  language: Language;
  label?: string | undefined;
  heightClassName?: string | undefined;
}

/**
 * Inline map for an order card. Read-only, scroll-wheel-zoom off so it never
 * traps a wheel gesture inside a long order list.
 */
export function DeliveryMap({
  lat,
  lng,
  language,
  label,
  heightClassName = 'h-40',
}: DeliveryMapProps) {
  const copy = useCopy(language);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasPoint = lat !== null && lng !== null && isBdPoint(lat, lng);
  const failed = useLeafletPin(containerRef, lat ?? 0, lng ?? 0, { zoom: 16 });

  if (!hasPoint) {
    return (
      <p className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted">
        {copy.unavailable}
      </p>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border ${heightClassName}`}
      role="img"
      aria-label={label ?? copy.title}
    >
      <div ref={containerRef} className="h-full w-full" />
      {failed ? (
        <span className="absolute inset-0 grid place-items-center bg-surface-2 p-3 text-center text-xs text-muted">
          {copy.missing}
        </span>
      ) : null}
    </div>
  );
}

interface DeliveryMapDialogProps {
  open: boolean;
  onClose: () => void;
  lat: number | null;
  lng: number | null;
  language: Language;
  /** Shown above the map, usually the customer's name and address line. */
  heading?: string | undefined;
}

/**
 * Full-screen delivery map with the two outbound links a driver actually uses.
 * Focus is moved to the close button on open and restored on close, and Escape
 * dismisses: a full-screen overlay that traps a keyboard is not shippable.
 */
export function DeliveryMapDialog({
  open,
  onClose,
  lat,
  lng,
  language,
  heading,
}: DeliveryMapDialogProps) {
  const copy = useCopy(language);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const hasPoint = lat !== null && lng !== null && isBdPoint(lat, lng);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  // Mounting Leaflet into a `hidden` container gives it a zero-size canvas, so
  // the map is only created while the dialog is open.
  const failed = useLeafletPin(open ? containerRef : { current: null }, lat ?? 0, lng ?? 0, {
    zoom: 17,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">{copy.title}</h2>
          {heading ? <p className="mt-0.5 truncate text-sm text-muted">{heading}</p> : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={copy.close}
          className="rounded-full p-2 text-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {hasPoint ? <div ref={containerRef} className="h-full w-full" /> : null}
        {failed || !hasPoint ? (
          <span className="absolute inset-0 grid place-items-center bg-surface-2 p-6 text-center text-sm text-muted">
            {hasPoint ? copy.missing : copy.unavailable}
          </span>
        ) : null}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-border p-4">
        {hasPoint ? (
          <>
            <a
              href={googleMapsDirectionsUrl(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ExternalLink size={16} aria-hidden />
              {copy.google}
            </a>
            <a
              href={openStreetMapUrl(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-text hover:bg-surface-2"
            >
              {copy.osm}
            </a>
          </>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          {copy.close}
        </Button>
      </footer>
    </div>
  );
}

/** The small "open full screen" affordance used on an inline map. */
export function DeliveryMapExpandButton({
  onClick,
  language,
}: {
  onClick: () => void;
  language: Language;
}) {
  const copy = useCopy(language);
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 right-2 z-[500] inline-flex items-center gap-1 rounded-lg bg-surface/95 px-2 py-1 text-xs font-medium text-text shadow-sm hover:bg-surface-2"
    >
      <Maximize2 size={13} aria-hidden />
      {copy.open}
    </button>
  );
}
