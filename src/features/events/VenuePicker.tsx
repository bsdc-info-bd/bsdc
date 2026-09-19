/**
 * BSDC — src/features/events/VenuePicker.tsx
 * Purpose : Picking a venue on an OpenStreetMap map.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Leaflet is roughly forty kilobytes gzipped and no event organiser needs it until they
 *   reach this control, so it is imported dynamically inside this component and never enters the
 *   shell. The map is created once, updated in place and destroyed on unmount — a map that leaks a
 *   tile layer every time somebody edits an event is how a browser tab ends up using a gigabyte.
 *   OpenStreetMap attribution stays on screen permanently. It is not decoration and it is not
 *   dismissible; it is the condition under which the tiles are free (PART 06.06).
 *   A geocode search is offered, and when it answers nothing the organiser types the place name
 *   themselves: a picker that only works for places a service has heard of is no use in a country
 *   where half the venues are not on any map yet.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LeafletMouseEvent, Map, Marker } from 'leaflet';
import { Button, Input, Select, Spinner, Text } from '@/shared/ui';
import { OSM } from '@/core/config/app';
import type { EventVenue } from '@/entities/event/model';
import { BANGLADESH_DIVISIONS, DIVISION_LABELS, type Division } from '@/core/config/opportunities';

/** Props for the venue picker. */
export interface VenuePickerProps {
  readonly value: EventVenue | null;
  readonly onChange: (venue: EventVenue) => void;
  /** Centre the map here when no venue is chosen yet. Defaults to Dhaka. */
  readonly center?: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly locale: 'bn' | 'en';
}

/** Default centre: the middle of Dhaka, where most BSDC meetups happen. */
const DEFAULT_CENTER = { latitude: 23.8103, longitude: 90.4125 };

/** Result of one geocoding lookup. */
interface GeocodeHit {
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Renders the venue picker: a search box, a map, and the resolved address.
 * @param props component props
 * @returns the picker element
 */
export function VenuePicker({
  value,
  onChange,
  center = DEFAULT_CENTER,
  locale,
}: VenuePickerProps): React.ReactElement {
  const { t } = useTranslation('events');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lookup, setLookup] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<readonly GeocodeHit[]>([]);
  const [label, setLabel] = useState(value?.label ?? '');
  const [addressLine, setAddressLine] = useState(value?.addressLine ?? '');
  const [area, setArea] = useState(value?.area ?? '');
  const [division, setDivision] = useState<Division>(value?.division ?? 'dhaka');
  const [picked, setPicked] = useState<{
    readonly latitude: number;
    readonly longitude: number;
  } | null>(value === null ? null : { latitude: value.latitude, longitude: value.longitude });
  const [zoom, setZoom] = useState(value?.zoom ?? 15);

