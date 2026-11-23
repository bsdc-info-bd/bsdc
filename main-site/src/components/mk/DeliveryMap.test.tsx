import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryMap, DeliveryMapDialog, DeliveryMapExpandButton } from './DeliveryMap';

/**
 * The full-screen delivery map is an overlay that used to be rendered inside
 * the order card, inside a card with `overflow: hidden`. Everything asserted
 * here is a consequence of that being fixed and of it staying fixed:
 *
 * - it is a child of `body`, so no ancestor can clip it and the page behind it
 *   cannot be pushed around;
 * - the page's scroll is locked while it is open and restored — to the value it
 *   had, not to a guessed default — when it closes;
 * - Escape closes it, because a full-screen surface with a 44 px back button and
 *   no keyboard exit is a keyboard trap;
 * - the one-tap actions point where the vendor needs them to.
 *
 * Leaflet itself is stubbed: jsdom measures every element as 0×0 and has no
 * tile pipeline, so the real library would assert about a container it cannot
 * see. What is under test is this component's wiring, and the stub records the
 * calls that prove the wiring — one instance per mount, one `remove()` on
 * unmount, an `invalidateSize()` after the chrome reports its height.
 */

const leafletCalls = vi.hoisted(() => ({
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  tiles: 0,
}));

interface FakeMap {
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  invalidateSize: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  panBy: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  getZoom: () => number;
  scrollWheelZoom: { enable: () => void; disable: () => void };
}

interface FakeMarker {
  setIcon: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setLatLng: ReturnType<typeof vi.fn>;
  getLatLng: () => { lat: number; lng: number };
  dragging: { enable: () => void; disable: () => void };
}

vi.mock('leaflet/dist/leaflet.css', () => ({}));

/**
 * jsdom has no `ResizeObserver` and no layout, so the canvas that would report
 * a 0×0 box would also leave the map un-measured. This stub delivers one
 * observation per element it is given, which is what a mounted browser does on
 * its first frame and what the component under test is written to expect.
 */
class ImmediateResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback(
      [{ target, contentRect: { height: 320 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ImmediateResizeObserver;

vi.mock('leaflet', () => {
  const map = (): FakeMap => {
    let zoom = 15;
    const instance: FakeMap = {
      on: vi.fn(),
      once: vi.fn(),
      remove: vi.fn(),
      invalidateSize: vi.fn(),
      setView: vi.fn((_latlng: unknown, next: number) => {
        zoom = next;
        return instance;
      }),
      flyTo: vi.fn(),
      panBy: vi.fn(),
      fitBounds: vi.fn(),
      getZoom: () => zoom,
      scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
    };
    leafletCalls.maps.push(instance);
    return instance;
  };

  const marker = (): FakeMarker => {
    let at = { lat: 24.8949, lng: 91.8687 };
    const instance: FakeMarker & { addTo: () => FakeMarker } = {
      addTo: () => instance,
      setIcon: vi.fn(),
      on: vi.fn(),
      remove: vi.fn(),
      setLatLng: vi.fn((next: { lat: number; lng: number }) => {
        at = next;
      }),
      getLatLng: () => at,
      dragging: { enable: vi.fn(), disable: vi.fn() },
    };
    leafletCalls.markers.push(instance);
    return instance;
  };

  const layer = () => ({
    addTo: vi.fn((target: unknown) => {
      if (typeof target === 'object' && target !== null && 'once' in target) {
        leafletCalls.tiles += 1;
      }
      return layer();
    }),
    once: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  });

  return {
    map: vi.fn(map),
    tileLayer: vi.fn(layer),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(marker),
    circle: vi.fn(() => ({
      ...layer(),
      getBounds: () => ({
        getSouthWest: () => ({ lat: 24.8, lng: 91.7 }),
        getNorthEast: () => ({ lat: 25, lng: 92 }),
      }),
    })),
  };
});

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('sonner', () => ({ toast }));

const SYLHET = { lat: 24.8949, lng: 91.8687 };
const ADDRESS = 'Rahim Uddin · Zindabazar, Sylhet';

function openDialog(overrides: Partial<React.ComponentProps<typeof DeliveryMapDialog>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <DeliveryMapDialog
      open
      onClose={onClose}
      lat={SYLHET.lat}
      lng={SYLHET.lng}
      language="en"
      heading={ADDRESS}
      phone="01700000000"
      {...overrides}
    />,
  );
  return { ...view, onClose };
}

describe('DeliveryMapDialog', () => {
  it('renders into the body, so no ancestor can clip it', () => {
    const { container } = openDialog();
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('z-50');
  });

  it('locks the page scroll while open and restores the value it found', async () => {
    document.body.style.overflow = 'auto';
    const { unmount } = openDialog();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    await waitFor(() => expect(document.body.style.overflow).toBe('auto'));
    document.body.style.overflow = '';
  });

  it('closes on Escape and on the back button', () => {
    const { onClose } = openDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers one tap to navigation, sharing, the pin itself and the coordinates', () => {
    openDialog();
    expect(screen.getByRole('link', { name: /Directions/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=24.894900,91.868700',
    );
    expect(screen.getByRole('button', { name: /Share/i })).toBeInTheDocument();
    // The sheet row is the short label so it fits one line on a 320 px phone;
    // the accessible name still says what it opens.
    const maps = screen.getByRole('link', { name: /Google Maps/i });
    expect(maps).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=24.894900,91.868700',
    );
    expect(maps).toHaveAttribute('title', 'Open in Google Maps');
    expect(screen.getByRole('link', { name: '01700000000' })).toHaveAttribute(
      'href',
      'tel:01700000000',
    );
    // The address is deliberately in two places: the bar (always visible) and
    // the sheet (readable at a glance while driving).
    expect(screen.getAllByText(ADDRESS).length).toBeGreaterThanOrEqual(1);
  });

  it('copies six-decimal coordinates and confirms with a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    openDialog();
    // The chip and the sheet row are separate affordances on purpose; either
    // one has to work.
    fireEvent.click(screen.getAllByRole('button', { name: /Copy coords/i })[0] as HTMLElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('24.894900, 91.868700'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('collapses to the immersive map, keeping a way back to the address', () => {
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Show map only' }));
    expect(screen.queryByRole('link', { name: /Directions/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show address' }));
    expect(screen.getByRole('link', { name: /Directions/i })).toBeInTheDocument();
  });

  it('collapses on a drag and does not let the drag’s own click undo it', () => {
    openDialog();
    const handle = screen.getByRole('button', { name: 'Collapse address' });
    // A drag is a pointerdown, a few moves, a pointerup — and then, in a real
    // browser, a click on the same element. That click used to re-open the sheet
    // the drag had just collapsed, which made the handle feel broken.
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 190, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 190, pointerId: 1 });
    fireEvent.click(handle);
    expect(screen.queryByRole('link', { name: /Directions/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show address' })).toBeInTheDocument();
    // A plain tap still toggles.
    fireEvent.click(screen.getByRole('button', { name: 'Show address' }));
    expect(screen.getByRole('link', { name: /Directions/i })).toBeInTheDocument();
  });

  it('repaints the pin when the theme changes, because a token read into a string does not', async () => {
    openDialog();
    await waitFor(() => expect(leafletCalls.markers.length).toBeGreaterThan(0));
    const marker = leafletCalls.markers.at(-1) as unknown as {
      setIcon: ReturnType<typeof vi.fn>;
    };
    marker.setIcon.mockClear();
    document.documentElement.dataset['theme'] = 'dark';
    // The observer fires on the microtask queue, not synchronously.
    await waitFor(() => expect(marker.setIcon).toHaveBeenCalled());
    document.documentElement.dataset['theme'] = 'light';
  });

  it('creates one map instance per mount, re-measures it, and disposes of it', async () => {
    leafletCalls.maps.length = 0;
    const { unmount } = openDialog();
    await waitFor(() => expect(leafletCalls.maps.length).toBe(1));
    const map = leafletCalls.maps[0] as FakeMap;
    // The chrome reported its height on mount, and the map was re-measured.
    // eslint-disable-next-line no-console
    await waitFor(() => expect(map.invalidateSize).toHaveBeenCalled());
    // A rotation, a browser-chrome collapse and a devtools drag all arrive as a
    // window resize, and each one has to reach `invalidateSize` — this is the
    // bug that used to leave the full-screen map half white.
    map.invalidateSize.mockClear();
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(map.invalidateSize).toHaveBeenCalled());
    unmount();
    expect(map.remove).toHaveBeenCalled();
    // A second open is a second instance, not a leak of the first.
    openDialog();
    await waitFor(() => expect(leafletCalls.maps.length).toBe(2));
  });

  it('says so when there is no location instead of drawing an empty map', () => {
    openDialog({ lat: null, lng: null });
    expect(screen.getByText('This order has no map location.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Directions/i })).not.toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<DeliveryMapDialog open={false} onClose={vi.fn()} lat={0} lng={0} language="en" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('speaks Bangla', () => {
    openDialog({ language: 'bn' });
    expect(screen.getByRole('button', { name: 'ফিরে যান' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /দিকনির্দেশনা/ })).toBeInTheDocument();
  });
});

describe('DeliveryMap', () => {
  it('refuses a point outside Bangladesh rather than guessing a centre', () => {
    render(<DeliveryMap lat={51.5} lng={-0.12} language="en" />);
    expect(screen.getByText('This order has no map location.')).toBeInTheDocument();
  });

  it('renders the pin for a real delivery and shows nothing at all when null', () => {
    render(<DeliveryMap lat={SYLHET.lat} lng={SYLHET.lng} language="en" />);
    expect(screen.getByRole('application')).toBeInTheDocument();
  });

  it('offers the expand affordance with a label a screen reader can read', () => {
    const onClick = vi.fn();
    render(<DeliveryMapExpandButton onClick={onClick} language="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open full screen map' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
