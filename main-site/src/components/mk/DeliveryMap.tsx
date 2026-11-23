import {
  AlertCircle,
  ArrowLeft,
  Check,
  Compass,
  Copy,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Phone,
  Share2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  Circle as LeafletCircle,
  LatLngBoundsExpression,
  LeafletMouseEvent,
  Map as LeafletMap,
  Marker as LeafletMarker,
} from 'leaflet';
import { toast } from 'sonner';
import { Button } from '@/design-system';
import {
  MAP_ACCENT_FALLBACK,
  MAP_PIN_FILL_FALLBACK,
  MAP_PIN_INK_FALLBACK,
  paintToken,
} from '@/design-system/paint';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useMeasuredHeight } from '@/hooks/use-measured-height';
import { googleMapsDirectionsUrl, googleMapsViewUrl } from '@/lib/mk/maps';
import { isBdPoint, type Language } from '@/lib/mk/mk-logic';

/**
 * Where a delivery is going — one map, two presentations, no layout surprises.
 *
 * A vendor reads a pin in two places: inline in the order card, where it answers
 * "is this near me?" at a glance, and full-screen, where it answers "how do I
 * get there?" in one tap. Both are drawn by the same machine below, so a fix to
 * one cannot leave the other behind.
 *
 * ## What was wrong with the previous full-screen map
 *
 * It was a `fixed inset-0` panel rendered **in the page tree**. The order list
 * lives inside cards with `overflow: hidden` and a stacking context of their
 * own, so the overlay was clipped by an ancestor, its `z-50` competed with a
 * header's `z-40` from a different context, and the map's container measured
 * zero at mount — which is why tiles arrived blank until the window happened to
 * be resized. The bottom sheet was a static card with a decorative handle, its
 * two-row action area could push the map off a 375 px screen, and an early
 * unmount left `body { overflow: hidden }` behind on the page.
 *
 * ## How this one is built
 *
 * - **Portal to `document.body`.** The overlay escapes every ancestor's
 *   `overflow`, `transform` and stacking context: the parent page cannot clip
 *   it, and it cannot shift the parent's layout by a pixel.
 * - **Isolated map surface.** Leaflet's own panes run at `z-index` 200–800. The
 *   map container is `isolation: isolate` (`bsdc-map-surface`), so those numbers
 *   order *inside* the map; the floating chrome above it is ordered by this
 *   file. That is the end of the z-index fight.
 * - **Measured, not guessed.** The top bar and the bottom sheet report their
 *   heights through `ResizeObserver` (`useMeasuredHeight`), and those numbers
 *   are then used to keep the pin out from under the chrome, to dock the control
 *   column above the sheet, and to re-measure the map after every change.
 * - **One map, re-measured.** The Leaflet instance is created once per open and
 *   never re-created for a prop change; `invalidateSize()` runs from a
 *   frame-throttled callback on container resize, window resize, orientation
 *   change and sheet drag.
 * - **Chrome that matches the native app.** Floating pill bar, coordinate chip
 *   with copy, a 44 px control dock, and a 20 px-radius bottom sheet with a real
 *   drag handle and the two action rows a driver actually uses.
 *
 * Nothing here writes a colour: the pin and the radius ring are SVG strings, so
 * the two colours Leaflet cannot resolve from a `var()` are read out of the
 * document through `design-system/paint.ts`.
 */

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** The pin, as the string Leaflet's `divIcon` is handed. */
function pinSvg(): string {
  const fill = paintToken('--bsdc-primary', MAP_PIN_FILL_FALLBACK);
  const ink = MAP_PIN_INK_FALLBACK;
  return [
    '<svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true">',
    '<defs><filter id="bsdc-pin-shadow" x="-50%" y="-20%" width="200%" height="150%">',
    '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.28"/></filter></defs>',
    `<g filter="url(#bsdc-pin-shadow)">`,
    `<path d="M18 0C8.06 0 0 8.06 0 18c0 11.25 18 26 18 26s18-14.75 18-26C36 8.06 27.94 0 18 0z" fill="${fill}"/>`,
    `<circle cx="18" cy="17.2" r="7.5" fill="${ink}"/>`,
    `<circle cx="18" cy="17.2" r="3.2" fill="${fill}"/>`,
    '</g></svg>',
  ].join('');
}

export interface DeliveryMapPoint {
  lat: number;
  lng: number;
}