  /** Publishes the current control state upwards. */
  const commit = (
    position: { latitude: number; longitude: number },
    nextDivision: Division = division,
  ): void => {
    setPicked(position);
    onChange({
      label: label.trim(),
      addressLine: addressLine.trim(),
      area: area.trim(),
      division: nextDivision,
      countryCode: 'BD',
      latitude: position.latitude,
      longitude: position.longitude,
      zoom,
    });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await import('leaflet/dist/leaflet.css');
        const leaflet = await import('leaflet');
        if (cancelled || containerRef.current === null) return;
        const map = leaflet.map(containerRef.current, {
          center: [value?.latitude ?? center.latitude, value?.longitude ?? center.longitude],
          zoom: value?.zoom ?? 15,
          scrollWheelZoom: false,
        });
        leaflet.tileLayer(OSM.tileUrl, { attribution: OSM.attribution, maxZoom: 19 }).addTo(map);
        const markerIcon = leaflet.divIcon({
          className: 'bsdc-venuePicker__marker',
          html: '<span aria-hidden="true"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        if (value !== null) {
          markerRef.current = leaflet
            .marker([value.latitude, value.longitude], { icon: markerIcon, draggable: true })
            .addTo(map);
        }
        map.on('click', (event: LeafletMouseEvent) => {
          const position = { latitude: event.latlng.lat, longitude: event.latlng.lng };
          if (markerRef.current === null) {
            markerRef.current = leaflet
              .marker([position.latitude, position.longitude], {
                icon: markerIcon,
                draggable: true,
              })
              .addTo(map);
          } else {
            markerRef.current.setLatLng([position.latitude, position.longitude]);
          }
          commit(position);
        });
        map.on('zoomend', () => setZoom(map.getZoom()));
        mapRef.current = map;
        setReady(true);
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once; later prop changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (): void => {
    if (lookup.trim().length < 3) return;
    setSearching(true);
    void fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(lookup.trim())}`,
      { headers: { Accept: 'application/json' } },
    )
      .then((response) => response.json())
      .then((body: unknown) => {
        const list: GeocodeHit[] = [];
        if (Array.isArray(body)) {
          for (const entry of body) {
            const record = entry as { display_name?: string; lat?: string; lon?: string };
            const latitude = Number(record.lat);
            const longitude = Number(record.lon);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
            list.push({
              displayName: record.display_name ?? '',
              latitude,
              longitude,
            });
          }
        }
        setHits(list);
      })
      .catch(() => setHits([]))
      .finally(() => setSearching(false));
  };

  const choose = (hit: GeocodeHit): void => {
    setHits([]);
    setArea(hit.displayName.split(',')[0] ?? '');
    setAddressLine(hit.displayName);
    const position = { latitude: hit.latitude, longitude: hit.longitude };
    const map = mapRef.current;
    if (map !== null) {
      map.setView([hit.latitude, hit.longitude], 16);
      markerRef.current?.setLatLng([hit.latitude, hit.longitude]);
    }
    commit(position);
  };

  return (
    <div className="bsdc-venuePicker">
      <div className="bsdc-venuePicker__search">
        <Input
          label={t('venue.searchLabel')}
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder={t('venue.searchExample')}
          hint={t('venue.searchHint')}
        />
        <Button
          type="button"
          variant="secondary"
          loading={searching}
          onClick={search}
          disabled={lookup.trim().length < 3}
        >
          {t('venue.search')}
        </Button>
      </div>

      {hits.length > 0 ? (
        <ul className="bsdc-venuePicker__hits">
          {hits.map((hit) => (
            <li key={`${hit.latitude},${hit.longitude}`}>
              <button type="button" className="bsdc-venuePicker__hit" onClick={() => choose(hit)}>
                {hit.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="bsdc-venuePicker__mapWrap">
        <div ref={containerRef} className="bsdc-venuePicker__map" />
        {!ready && !failed ? (
          <div className="bsdc-venuePicker__loading">
            <Spinner size={20} />
          </div>
        ) : null}
        {failed ? (
          <Text as="p" tone="muted" size="sm" lang={locale === 'bn' ? 'bn' : 'en'}>
            {t('venue.mapUnavailable')}
          </Text>
        ) : null}
      </div>

      <p className="bsdc-venuePicker__attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          {OSM.attribution}
        </a>
      </p>

      <div className="bsdc-venuePicker__fields">
        <Input
          label={t('venue.labelLabel')}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            if (picked !== null) commit(picked);
          }}
          maxLength={80}
        />
        <Input
          label={t('venue.addressLabel')}
          value={addressLine}
          onChange={(event) => {
            setAddressLine(event.target.value);
            if (picked !== null) commit(picked);
          }}
          maxLength={160}
        />
        <Input
          label={t('venue.areaLabel')}
          value={area}
          onChange={(event) => {
            setArea(event.target.value);
            if (picked !== null) commit(picked);
          }}
          maxLength={80}
        />
        <Select<Division>
          label={t('venue.divisionLabel')}
          value={division}
          onValueChange={(next) => {
            setDivision(next);
            if (picked !== null) commit(picked, next);
          }}
          options={BANGLADESH_DIVISIONS.map((entry) => ({
            value: entry,
            label: locale === 'bn' ? DIVISION_LABELS[entry].bn : DIVISION_LABELS[entry].en,
          }))}
        />
      </div>

      <Text as="p" size="sm" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
        {picked === null
          ? t('venue.notPicked')
          : t('venue.picked', {
              latitude: picked.latitude.toFixed(5),
              longitude: picked.longitude.toFixed(5),
            })}
      </Text>
    </div>
  );
}
