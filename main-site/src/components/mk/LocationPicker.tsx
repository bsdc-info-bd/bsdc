import { LocateFixed, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Circle, Map as LeafletMap, Marker } from 'leaflet';
import { Button, TextField } from '@/design-system';
import { tokenColor } from '@/design-system/color';
import { BD_CENTER, isBdPoint, type Language, SYLHET_CENTER } from '@/lib/mk/mk-logic';

export interface PinnedLocation {
  lat: number;
  lng: number;
  label: string;
}

interface LocationPickerProps {
  value: PinnedLocation | null;
  onChange: (next: PinnedLocation) => void;
  language: Language;
  labels: { title: string; hint: string; search: string; useCurrent: string; outside: string };
  /** Optional delivery radius in km, drawn as a circle around `circleCenter` (or `value` when omitted). */
  radiusKm?: number | null;
  /** Optional fixed centre for the delivery radius circle (used on customer checkout). */
  circleCenter?: { lat: number; lng: number } | null;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * The delivery pin is drawn in SVG rather than loaded from Leaflet's default
 * marker image, which does not survive the bundler and shows as a broken image.
 */
const PIN_SVG =
  '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" style="fill:var(--bsdc-primary)"/><circle cx="15" cy="15" r="6" style="fill:var(--bsdc-on-primary)"/></svg>';

/**
 * OpenStreetMap pin with place search and "use my location". Leaflet and its
 * stylesheet load only when the picker mounts, so the rest of the app pays
 * nothing for the map. Search results are restricted to Bangladesh.
 */
export function LocationPicker({
  value,
  onChange,
  language,
  labels,
  radiusKm = null,
  circleCenter = null,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const onChangeRef = useRef(onChange);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;
    if (node === null) return;

    void (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || node === null || mapRef.current !== null) return;

      const start = value ?? { ...SYLHET_CENTER, label: '' };
      const map = L.map(node, { scrollWheelZoom: false }).setView(
        [start.lat, start.lng],
        value ? 16 : 13,
      );
      L.tileLayer(TILES, {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'bsdc-map-pin',
        html: PIN_SVG,
        iconSize: [30, 40],
        iconAnchor: [15, 40],
      });
      const marker = L.marker([start.lat, start.lng], { draggable: true, icon: pinIcon }).addTo(
        map,
      );
      marker.on('dragend', () => {
        const at = marker.getLatLng();
        void report(at.lat, at.lng);
      });
      map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(event.latlng);
        void report(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = null;
      setReady(true);
      // Leaflet measures the container on creation; re-measure after layout.
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // The map is created once; later value changes move the marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw or remove the delivery radius circle around `circleCenter` (or the pin).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;
    void (async () => {
      const L = await import('leaflet');
      circleRef.current?.remove();
      circleRef.current = null;
      const anchor = circleCenter ?? value;
      if (radiusKm === null || radiusKm <= 0 || anchor === null) return;
      circleRef.current = L.circle([anchor.lat, anchor.lng], {
        radius: radiusKm * 1000,
        // Leaflet writes this into an SVG attribute, where var() does not
        // resolve, so the token is read from the document instead.
        color: tokenColor('--bsdc-blue-fill', '#1461c9'),
        weight: 2,
        fillOpacity: 0.12,
      }).addTo(map);
    })();
  }, [radiusKm, circleCenter, value, ready]);

  // Keep the marker in step with the value the parent holds.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map === null || marker === null || value === null) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - value.lat) > 1e-6 || Math.abs(current.lng - value.lng) > 1e-6) {
      marker.setLatLng([value.lat, value.lng]);
      map.panTo([value.lat, value.lng]);
    }
  }, [value]);

  async function report(lat: number, lng: number): Promise<void> {
    if (!isBdPoint(lat, lng)) {
      setMessage(labels.outside);
      return;
    }
    setMessage('');
    const label = await reverseLabel(lat, lng, language);
    onChangeRef.current({ lat, lng, label });
  }

  async function search(): Promise<void> {
    const text = query.trim();
    if (text.length < 3) return;
    try {
      const url = `${NOMINATIM}/search?format=jsonv2&countrycodes=bd&limit=5&accept-language=${
        language === 'bn' ? 'bn,en' : 'en'
      }&q=${encodeURIComponent(text)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      setHits((await response.json()) as NominatimHit[]);
    } catch {
      setMessage(labels.search);
    }
  }

  function choose(hit: NominatimHit): void {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    setHits([]);
    setQuery(hit.display_name);
    mapRef.current?.setView([lat, lng], 16);
    markerRef.current?.setLatLng([lat, lng]);
    void report(lat, lng);
  }

  function useCurrent(): void {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        mapRef.current?.setView([latitude, longitude], 17);
        markerRef.current?.setLatLng([latitude, longitude]);
        void report(latitude, longitude);
      },
      () => setMessage(labels.search),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-text">{labels.title}</p>
        <p className="text-xs text-muted">{labels.hint}</p>
      </div>

      <div className="relative">
        <TextField
          label={labels.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
          iconStart={<Search size={16} aria-hidden />}
          addonEnd={
            <Button type="button" variant="outline" size="sm" onClick={() => void search()}>
              {labels.search}
            </Button>
          }
        />
        {hits.length > 0 ? (
          <ul
            role="listbox"
            className="absolute z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg"
          >
            {hits.map((hit) => (
              <li key={`${hit.lat},${hit.lon}`}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => choose(hit)}
                >
                  {hit.display_name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        ref={containerRef}
        role="application"
        aria-label={labels.title}
        className="h-64 w-full overflow-hidden rounded-2xl border border-border sm:h-80"
        data-ready={ready ? 'true' : 'false'}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          iconStart={<LocateFixed size={16} />}
          onClick={useCurrent}
        >
          {labels.useCurrent}
        </Button>
        {value ? (
          <p className="min-w-0 truncate text-xs text-muted">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            {value.label ? ` · ${value.label}` : ''}
          </p>
        ) : (
          <p className="text-xs text-muted">{`${BD_CENTER.lat.toFixed(2)}, ${BD_CENTER.lng.toFixed(2)}`}</p>
        )}
      </div>

      {message ? (
        <p role="status" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

async function reverseLabel(lat: number, lng: number, language: Language): Promise<string> {
  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=18&accept-language=${
      language === 'bn' ? 'bn,en' : 'en'
    }&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return '';
    const data = (await response.json()) as { display_name?: string };
    return data.display_name ?? '';
  } catch {
    return '';
  }
}