const MAP_COPY = {
  bn: {
    title: 'ডেলিভারি লোকেশন',
    mapLabel: 'ডেলিভারির পিন',
    live: 'সরাসরি',
    close: 'বন্ধ করুন',
    back: 'ফিরে যান',
    open: 'পূর্ণ পর্দায় দেখুন',
    showMapOnly: 'শুধু মানচিত্র দেখান',
    showDetails: 'বিস্তারিত দেখান',
    showSheet: 'ঠিকানা দেখান',
    collapseSheet: 'ঠিকানা গুটিয়ে ফেলুন',
    address: 'ঠিকানা',
    copyCoords: 'কোঅর্ডিনেট কপি',
    copied: 'কপি হয়েছে',
    copyFailed: 'কপি করা যায়নি',
    share: 'শেয়ার',
    shareTitle: 'ডেলিভারি লোকেশন',
    directions: 'দিকনির্দেশনা',
    googleMaps: 'গুগল ম্যাপে খুলুন',
    googleMapsShort: 'গুগল ম্যাপ',
    zoomIn: 'জুম ইন',
    zoomOut: 'জুম আউট',
    locate: 'আমার অবস্থান',
    recenter: 'পিনে ফিরে যান',
    loading: 'মানচিত্র লোড হচ্ছে…',
    unavailable: 'এই অর্ডারে মানচিত্রের অবস্থান নেই।',
    loadFailed: 'মানচিত্র লোড করা যায়নি।',
    locateDenied: 'আপনার অবস্থান পাওয়া যায়নি',
    locateUnsupported: 'এই ব্রাউজারে লোকেশন সাপোর্ট নেই',
    radius: 'ডেলিভারি এলাকা',
  },
  en: {
    title: 'Delivery location',
    mapLabel: 'Delivery pin',
    live: 'Live',
    close: 'Close',
    back: 'Go back',
    open: 'Open full screen map',
    showMapOnly: 'Show map only',
    showDetails: 'Show details',
    showSheet: 'Show address',
    collapseSheet: 'Collapse address',
    address: 'Address',
    copyCoords: 'Copy coords',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    share: 'Share',
    shareTitle: 'Delivery location',
    directions: 'Directions',
    googleMaps: 'Open in Google Maps',
    googleMapsShort: 'Google Maps',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    locate: 'My location',
    recenter: 'Back to pin',
    loading: 'Loading map…',
    unavailable: 'This order has no map location.',
    loadFailed: 'The map could not load.',
    locateDenied: 'Could not get your location',
    locateUnsupported: 'Location is not supported in this browser',
    radius: 'Delivery area',
  },
} as const;

/**
 * The only strings the surface itself needs. Named separately so a caller with
 * its own wording — the shop's location card, say — can use the shared map
 * without importing the delivery dialog's whole vocabulary.
 */
export interface MapSurfaceCopy {
  loading: string;
  unavailable: string;
  loadFailed: string;
  locateDenied: string;
  locateUnsupported: string;
  googleMaps: string;
}

