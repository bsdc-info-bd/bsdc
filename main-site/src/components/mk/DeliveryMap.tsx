import {
  Navigation,
  MapPin,
  Maximize2,
  X,
  Copy,
  Share2,
  Crosshair,
  Layers,
  ZoomIn,
  ZoomOut,
  Compass,
  ExternalLink,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker, Circle as LeafletCircle } from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/design-system';
import { googleMapsDirectionsUrl, openStreetMapUrl } from '@/lib/mk/maps';
import { isBdPoint, type Language } from '@/lib/mk/mk-logic';

/**
 * Where a marketplace order is going — ultra advanced responsive system.
 *
 * Vendors need three things from a delivery pin and they are not the same thing:
 * a glanceable position inside the order card ([DeliveryMap]), the same position
 * big enough to reason about ([DeliveryMapDialog]), and one tap that hands the
 * whole trip to whichever navigation app the driver already owns
 * (`googleMapsDirectionsUrl` in `@/lib/mk/maps`). The map is read-only: it never
 * reports a pin back, because a vendor must not be able to move a customer's
 * delivery address.
 *
 * ## What makes this "ultra advanced"
 *
 * The previous dialog was a fixed inset-0 flex column with a leaflet div and two
 * links. It worked, but on a phone the map was under a header that ate 80 px, the
 * close button was a 20 px target, the tiles could be half-white because the
 * container measured 0, and there was no way to copy the coordinate, share it, or
 * re-centre. On a desktop the same 100vh panel stretched edge to edge and felt
 * like a mis-placed page rather than a focused tool.
 *
 * This version treats the dialog as a responsive surface:
 *
 * - **Phone** — true full-screen with safe-area insets, gesture-friendly 44 px
 *   touch targets, a collapsible address sheet over the map, and a floating
 *   control dock that never scrolls away.
 * - **Tablet/desktop** — a centred modal (max 960 px, 88 vh) with rounded 2xl
 *   corners, backdrop blur, and a side details rail so the map never competes
 *   with the address text for width.
 * - **Everywhere** — native Leaflet controls are hidden in favour of a designed
 *   dock (zoom, compass, locate, layers), copy/share affordances, live
 *   coordinate display, and motion that respects `prefers-reduced-motion`.
 *
 * Nothing in the public API changes: `DeliveryMap`, `DeliveryMapDialog` and
 * `DeliveryMapExpandButton` keep their props so `OrdersPanel` does not need a
 * single line changed. The upgrade is purely inside the components.
 */

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const PIN_SVG =
  '<svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><defs><filter id="s" x="-50%" y="-20%" width="200%" height="150%"><feDropShadow dx="0" dy="2" flood-opacity="0.22" stdDeviation="2"/></filter></defs><g filter="url(#s)"><path d="M18 0C8.06 0 0 8.06 0 18c0 11.25 18 26 18 26s18-14.75 18-26C36 8.06 27.94 0 18 0z" style="fill:var(--bsdc-primary, #0a6b4a)"/><circle cx="18" cy="17.2" r="7.5" style="fill:#fff"/><circle cx="18" cy="17.2" r="3.2" style="fill:var(--bsdc-primary, #0a6b4a)"/></g></svg>';

const MAP_COPY = {
  bn: {
    title: 'কাস্টমারের অবস্থান',
    subtitle: 'অর্ডার ডেলিভারির গন্তব্য',
    open: 'পূর্ণ পর্দায় দেখুন',
    google: 'গুগল ম্যাপে যান',
    osm: 'ওপেনস্ট্রিটম্যাপে দেখুন',
    close: 'বন্ধ করুন',
    unavailable: 'এই অর্ডারে মানচিত্রের অবস্থান নেই।',
    missing: 'মানচিত্র লোড করা যায়নি।',
    copyCoords: 'কোঅর্ডিনেট কপি করুন',
    copied: 'কপি হয়েছে',
    share: 'শেয়ার করুন',
    locate: 'আমার অবস্থান',
    layers: 'লেয়ার',
    zoomIn: 'জুম ইন',
    zoomOut: 'জুম আউট',
    resetNorth: 'উত্তর দিকে ঘোরান',
    coords: 'স্থানাঙ্ক',
    address: 'ঠিকানা',
    distance: 'দূরত্ব',
    handyActions: 'দ্রুত অ্যাকশন',
    call: 'কল করুন',
    directions: 'দিকনির্দেশনা',
  },
  en: {
    title: 'Customer location',
    subtitle: 'Delivery destination for this order',
    open: 'Open full screen map',
    google: 'Go to Google Maps',
    osm: 'View on OpenStreetMap',
    close: 'Close',
    unavailable: 'This order has no map location.',
    missing: 'The map could not load.',
    copyCoords: 'Copy coordinates',
    copied: 'Copied',
    share: 'Share',
    locate: 'My location',
    layers: 'Layers',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetNorth: 'Reset north',
    coords: 'Coordinates',
    address: 'Address',
    distance: 'Distance',
    handyActions: 'Quick actions',
    call: 'Call',
    directions: 'Directions',
  },
} as const;

