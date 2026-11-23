import { MapPin, Navigation, Copy, Check } from 'lucide-react';
import { useRef, useState, useCallback, useEffect } from 'react';
import type { Map as LeafletMap, Circle, Marker } from 'leaflet';
import { googleMapsDirectionsUrl } from '@/lib/mk/maps';
import type { Language } from '@/lib/mk/mk-logic';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const PIN_SVG =
  '<svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true"><defs><filter id="s2" x="-50%" y="-20%" width="200%" height="150%"><feDropShadow dx="0" dy="2" flood-opacity="0.18" stdDeviation="2"/></filter></defs><g filter="url(#s2)"><path d="M17 0C7.6 0 0 7.6 0 17c0 10.8 17 25 17 25s17-14.2 17-25C34 7.6 26.4 0 17 0z" style="fill:var(--bsdc-primary, #0a6b4a)"/><circle cx="17" cy="16.5" r="7" style="fill:#fff"/><circle cx="17" cy="16.5" r="3" style="fill:var(--bsdc-primary, #0a6b4a)"/></g></svg>';

interface Props {
  lat: number;
  lng: number;
  placeLabel: string;
  language: Language;
  radiusKm?: number | null;
  /** Delivery centre, may differ from shop pin for per_km visualisation */
  centerLat?: number | null;
  centerLng?: number | null;
  heightClassName?: string;
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const anchorLat = centerLat ?? lat;
  const anchorLng = centerLng ?? lng;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    async function mount(): Promise<void> {
      const node = containerRef.current;
      if (!node) return;
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled) return;

        const hasRadius = radiusKm !== null && radiusKm > 0 && radiusKm <= 500;

        map = L.map(node, {
          zoomControl: true,
          attributionControl: true,
          dragging: true,
          scrollWheelZoom: false,
          doubleClickZoom: true,
        });

        L.tileLayer(TILES, {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const icon = L.divIcon({
          className: 'bsdc-vendor-pin',
          html: PIN_SVG,
          iconSize: [34, 42],
          iconAnchor: [17, 42],
        });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        markerRef.current.bindPopup(
          `<b style="font-size:13px">${placeLabel.replace(/</g, '&lt;')}</b><br/><span style="font-size:11px;color:#64748b">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>`,
          { closeButton: false },
        );

        if (hasRadius) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          circleRef.current = L.circle([anchorLat, anchorLng], {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            radius: (radiusKm as number) * 1000,
            color: '#0a6b4a',
            weight: 1.8,
            opacity: 0.35,
            fillOpacity: 0.09,
            dashArray: '8 6',
          }).addTo(map);
          map.fitBounds(circleRef.current.getBounds(), { padding: [24, 24], maxZoom: 14 });
        } else {
          map.setView([lat, lng], 15);
        }

        mapRef.current = map;
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
      markerRef.current?.remove();
      circleRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, placeLabel, anchorLat, anchorLng, radiusKm]);

  const handleCopy = useCallback(async () => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [lat, lng]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm ${heightClassName}`}>
      <div ref={containerRef} className="h-full w-full bg-[#e6efe6]" />
      {failed ? (
        <span className="absolute inset-0 grid place-items-center bg-surface-2 p-3 text-center text-xs text-muted">
          {language === 'bn' ? 'মানচিত্র লোড করা যায়নি।' : 'Map could not load.'}
        </span>
      ) : null}

      <div className="pointer-events-none absolute left-2 top-2 hidden sm:block">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-muted shadow-sm backdrop-blur">
          <MapPin size={11} aria-hidden />
          {placeLabel}
        </span>
      </div>

      <div className="absolute bottom-2 right-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1.5 text-xs font-medium text-text shadow-md backdrop-blur hover:bg-surface"
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} aria-hidden />}
          {copied ? (language === 'bn' ? 'কপি হয়েছে' : 'Copied') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
        </button>
        <a
          href={googleMapsDirectionsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-md hover:bg-primary-active"
        >
          <Navigation size={12} aria-hidden />
          {language === 'bn' ? 'দিকনির্দেশনা' : 'Directions'}
        </a>
      </div>
    </div>
  );
}