/** Street-level precision, six decimals, no locale-shaped separators. */
function coordsText(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** Clipboard with a legacy fallback: the async API is absent in insecure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      document.body.removeChild(area);
      return done;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// The map machine
// ---------------------------------------------------------------------------

interface LeafletViewOptions {
  lat: number;
  lng: number;
  /** Circle centre when it is not the pin (a shop's delivery area). */
  centerLat: number | null;
  centerLng: number | null;
  zoom: number;
  interactiveZoom: boolean;
  draggable: boolean;
  showCircle: boolean;
  radiusKm: number | null;
  /** Floating chrome the pin has to stay clear of, in CSS pixels. */
  reservedTop: number;
  reservedBottom: number;
  onLocationSelect: ((point: DeliveryMapPoint) => void) | undefined;
  labels: { locateDenied: string; locateUnsupported: string };
}

type MapStatus = 'loading' | 'ready' | 'error';

interface LeafletView {
  containerRef: React.RefObject<HTMLDivElement>;
  status: MapStatus;
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
  locate: () => void;
  /** Re-measure the container, once per animation frame. */
  invalidate: () => void;
  /** Re-centre the pin inside the band that the chrome leaves visible. */
  reframe: () => void;
}

/**
 * Creates exactly one Leaflet instance for as long as the map is on screen.
 *
 * The options bag is held in a ref and refreshed on every render, so a new
 * `lat` or a new callback *informs* the live map instead of tearing it down. A
 * map re-created on each render is what makes tiles flash, an in-flight drag
 * drop, and a popup vanish for no reason the user can name. Position, radius
 * and interactivity are applied by small effects below, each touching one
 * layer.
 *
 * `epoch` is the counter that tells those effects the instance now exists: the
 * import is asynchronous, so they would otherwise run once against `null` and
 * never again.
 */
function useLeafletView(active: boolean, options: LeafletViewOptions): LeafletView {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circleRef = useRef<LeafletCircle | null>(null);
  const frameRef = useRef(0);
  const teardownRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [epoch, setEpoch] = useState(0);

  const latest = useRef(options);
  latest.current = options;

  /**
   * Re-measure, at most once per frame.
   *
   * A sheet drag emits a resize event per pointer move; calling
   * `invalidateSize()` on each one re-tiles the map dozens of times a second for
   * nothing anyone can see.
   */
  const invalidate = useCallback(() => {
    if (frameRef.current !== 0) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      mapRef.current?.invalidateSize({ animate: false, pan: false });
    });
  }, []);

  /**
   * Put the point in the middle of the *visible* map rather than the middle of
   * the viewport: under a bottom sheet, the geometric centre reads as "too low"
   * and the pin can end up behind the sheet entirely.
   */
  const centreWithChrome = useCallback(
    (map: LeafletMap, lat: number, lng: number, zoom: number) => {
      const { reservedTop, reservedBottom } = latest.current;
      map.setView([lat, lng], zoom, { animate: false });
      const shift = (reservedBottom - reservedTop) / 2;
      // `panBy` moves the map's *content*, so a positive y carries the pin up
      // the screen. The half-band offset is therefore added, not subtracted:
      // this is the arithmetic that decides whether a vendor sees the pin or
      // sees the bottom sheet.
      if (Math.abs(shift) > 4) map.panBy([0, shift], { animate: false });
    },
    [],
  );

  const reframe = useCallback(() => {
    const map = mapRef.current;
    if (map === null) return;
    map.invalidateSize({ animate: false, pan: false });
    const { showCircle, radiusKm, lat, lng, zoom } = latest.current;
    // A radius ring is framed by its bounds, not by the pin: re-centring here
    // would push half the delivery area off screen.
    if (showCircle && radiusKm !== null && radiusKm > 0) return;
    centreWithChrome(map, lat, lng, Math.max(map.getZoom(), Math.min(zoom, 17)));
  }, [centreWithChrome]);

  useEffect(() => {
    if (!active) return;
    const node = containerRef.current;
    if (node === null) return;

    let cancelled = false;
    setStatus('loading');

    void (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled) return;

        const start = latest.current;
        const map = L.map(node, {
          zoomControl: false,
          attributionControl: true,
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: start.interactiveZoom,
          boxZoom: false,
          keyboard: true,
          minZoom: 4,
          maxZoom: 19,
        });
        mapRef.current = map;

        const tiles = L.tileLayer(TILES, {
          maxZoom: 19,
          attribution: TILE_ATTRIBUTION,
          crossOrigin: true,
        }).addTo(map);

        const icon = L.divIcon({
          className: 'bsdc-map-pin',
          html: pinSvg(),
          iconSize: [36, 44],
          iconAnchor: [18, 44],
          popupAnchor: [0, -44],
        });
        const marker = L.marker([start.lat, start.lng], {
          icon,
          draggable: start.draggable,
          keyboard: false,
          // The surrounding dialog announces the location in words; a marker
          // with its own focus stop would double up on that.
          alt: '',
        }).addTo(map);
        markerRef.current = marker;

        /**
         * The pin is an SVG string painted from a token, and a string does not
         * re-read a token when the theme changes: switching to dark would leave
         * a dark-green pin that had just become invisible on a dark map. So the
         * attribute that drives every other colour in the app drives the pin
         * too, and the ring is re-inked at the same time.
         */
        const repaint = (): void => {
          marker.setIcon(
            L.divIcon({
              className: 'bsdc-map-pin',
              html: pinSvg(),
              iconSize: [36, 44],
              iconAnchor: [18, 44],
              popupAnchor: [0, -44],
            }),
          );
          circleRef.current?.setStyle({
            color: paintToken('--bsdc-primary', MAP_ACCENT_FALLBACK),
          });
        };
        const themeObserver =
          typeof MutationObserver === 'undefined' ? null : new MutationObserver(repaint);
        themeObserver?.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        });

        const report = (lat: number, lng: number): void => {
          latest.current.onLocationSelect?.({ lat, lng });
        };
        map.on('click', (event: LeafletMouseEvent) => {
          if (latest.current.onLocationSelect === undefined) return;
          marker.setLatLng(event.latlng);
          report(event.latlng.lat, event.latlng.lng);
        });
        marker.on('dragend', () => {
          const at = marker.getLatLng();
          report(at.lat, at.lng);
        });

        // Frame once with whatever reserve is known now; `reframe` is called
        // again by the caller as soon as the chrome reports its real height.
        if (start.showCircle && start.radiusKm !== null && start.radiusKm > 0) {
          const probe = L.circle([start.centerLat ?? start.lat, start.centerLng ?? start.lng], {
            radius: start.radiusKm * 1000,
            opacity: 0,
            fillOpacity: 0,
          }).addTo(map);
          map.fitBounds(probe.getBounds() as LatLngBoundsExpression, {
            paddingTopLeft: [32, start.reservedTop + 32],
            paddingBottomRight: [32, start.reservedBottom + 32],
            maxZoom: 15,
            animate: false,
          });
          probe.remove();
        } else {
          centreWithChrome(map, start.lat, start.lng, start.zoom);
        }

        // Three chances to measure right: the frame the overlay paints in, the
        // frame after the enter transition, and one late tick for a slow font
        // swap. A single `invalidateSize()` at mount is what used to leave the
        // full-screen map half white until the window was resized.
        const settle = (): void => {
          if (!cancelled) map.invalidateSize({ animate: false, pan: false });
        };
        settle();
        const firstFrame = window.requestAnimationFrame(settle);
        const settleTimer = window.setTimeout(settle, 240);

        let announced = false;
        const announce = (): void => {
          if (cancelled || announced) return;
          announced = true;
          setStatus('ready');
        };
        tiles.once('load', announce);
        // Tiles on an offline device never fire `load`; the map is still usable,
        // so the spinner must not become a permanent state.
        const readyTimer = window.setTimeout(announce, 1500);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => invalidate());
          observer.observe(node);
        }
        const onWindowResize = (): void => invalidate();
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('orientationchange', onWindowResize);

        teardownRef.current = () => {
          window.cancelAnimationFrame(firstFrame);
          window.clearTimeout(settleTimer);
          window.clearTimeout(readyTimer);
          window.removeEventListener('resize', onWindowResize);
          window.removeEventListener('orientationchange', onWindowResize);
          themeObserver?.disconnect();
          observer?.disconnect();
        };

        setEpoch((value) => value + 1);
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      teardownRef.current?.();
      teardownRef.current = null;
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      circleRef.current?.remove();
      markerRef.current?.remove();
      mapRef.current?.remove();
      circleRef.current = null;
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [active, centreWithChrome, invalidate]);

  // --- pin position -------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!active || epoch === 0 || map === null || marker === null) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - options.lat) < 1e-9 && Math.abs(current.lng - options.lng) < 1e-9) {
      return;
    }
    marker.setLatLng([options.lat, options.lng]);
    centreWithChrome(map, options.lat, options.lng, map.getZoom());
  }, [active, epoch, options.lat, options.lng, centreWithChrome]);

  // --- delivery radius / area ring ---------------------------------------
  //
  // Only the ring's own four values are dependencies: re-running this because
  // the pin moved would throw away a ring that is still correct, and re-running
  // it on a zoom would re-fit the bounds the user just chose.
  const { showCircle: ringOn, radiusKm: ringKm, centerLat: ringLat, centerLng: ringLng } = options;
  const ringPinLat = options.lat;
  const ringPinLng = options.lng;

  useEffect(() => {
    const map = mapRef.current;
    if (!active || epoch === 0 || map === null) return;
    let cancelled = false;

    void (async () => {
      const L = await import('leaflet');
      if (cancelled) return;
      circleRef.current?.remove();
      circleRef.current = null;
      if (!ringOn || ringKm === null || ringKm <= 0) return;
      const ring = L.circle([ringLat ?? ringPinLat, ringLng ?? ringPinLng], {
        radius: ringKm * 1000,
        // Leaflet writes this into an SVG attribute, where `var()` does not
        // resolve, so the token is read out of the document instead.
        color: paintToken('--bsdc-primary', MAP_ACCENT_FALLBACK),
        weight: 1.5,
        opacity: 0.55,
        fillOpacity: 0.09,
        dashArray: '8 6',
      }).addTo(map);
      circleRef.current = ring;
      map.fitBounds(ring.getBounds() as LatLngBoundsExpression, {
        paddingTopLeft: [32, latest.current.reservedTop + 32],
        paddingBottomRight: [32, latest.current.reservedBottom + 32],
        maxZoom: 15,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [active, epoch, ringOn, ringKm, ringLat, ringLng, ringPinLat, ringPinLng]);

  // --- marker interactivity & wheel zoom ----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!active || epoch === 0 || map === null) return;
    const marker = markerRef.current;
    if (marker !== null) {
      if (options.draggable) marker.dragging?.enable();
      else marker.dragging?.disable();
    }
    if (options.interactiveZoom) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [active, epoch, options.draggable, options.interactiveZoom]);

  const zoomIn = useCallback(() => {
    mapRef.current?.zoomIn(1, { animate: true });
  }, []);
  const zoomOut = useCallback(() => {
    mapRef.current?.zoomOut(1, { animate: true });
  }, []);

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (map === null) return;
    const { lat, lng, reservedTop, reservedBottom } = latest.current;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.5, easeLinearity: 0.22 });
    const shift = (reservedBottom - reservedTop) / 2;
    if (Math.abs(shift) > 4) {
      map.once('moveend', () => map.panBy([0, shift], { animate: true }));
    }
  }, []);

  const locate = useCallback(() => {
    const labels = latest.current.labels;
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      toast.error(labels.locateUnsupported);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo([position.coords.latitude, position.coords.longitude], 16, {
          duration: 0.6,
        });
      },
      () => toast.error(labels.locateDenied),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  return useMemo(
    () => ({ containerRef, status, zoomIn, zoomOut, recenter, locate, invalidate, reframe }),
    [status, zoomIn, zoomOut, recenter, locate, invalidate, reframe],
  );
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export interface DeliveryMapViewProps {
  lat: number | null;
  lng: number | null;
  /** Read by assistive technology; also the title of the loading state. */
  label: string;
  placeLabel?: string | undefined;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
  title?: string | undefined;
  interactiveZoom?: boolean | undefined;
  draggable?: boolean | undefined;
  showCircle?: boolean | undefined;
  onReady?: (() => void) | undefined;
  onLocationSelect?: ((point: DeliveryMapPoint) => void) | undefined;
  /** Floating chrome the map must frame around, in CSS pixels. */
  reservedTop?: number | undefined;
  reservedBottom?: number | undefined;
  zoom?: number | undefined;
  copy: MapSurfaceCopy;
  className?: string | undefined;
  /** Chrome the caller draws inside the same isolated surface. */
  children?: React.ReactNode;
  onView?: ((view: LeafletView) => void) | undefined;
}

/**
 * A Leaflet surface with a pin, an optional radius ring, and designed
 * empty/loading/error states. It owns its container's box and nothing else,
 * which is why it drops into a card and into a full-screen portal unchanged.
 */
export function DeliveryMapView({
  lat,
  lng,
  label,
  placeLabel,
  centerLat = null,
  centerLng = null,
  radiusKm = null,
  title,
  interactiveZoom = false,
  draggable = false,
  showCircle = false,
  onReady,
  onLocationSelect,
  reservedTop = 0,
  reservedBottom = 0,
  zoom = 16,
  copy,
  className,
  children,
  onView,
}: DeliveryMapViewProps) {
  const hasPoint = isBdPoint(lat, lng);
  const options = useMemo<LeafletViewOptions>(
    () => ({
      lat: lat ?? 0,
      lng: lng ?? 0,
      centerLat,
      centerLng,
      zoom,
      interactiveZoom,
      draggable,
      showCircle: showCircle && radiusKm !== null && radiusKm > 0,
      radiusKm,
      reservedTop,
      reservedBottom,
      onLocationSelect,
      labels: { locateDenied: copy.locateDenied, locateUnsupported: copy.locateUnsupported },
    }),
    [
      lat,
      lng,
      centerLat,
      centerLng,
      zoom,
      interactiveZoom,
      draggable,
      showCircle,
      radiusKm,
      reservedTop,
      reservedBottom,
      onLocationSelect,
      copy.locateDenied,
      copy.locateUnsupported,
    ],
  );

  const view = useLeafletView(hasPoint, options);

  useEffect(() => {
    onView?.(view);
  }, [onView, view]);

  // The caller's readiness callback is reported by a ref, so a parent that
  // re-renders (which changes its callback's identity) cannot re-fire it.
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const statusRef = useRef(view.status);
  statusRef.current = view.status;
  useEffect(() => {
    if (view.status === 'ready') readyRef.current?.();
  }, [view.status]);

  return (
    <div
      className={`bsdc-map-surface relative isolate h-full w-full overflow-hidden bg-surface-2 ${
        className ?? ''
      }`}
      role="application"
      aria-label={title ?? label}
    >
      {hasPoint ? (
        <div ref={view.containerRef} className="absolute inset-0 z-0 h-full w-full" />
      ) : null}

      {children}

      {!hasPoint ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-surface-2 p-6 text-center">
          <div className="max-w-[30ch] space-y-2">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-border text-text">
              <MapPin size={18} aria-hidden />
            </span>
            <p className="text-sm font-medium text-text">{copy.unavailable}</p>
            {placeLabel !== undefined ? (
              <p className="text-xs leading-relaxed text-muted">{placeLabel}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasPoint && view.status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-surface-2/70">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 shadow-raised">
            <Loader2 size={14} className="animate-spin text-primary" aria-hidden />
            <span className="text-xs font-medium text-muted">{copy.loading}</span>
          </div>
        </div>
      ) : null}

      {hasPoint && view.status === 'error' ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-surface-2 p-6 text-center">
          <div className="max-w-[32ch] space-y-3">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-border text-text">
              <AlertCircle size={18} aria-hidden />
            </span>
            <p className="text-sm font-medium text-text">{copy.loadFailed}</p>
            {lat !== null && lng !== null ? (
              <a
                href={googleMapsViewUrl(lat, lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <ExternalLink size={14} aria-hidden />
                {copy.googleMaps}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline map — the glanceable pin inside an order card
// ---------------------------------------------------------------------------

export interface DeliveryMapProps {
  lat: number | null;
  lng: number | null;
  language: Language;
  label?: string | undefined;
  heightClassName?: string | undefined;
  /** Optional delivery radius to draw as a circle. */
  radiusKm?: number | null;
  centerLat?: number | null;
  centerLng?: number | null;
}

/**
 * The pin inside a card: no chrome of its own beyond a coordinate chip, and it
 * never captures the page's scroll gesture — a map that eats a phone's scroll
 * is a map nobody can get past.
 */
export function DeliveryMap({
  lat,
  lng,
  language,
  label,
  heightClassName = 'h-44',
  radiusKm = null,
  centerLat = null,
  centerLng = null,
}: DeliveryMapProps) {
  const copy = MAP_COPY[language];
  const pin = lat !== null && lng !== null && isBdPoint(lat, lng) ? { lat, lng } : null;
  const withCircle = radiusKm !== null && radiusKm > 0;

  if (pin === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-2/70 p-4 text-center">
        <MapPin size={18} className="mx-auto text-muted" aria-hidden />
        <p className="mt-1.5 text-xs font-medium text-muted">{copy.unavailable}</p>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm ${heightClassName}`}
    >
      <DeliveryMapView
        lat={pin.lat}
        lng={pin.lng}
        label={label ?? copy.mapLabel}
        title={label ?? copy.title}
        copy={copy}
        radiusKm={radiusKm}
        centerLat={centerLat}
        centerLng={centerLng}
        showCircle={withCircle}
        zoom={withCircle ? 13 : 16}
      />

      <div className="pointer-events-none absolute inset-x-2 top-2 z-20 hidden items-start sm:flex">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-2.5 py-1 text-2xs font-medium text-text shadow-sm backdrop-blur">
          <MapPin size={11} className="text-primary" aria-hidden />
          <span className="fab-truncate tabular-nums">{coordsText(pin.lat, pin.lng)}</span>
        </span>
      </div>
    </div>
  );
}

/** The “open full screen” affordance a parent places over an inline map. */
export function DeliveryMapExpandButton({
  onClick,
  language,
}: {
  onClick: () => void;
  language: Language;
}) {
  const copy = MAP_COPY[language];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copy.open}
      title={copy.open}
      className="absolute bottom-2 right-2 z-20 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs font-semibold text-text shadow-raised backdrop-blur transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:bottom-3 sm:right-3"
    >
      <Maximize2 size={13} aria-hidden />
      <span>{copy.showDetails}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Full-screen map — the vendor order view
// ---------------------------------------------------------------------------

export interface DeliveryMapDialogProps {
  open: boolean;
  onClose: () => void;
  lat: number | null;
  lng: number | null;
  language: Language;
  /** The customer and address line, shown as the sheet's title. */
  heading?: string | undefined;
  /** Optional customer phone, offered as a one-tap call. */
  phone?: string | undefined;
  title?: string | undefined;
  radiusKm?: number | null;
  centerLat?: number | null;
  centerLng?: number | null;
  showCircle?: boolean | undefined;
  interactiveZoom?: boolean | undefined;
  draggable?: boolean | undefined;
  onLocationSelect?: ((point: DeliveryMapPoint) => void) | undefined;
  onReady?: (() => void) | undefined;
}

/** `hidden` is the immersive map: no sheet, no dock, just the pin. */
type SheetState = 'expanded' | 'compact' | 'hidden';

/**
 * The full-screen delivery map.
 *
 * Rendered through a portal, so no ancestor can clip it, size it or out-stack
 * it, and re-measured on every layout change so tiles always fill the box they
 * are in. On a phone it is the native app's dialog: floating bar, chip, control
 * dock, bottom sheet. On a desktop the same overlay is used, with the sheet
 * narrowed to 420 px and centred so the map stays the subject.
 */
export function DeliveryMapDialog({
  open,
  onClose,
  lat,
  lng,
  language,
  heading,
  phone,
  title,
  radiusKm = null,
  centerLat = null,
  centerLng = null,
  showCircle = false,
  interactiveZoom = true,
  draggable = false,
  onLocationSelect,
  onReady,
}: DeliveryMapDialogProps) {
  const copy = MAP_COPY[language];
  const hasPoint = isBdPoint(lat, lng);
  const [sheet, setSheet] = useState<SheetState>('expanded');
  const [copied, setCopied] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const topStackRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; id: number } | null>(null);
  const dragged = useRef(false);
  const copyTimer = useRef(0);
  const viewRef = useRef<LeafletView | null>(null);
  const headingId = useId();

  const topStackHeight = useMeasuredHeight(topStackRef, open);
  const sheetHeight = useMeasuredHeight(sheetRef, open && sheet !== 'hidden');
  // The coordinate chip sits under the bar and is part of the same reserve;
  // measuring the stack rather than the bar is what keeps a pin from appearing
  // under the chip on a short screen.
  const reservedTop = topStackHeight > 0 ? topStackHeight + 8 : 96;
  const reservedBottom = sheet !== 'hidden' && sheetHeight > 0 ? sheetHeight + 12 : 24;

  useFocusTrap(panelRef, open);

  // Reset the transient UI each time a new order opens.
  useEffect(() => {
    if (!open) return;
    setSheet('expanded');
    setCopied(false);
    setDragOffset(0);
  }, [open, lat, lng]);

  /**
   * Body scroll is locked for exactly as long as the overlay is mounted, with
   * the scrollbar's width replaced so the page behind it cannot shift sideways
   * — the classic "layout jumps when a dialog opens" bug — and restored from
   * the values that were there before, not from guessed defaults.
   */
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 60);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open, onClose]);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleView = useCallback((next: LeafletView) => {
    viewRef.current = next;
  }, []);

  // Once the chrome has reported its real height, the pin is re-framed into the
  // band that is actually visible. This runs on every measurement change, which
  // is what keeps the pin visible through an orientation change.
  useEffect(() => {
    if (!open) return;
    viewRef.current?.reframe();
  }, [open, reservedTop, reservedBottom]);

  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const handleReady = useCallback(() => {
    viewRef.current?.reframe();
    readyRef.current?.();
  }, []);

  const handleCopy = useCallback(async () => {
    if (lat === null || lng === null) return;
    const ok = await copyText(coordsText(lat, lng));
    if (!ok) {
      toast.error(copy.copyFailed);
      return;
    }
    setCopied(true);
    toast.success(copy.copied);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }, [lat, lng, copy.copied, copy.copyFailed]);

  const handleShare = useCallback(async () => {
    if (lat === null || lng === null) return;
    const data = {
      title: copy.shareTitle,
      text: heading ?? coordsText(lat, lng),
      url: googleMapsDirectionsUrl(lat, lng),
    };
    if (typeof navigator.share === 'function' && (navigator.canShare?.(data) ?? true)) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // A cancelled share sheet falls through to the clipboard, so the vendor
        // still ends up with an address they can paste.
      }
    }
    await handleCopy();
  }, [lat, lng, heading, copy.shareTitle, handleCopy]);

  // --- sheet handle drag ---------------------------------------------------
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    dragStart.current = { y: event.clientY, id: event.pointerId };
    dragged.current = false;
    setDragging(true);
    // jsdom and older WebKit both lack this; the drag still works without the
    // capture, it just stops tracking if the pointer leaves the handle.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const start = dragStart.current;
    if (start === null || start.id !== event.pointerId) return;
    const delta = event.clientY - start.y;
    // A few pixels of slop, so a tap that wobbles is still a tap.
    if (Math.abs(delta) > 4) dragged.current = true;
    // Downward from expanded collapses; upward from compact re-opens.
    setDragOffset(sheet === 'expanded' ? clamp(delta, 0, 96) : clamp(delta, -72, 0));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const start = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    setDragOffset(0);
    if (start === null) return;
    const delta = event.clientY - start.y;
    if (sheet === 'expanded' && delta > 44) setSheet('compact');
    else if (sheet === 'compact' && delta < -32) setSheet('expanded');
  };

  if (!open || typeof document === 'undefined') return null;

  const pin = hasPoint && lat !== null && lng !== null ? { lat, lng } : null;
  const coords = pin === null ? '' : coordsText(pin.lat, pin.lng);
  const address = heading ?? (pin === null ? copy.unavailable : coords);
  const immersive = sheet === 'hidden';
  const collapsed = sheet === 'compact';

  const overlay = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      className="bsdc-map-overlay fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg"
      // The sheet's measured height is published as a custom property so the
      // stylesheet can lift Leaflet's own bottom-anchored controls (the scale
      // bar and the attribution strip) clear of it. Two numbers, one meal: a
      // licence notice behind a sheet is a licence notice nobody read.
      style={{ '--bsdc-map-chrome': `${immersive ? 16 : reservedBottom}px` } as React.CSSProperties}
    >
      {/* Map — full bleed, under every piece of chrome, exactly like the native
          dialog. The reserved space is measured from the chrome itself. */}
      <div className="absolute inset-0 z-0">
        {pin !== null ? (
          <DeliveryMapView
            lat={pin.lat}
            lng={pin.lng}
            label={copy.mapLabel}
            title={title ?? copy.title}
            copy={copy}
            radiusKm={radiusKm}
            centerLat={centerLat}
            centerLng={centerLng}
            showCircle={showCircle}
            zoom={15}
            interactiveZoom={interactiveZoom}
            draggable={draggable}
            onLocationSelect={onLocationSelect}
            reservedTop={reservedTop}
            reservedBottom={reservedBottom}
            onView={handleView}
            onReady={handleReady}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-surface-2 p-6 text-center">
            <div className="max-w-[32ch] space-y-3">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-border text-text">
                <AlertCircle size={20} aria-hidden />
              </span>
              <p className="text-sm font-medium text-text">{copy.unavailable}</p>
              <Button variant="secondary" onClick={onClose}>
                {copy.close}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Top bar — a floating pill, so it neither eats map height nor scrolls. */}
      <div
        ref={topStackRef}
        className="relative z-30 px-3"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5 rounded-2xl border border-border bg-surface/95 p-2 shadow-raised backdrop-blur-md">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={copy.back}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft size={20} aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            <h2
              id={headingId}
              className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-tight text-text"
            >
              <span className="fab-truncate">{title ?? copy.title}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                {copy.live}
              </span>
            </h2>
            <p className="fab-truncate mt-0.5 text-xs text-muted">{address}</p>
          </div>

          <button
            type="button"
            onClick={() => setSheet(immersive ? 'expanded' : 'hidden')}
            aria-label={immersive ? copy.showDetails : copy.showMapOnly}
            aria-pressed={immersive}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {immersive ? <Minimize2 size={19} aria-hidden /> : <Maximize2 size={19} aria-hidden />}
          </button>
        </div>

        {/* Coordinate chip — the same affordance the vendor has in the app. */}
        {pin !== null && !immersive ? (
          <div className="mx-auto mt-2 flex w-full max-w-3xl">
            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label={`${copy.copyCoords} · ${coords}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-2xs font-medium text-text shadow-sm backdrop-blur transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MapPin size={12} className="text-primary" aria-hidden />
              <span className="tabular-nums">{coords}</span>
              {copied ? (
                <Check size={12} className="text-primary" aria-hidden />
              ) : (
                <Copy size={12} className="text-muted" aria-hidden />
              )}
            </button>
          </div>
        ) : null}
      </div>

      {/* Control dock — right edge, above the sheet, 44 px targets. */}
      {pin !== null && !immersive ? (
        <div
          className="pointer-events-none absolute right-3 z-20 flex flex-col items-end gap-2 transition-[bottom] duration-200 ease-app motion-reduce:transition-none"
          style={{ bottom: `calc(${reservedBottom}px + 0.75rem)` }}
        >
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-raised backdrop-blur">
            <button
              type="button"
              onClick={() => viewRef.current?.zoomIn()}
              aria-label={copy.zoomIn}
              className="grid h-11 w-11 place-items-center text-text transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ZoomIn size={19} aria-hidden />
            </button>
            <span className="mx-2 h-px bg-border" aria-hidden />
            <button
              type="button"
              onClick={() => viewRef.current?.zoomOut()}
              aria-label={copy.zoomOut}
              className="grid h-11 w-11 place-items-center text-text transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ZoomOut size={19} aria-hidden />
            </button>
          </div>

          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={() => viewRef.current?.locate()}
              aria-label={copy.locate}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-surface/95 text-text shadow-raised backdrop-blur transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Crosshair size={19} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => viewRef.current?.recenter()}
              aria-label={copy.recenter}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-surface/95 text-text shadow-raised backdrop-blur transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Compass size={19} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {/* Immersive mode still needs one visible way back. */}
      {immersive && pin !== null ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => setSheet('expanded')}
            className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface/95 px-4 text-sm font-semibold text-text shadow-raised backdrop-blur transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MapPin size={15} className="text-primary" aria-hidden />
            {copy.showSheet}
          </button>
        </div>
      ) : null}

      {/* Bottom sheet — 20 px top corners, a real handle, two honest action
          rows. Full width on a phone, a 420 px centred card on a desktop. */}
      {!immersive ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-2 sm:px-0 sm:pb-4">
          <div
            ref={sheetRef}
            className={`pointer-events-auto w-full rounded-sheet border border-border bg-surface shadow-sheet sm:max-w-[420px] ${
              dragging
                ? ''
                : 'transition-transform duration-300 ease-app motion-reduce:transition-none'
            }`}
            style={{
              transform: `translateY(${dragOffset}px)`,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <button
              type="button"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onClick={() => {
                // A drag ends with a click on the same element, and that click
                // would immediately undo the state the drag just set. Consume
                // it once, and only when the pointer actually moved.
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                setSheet(collapsed ? 'expanded' : 'compact');
              }}
              aria-label={collapsed ? copy.showSheet : copy.collapseSheet}
              aria-expanded={!collapsed}
              className="flex w-full cursor-grab touch-none flex-col items-center rounded-t-sheet px-4 pb-1 pt-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
            >
              <span className="h-1 w-9 rounded-full bg-border" aria-hidden />
            </button>

            <div className="px-4 pb-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-text line-clamp-2">
                  {address}
                </p>
                {pin !== null ? (
                  <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">
                    {copy.address}
                  </span>
                ) : null}
              </div>

              {pin !== null ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <MapPin size={11} aria-hidden />
                    {coords}
                  </span>
                  {showCircle && radiusKm !== null && radiusKm > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full border border-primary/60 bg-primary/10"
                        aria-hidden
                      />
                      {copy.radius} · {radiusKm} km
                    </span>
                  ) : null}
                  {phone !== undefined ? (
                    <a
                      href={`tel:${phone}`}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Phone size={11} aria-hidden />
                      {phone}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            {!collapsed && pin !== null ? (
              <div className="border-t border-border px-4 py-3">
                {/* Below 360 px the two primary actions stack: side by side, the
                    labels either truncate or the targets shrink under 44 px, and
                    both are worse than one more row of sheet. */}
                <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  <a
                    href={googleMapsDirectionsUrl(pin.lat, pin.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-on-primary transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Navigation size={16} aria-hidden />
                    {copy.directions}
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleShare()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Share2 size={16} aria-hidden />
                    {copy.share}
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium text-text transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {copied ? (
                      <Check size={14} className="shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Copy size={14} className="shrink-0" aria-hidden />
                    )}
                    <span className="fab-truncate">{copied ? copy.copied : copy.copyCoords}</span>
                  </button>
                  <a
                    href={googleMapsViewUrl(pin.lat, pin.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={copy.googleMaps}
                    className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium text-primary transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ExternalLink size={14} className="shrink-0" aria-hidden />
                    <span className="fab-truncate">{copy.googleMapsShort}</span>
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(overlay, document.body);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