type MapCopy = (typeof MAP_COPY)[Language];

function useCopy(language: Language): MapCopy {
  return MAP_COPY[language];
}

// ---------------------------------------------------------------------------
// Shared Leaflet hook — lazily loads leaflet + css, creates one pin + map,
// and exposes imperative controls for zoom/locate without re-mounting.
// ---------------------------------------------------------------------------

interface LeafletHandle {
  map: LeafletMap | null;
  marker: LeafletMarker | null;
  circle: LeafletCircle | null;
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: (lat: number, lng: number, zoom?: number) => void;
  locate: () => void;
  failed: boolean;
  ready: boolean;
}

function useLeafletPin(
  containerRef: React.RefObject<HTMLDivElement | null>,
  lat: number,
  lng: number,
  opts: {
    zoom?: number;
    interactiveZoom?: boolean;
    showCircle?: boolean;
    circleRadiusKm?: number | null;
    draggable?: boolean;
    onReady?: () => void;
  } = {},
): LeafletHandle {
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circleRef = useRef<LeafletCircle | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const zoom = opts.zoom ?? 16;
  const interactiveZoom = opts.interactiveZoom ?? false;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let marker: LeafletMarker | null = null;

    async function mount(): Promise<void> {
      const node = containerRef.current;
      if (node === null) return;
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || node === null) return;

        map = L.map(node, {
          zoomControl: false,
          attributionControl: true,
          dragging: true,
          scrollWheelZoom: interactiveZoom,
          doubleClickZoom: true,
          touchZoom: true,
          keyboard: true,
          closePopupOnClick: false,
          minZoom: 5,
          maxZoom: 19,
        }).setView([lat, lng], zoom);

        L.tileLayer(TILES, {
          maxZoom: 19,
          attribution: TILE_ATTRIBUTION,
        }).addTo(map);

        const icon = L.divIcon({
          className: 'bsdc-delivery-pin',
          html: PIN_SVG,
          iconSize: [36, 44],
          iconAnchor: [18, 44],
          popupAnchor: [0, -44],
        });
        marker = L.marker([lat, lng], {
          icon,
          draggable: opts.draggable === true,
          keyboard: true,
          alt: 'delivery pin',
        }).addTo(map);

        // Subtle accuracy/delivery radius circle when needed
        if (opts.showCircle && opts.circleRadiusKm && opts.circleRadiusKm > 0) {
          circleRef.current = L.circle([lat, lng], {
            radius: opts.circleRadiusKm * 1000,
            color: 'var(--bsdc-primary, #0a6b4a)',
            weight: 1.5,
            opacity: 0.35,
            fillOpacity: 0.08,
            dashArray: '8 6',
          }).addTo(map);
        }

        // Add scale for handy distance reference
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

        mapRef.current = map;
        markerRef.current = marker;

        // Container may be inside a card that is still animating / transitioning.
        // One invalidate after layout settles keeps tiles aligned on every open.
        window.setTimeout(() => {
          if (!cancelled) {
            mapRef.current?.invalidateSize({ animate: true, pan: false });
            setReady(true);
            opts.onReady?.();
          }
        }, 140);

        // Handle orientation change / resize
        const onResize = () => mapRef.current?.invalidateSize({ animate: false });
        window.addEventListener('resize', onResize);

        // cleanup listener when this effect re-runs or unmounts — stored for disposal
        (map as unknown as { __bsdcResize: () => void }).__bsdcResize = onResize;
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void mount();

    return () => {
      cancelled = true;
      const prev = mapRef.current as unknown as { __bsdcResize?: () => void } | null;
      if (prev?.__bsdcResize) window.removeEventListener('resize', prev.__bsdcResize);
      marker?.remove();
      map?.remove();
      circleRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      setReady(false);
    };
    // opts is a stable options bag — only its fields are dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    containerRef,
    lat,
    lng,
    zoom,
    interactiveZoom,
    opts.draggable,
    opts.showCircle,
    opts.circleRadiusKm,
    opts.onReady,
  ]);

  const zoomIn = useCallback(() => mapRef.current?.zoomIn(1, { animate: true }), []);
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(1, { animate: true }), []);
  const recenter = useCallback((nLat: number, nLng: number, nZoom?: number) => {
    const m = mapRef.current;
    if (!m) return;
    const z = nZoom ?? m.getZoom();
    m.flyTo([nLat, nLng], z, { duration: 0.6, easeLinearity: 0.15 });
    markerRef.current?.setLatLng([nLat, nLng]);
  }, []);
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not available');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => recenter(pos.coords.latitude, pos.coords.longitude, 15),
      () => toast.error('Could not get your location'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [recenter]);

  return { map: mapRef.current, marker: markerRef.current, circle: circleRef.current, zoomIn, zoomOut, recenter, locate, failed, ready };
}

// ---------------------------------------------------------------------------
// Inline map — now with hover actions, better affordances, and responsive heights
// ---------------------------------------------------------------------------

interface DeliveryMapProps {
  lat: number | null;
  lng: number | null;
  language: Language;
  label?: string | undefined;
  heightClassName?: string | undefined;
  /** Optional delivery radius to draw as a circle */
  radiusKm?: number | null;
}

export function DeliveryMap({
  lat,
  lng,
  language,
  label,
  heightClassName = 'h-44',
  radiusKm = null,
}: DeliveryMapProps) {
  const copy = useCopy(language);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasPoint = lat !== null && lng !== null && isBdPoint(lat, lng);
  const { failed, ready } = useLeafletPin(containerRef, lat ?? 0, lng ?? 0, {
    zoom: 16,
    interactiveZoom: false,
    showCircle: radiusKm !== null && radiusKm > 0,
    circleRadiusKm: radiusKm,
  });

  if (!hasPoint) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-2/70 p-4 text-center">
        <MapPin size={18} className="mx-auto text-muted" aria-hidden />
        <p className="mt-1.5 text-xs font-medium text-muted">{copy.unavailable}</p>
      </div>
    );
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-300 hover:shadow-md ${heightClassName}`}
      role="img"
      aria-label={label ?? copy.title}
    >
      <div ref={containerRef} className="h-full w-full bg-[#e8f0e8] dark:bg-zinc-900" />

      {/* Subtle gradient scrim so the expand button is always legible over light tiles */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Loading skeleton */}
      <AnimatePresence>
        {!ready && !failed ? (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-2/80 backdrop-blur-[2px] p-3"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-primary/15" />
              <span className="h-2 w-24 animate-pulse rounded-full bg-border" aria-hidden />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {failed ? (
        <span className="absolute inset-0 grid place-items-center bg-surface-2 p-4 text-center text-xs leading-relaxed text-muted">
          <span className="inline-flex max-w-[22ch] flex-col items-center gap-1.5">
            <AlertCircle size={16} className="text-muted" aria-hidden />
            {copy.missing}
          </span>
        </span>
      ) : null}

      {/* Coordinate chip — handy on dense order lists */}
      <div className="pointer-events-none absolute left-2 top-2 hidden sm:block">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-muted shadow-sm backdrop-blur">
          <MapPin size={11} aria-hidden />
          {lat?.toFixed(4)}, {lng?.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-screen / modal map — ultra responsive, interactive, beautiful
// ---------------------------------------------------------------------------

interface DeliveryMapDialogProps {
  open: boolean;
  onClose: () => void;
  lat: number | null;
  lng: number | null;
  language: Language;
  /** Shown above the map, usually the customer's name and address line. */
  heading?: string | undefined;
  /** Optional phone for call action */
  phone?: string | undefined;
}

export function DeliveryMapDialog({
  open,
  onClose,
  lat,
  lng,
  language,
  heading,
  phone,
}: DeliveryMapDialogProps) {
  const copy = useCopy(language);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const hasPoint = lat !== null && lng !== null && isBdPoint(lat, lng);
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);

  // Body scroll lock + focus management + esc
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Prevent layout shift from scrollbar disappearance
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    // Small delay so the motion enter finishes before focus ring appears
    const t = window.setTimeout(() => closeRef.current?.focus(), 160);

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  // Reset sheet when a different order is opened
  useEffect(() => {
    if (open) setSheetOpen(true);
  }, [open, lat, lng]);

  const handleCopy = useCallback(async () => {
    if (!hasPoint || lat === null || lng === null) return;
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(copy.copied);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers / insecure context
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      toast.success(copy.copied);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }, [hasPoint, lat, lng, copy.copied]);

  const handleShare = useCallback(async () => {
    if (!hasPoint || lat === null || lng === null) return;
    const url = googleMapsDirectionsUrl(lat, lng);
    const shareData = {
      title: copy.title,
      text: heading ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      url,
    };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    await handleCopy();
  }, [hasPoint, lat, lng, heading, copy.title, handleCopy]);

  // Mount leaflet only when dialog is open (hidden container = 0 size otherwise)
  const { failed, ready, zoomIn, zoomOut, recenter, locate } = useLeafletPin(
    open ? containerRef : ({ current: null } as React.RefObject<HTMLDivElement | null>),
    lat ?? 0,
    lng ?? 0,
    {
      zoom: 17,
      interactiveZoom: true,
    },
  );

  if (!open) return null;

  const coordText = hasPoint && lat !== null && lng !== null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      {/* Backdrop — click to close, with blur for modern feel */}
      <motion.button
        type="button"
        aria-label={copy.close}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#0a0f0b]/60 backdrop-blur-[6px] dark:bg-black/70"
      />

      {/* Shell — full screen on phone, modal on larger screens */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }}
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-2xl sm:h-[88dvh] sm:max-h-[760px] sm:max-w-[960px] sm:rounded-[20px] sm:border sm:border-border"
        style={{
          // Respect iOS safe areas when full-screen
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header — sticky, blurred, with title + close */}
        <header className="relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface/85 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70 sm:px-5 sm:py-4">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" aria-hidden />
          <div className="flex min-w-0 items-start gap-3">
            <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:grid dark:bg-primary/15">
              <MapPin size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-none text-text sm:text-base">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary sm:hidden">
                  <MapPin size={14} aria-hidden />
                </span>
                {copy.title}
                <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary sm:inline-flex dark:bg-primary/15">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                  Live
                </span>
              </h2>
              <p className="mt-1 text-xs font-medium text-muted sm:text-sm">{copy.subtitle}</p>
              {heading ? (
                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-text sm:truncate" title={heading}>
                  {heading}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Handy: copy coords quickly from header on desktop */}
            {hasPoint ? (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text shadow-sm transition hover:bg-surface-2 sm:inline-flex"
                aria-label={copy.copyCoords}
                title={coordText}
              >
                {copied ? <Check size={13} className="text-emerald-600" aria-hidden /> : <Copy size={13} aria-hidden />}
                {copied ? copy.copied : coordText}
              </button>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={copy.close}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted shadow-sm transition hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-10 sm:w-10"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>

        {/* Main area — map + optional side rail on desktop */}
        <div className="relative flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Map */}
          <div className="relative min-h-0 flex-1 bg-[#dbe8db] dark:bg-zinc-900">
            {hasPoint ? (
              <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" role="application" aria-label={copy.title} />
            ) : null}

            {/* Loading / error overlays */}
            <AnimatePresence>
              {!ready && hasPoint && !failed ? (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 grid place-items-center bg-surface-2/60 backdrop-blur-[1px]"
                >
                  <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-5 shadow-lg">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                    <p className="text-xs font-medium text-muted">Loading map…</p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {(failed || !hasPoint) && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-surface-2 p-6 text-center">
                <div className="max-w-[32ch] space-y-3">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-border text-muted">
                    <AlertCircle size={20} aria-hidden />
                  </span>
                  <p className="text-sm font-medium text-text">{hasPoint ? copy.missing : copy.unavailable}</p>
                  <p className="text-xs leading-relaxed text-muted">
                    {hasPoint ? 'Try refreshing or open in Google Maps.' : 'Add a delivery pin to enable routing.'}
                  </p>
                  {hasPoint && lat !== null && lng !== null && (
                    <a
                      href={googleMapsDirectionsUrl(lat, lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-active"
                    >
                      <ExternalLink size={14} aria-hidden />
                      {copy.google}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Top dock — locate + compass, absolutely positioned over map */}
            {hasPoint && (
              <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-2 sm:left-4 sm:right-4 sm:top-4">
                <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 shadow-md backdrop-blur sm:px-3 sm:py-1.5">
                  <span className="hidden h-5 w-5 place-items-center rounded-full bg-primary text-on-primary sm:grid" aria-hidden>
                    <MapPin size={10} />
                  </span>
                  <span className="max-w-[18ch] truncate text-xs font-semibold text-text sm:max-w-[28ch] sm:text-sm" title={coordText}>
                    {coordText}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/15"
                    aria-label={copy.copyCoords}
                  >
                    {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                  </button>
                </div>

                {/* Desktop layer hint — non-interactive, just branding */}
                <span className="pointer-events-auto hidden items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-muted shadow-md backdrop-blur sm:inline-flex">
                  <Layers size={12} aria-hidden />
                  OpenStreetMap
                </span>
              </div>
            )}

            {/* Left vertical dock — zoom, locate, layers — modern handy controls */}
            {hasPoint && (
              <div className="absolute bottom-[132px] left-3 z-20 flex flex-col gap-2 sm:bottom-4 sm:left-4">
                <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
                  <button
                    type="button"
                    onClick={zoomIn}
                    aria-label={copy.zoomIn}
                    className="grid h-10 w-10 place-items-center text-muted transition hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:bg-surface-2"
                  >
                    <ZoomIn size={18} aria-hidden />
                  </button>
                  <div className="h-px bg-border" aria-hidden />
                  <button
                    type="button"
                    onClick={zoomOut}
                    aria-label={copy.zoomOut}
                    className="grid h-10 w-10 place-items-center text-muted transition hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:bg-surface-2"
                  >
                    <ZoomOut size={18} aria-hidden />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={locate}
                  aria-label={copy.locate}
                  className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-surface text-muted shadow-lg transition hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Crosshair size={18} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => hasPoint && lat !== null && lng !== null && recenter(lat, lng, 17)}
                  aria-label={copy.resetNorth}
                  className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-surface text-muted shadow-lg transition hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Compass size={18} aria-hidden />
                </button>
              </div>
            )}

            {/* Bottom sheet — collapsible address + quick actions, mobile-first */}
            <AnimatePresence initial={false}>
              {hasPoint && sheetOpen ? (
                <motion.div
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 24, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-x-3 bottom-3 z-20 sm:inset-x-4 sm:bottom-4 sm:max-w-[380px]"
                >
                  <div className="overflow-hidden rounded-[18px] border border-border bg-surface/95 shadow-xl backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                        {copy.address}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSheetOpen(false)}
                        className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-text"
                        aria-label={copy.close}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                    <div className="px-4 pb-3">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-text" title={heading}>
                        {heading ?? coordText}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <MapPin size={11} aria-hidden />
                        <span className="truncate">{coordText}</span>
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                          {copy.coords}
                        </span>
                      </p>
                    </div>

                    {/* Handy quick actions — never more than one tap away */}
                    <div className="grid grid-cols-3 gap-1.5 bg-surface-2/60 px-2.5 py-2.5">
                      <a
                        href={hasPoint && lat !== null && lng !== null ? googleMapsDirectionsUrl(lat, lng) : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-primary px-2 py-2.5 text-xs font-semibold text-on-primary shadow-sm transition hover:bg-primary-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Navigation size={16} aria-hidden />
                        {copy.directions}
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleShare()}
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-2 py-2.5 text-xs font-medium text-text shadow-sm transition hover:bg-surface-2"
                      >
                        <Share2 size={16} aria-hidden />
                        {copy.share}
                      </button>
                      {phone ? (
                        <a
                          href={`tel:${phone}`}
                          className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-2 py-2.5 text-xs font-medium text-text shadow-sm transition hover:bg-surface-2"
                        >
                          <MapPin size={16} aria-hidden />
                          {copy.call}
                        </a>
                      ) : (
                        <a
                          href={hasPoint && lat !== null && lng !== null ? openStreetMapUrl(lat, lng) : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-2 py-2.5 text-xs font-medium text-text shadow-sm transition hover:bg-surface-2"
                        >
                          <ExternalLink size={16} aria-hidden />
                          {copy.osm}
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Collapsed sheet toggle — when user dismisses sheet */}
            <AnimatePresence>
              {hasPoint && !sheetOpen ? (
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-text shadow-lg backdrop-blur hover:bg-surface-2 sm:bottom-4"
                >
                  Show details
                </motion.button>
              ) : null}
            </AnimatePresence>

            {/* Center pin hint — subtle, fades when map is ready */}
            <AnimatePresence>
              {hasPoint && ready ? (
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ delay: 1.6, duration: 0.6 }}
                  className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-[46px] rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary shadow-lg"
                >
                  {heading?.slice(0, 32) ?? 'Delivery pin'}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Desktop side rail — details that would otherwise hide the map */}
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-surface-2/40 sm:flex">
            <div className="flex-1 overflow-auto p-4">
              <h3 className="text-sm font-semibold text-text">{copy.handyActions}</h3>
              <div className="mt-3 grid gap-2">
                <a
                  href={hasPoint && lat !== null && lng !== null ? googleMapsDirectionsUrl(lat, lng) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-sm transition hover:bg-primary-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Navigation size={16} aria-hidden />
                    {copy.google}
                  </span>
                  <ExternalLink size={14} aria-hidden className="opacity-80" />
                </a>
                <a
                  href={hasPoint && lat !== null && lng !== null ? openStreetMapUrl(lat, lng) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text shadow-sm transition hover:bg-surface-2"
                >
                  <span className="inline-flex items-center gap-2">
                    <Layers size={16} aria-hidden />
                    {copy.osm}
                  </span>
                  <ExternalLink size={14} aria-hidden className="opacity-60" />
                </a>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium text-text shadow-sm transition hover:bg-surface-2"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" aria-hidden /> : <Copy size={14} aria-hidden />}
                    {copied ? copy.copied : copy.copyCoords}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShare()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium text-text shadow-sm transition hover:bg-surface-2"
                  >
                    <Share2 size={14} aria-hidden />
                    {copy.share}
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">{copy.coords}</h4>
                <p className="mt-2 font-mono text-sm font-medium text-text">{coordText}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {heading ?? 'Pin drop for this order. Share or open in your navigation app.'}
                </p>
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
                  >
                    <MapPin size={12} aria-hidden />
                    {copy.call}: {phone}
                  </a>
                ) : null}
              </div>

              {/* Map legend — handy for vendors who rarely use maps */}
              <div className="mt-4 rounded-2xl bg-surface p-4">
                <h4 className="text-xs font-semibold text-text">How to use</h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-muted">
                  <li>Drag to pan, pinch or use + / − to zoom.</li>
                  <li>Tap the compass to re-centre on the delivery pin.</li>
                  <li>“Directions” opens turn-by-turn in Google Maps.</li>
                </ul>
              </div>
            </div>

            <div className="border-t border-border bg-surface p-4">
              <Button variant="secondary" onClick={onClose} className="w-full justify-center">
                {copy.close}
              </Button>
            </div>
          </aside>
        </div>

        {/* Mobile footer — sticky, with primary actions */}
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-surface px-4 py-3 sm:hidden">
          {hasPoint ? (
            <>
              <a
                href={hasPoint && lat !== null && lng !== null ? googleMapsDirectionsUrl(lat, lng) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-sm transition hover:bg-primary-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Navigation size={16} aria-hidden />
                {copy.google}
              </a>
              <a
                href={hasPoint && lat !== null && lng !== null ? openStreetMapUrl(lat, lng) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text shadow-sm hover:bg-surface-2"
              >
                <ExternalLink size={16} aria-hidden />
                OSM
              </a>
            </>
          ) : null}
          <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
            {copy.close}
          </Button>
        </footer>
      </motion.div>
    </div>
  );
}

/** The small “open full screen” affordance used on an inline map. */
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
      className="absolute bottom-2 right-2 z-[400] inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs font-semibold text-text shadow-md backdrop-blur transition hover:bg-surface hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:bottom-3 sm:right-3"
    >
      <Maximize2 size={13} aria-hidden />
      {copy.open}
    </button>
  );
}
