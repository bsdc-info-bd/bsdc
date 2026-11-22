import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketCheckoutPage from './MarketCheckoutPage';
import { mkCopy } from '@/lib/mk/mk-copy';
import type { MkCartLine, MkSavedAddress } from '@/lib/mk/mk-types';
import type * as I18nModule from 'react-i18next';

const state = vi.hoisted(() => ({
  uid: 'user-1' as string | null,
  cart: [] as unknown[],
  product: null as null | { id: string; name: string; price_poisha: number },
  delivery: {
    scope: 'all_bd' as 'all_bd' | 'radius',
    radius_km: 1,
    min_order_poisha: undefined as number | undefined,
    fee_mode: 'default' as 'default' | 'fixed' | 'per_km',
    fee_poisha: 15000,
    fixed_fee_poisha: 15000,
    per_km_rate_poisha: 2000,
    default_fee_poisha: 15000,
    center_lat: 23.8,
    center_lng: 90.4,
  },
  schedule: undefined as undefined | { enabled: boolean; is_open: boolean },
  place: vi.fn(),
  placing: false,
  addresses: [] as unknown[],
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { uid: string } | null }) => unknown) =>
    selector({ user: state.uid === null ? null : { uid: state.uid } }),
}));

vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('@/components/mk/customer/MarketNav', () => ({ MarketNav: () => null }));

// The real map needs a browser canvas. The page only cares about the value it reports back.
vi.mock('@/components/mk/LocationPicker', () => ({
  LocationPicker: (props: {
    onChange: (pin: { lat: number; lng: number; label: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onChange({ lat: 23.81, lng: 90.41, label: 'Dhanmondi' })}
    >
      pick-pin
    </button>
  ),
}));

vi.mock('@/lib/mk/mk-repository', () => ({
  fetchVendorRef: vi.fn(() => Promise.resolve('vendor-1')),
}));

vi.mock('@/hooks/use-mk', () => ({
  usePaymentInstructions: () => ({ data: { delivery_fee_poisha: 15000 }, isLoading: false }),
  useMyAddresses: () => ({ data: state.addresses, isLoading: false }),
  useSaveAddress: () => ({ mutateAsync: state.save, isPending: false }),
  useDeleteAddress: () => ({ mutateAsync: state.remove, isPending: false }),
  useVendorPage: () => ({
    data: {
      vendor: {
        name: 'Sylhet Crafts',
        delivery: state.delivery,
        schedule: state.schedule,
      },
    },
    isLoading: false,
  }),
  useProductDetail: () => ({ data: state.product, isLoading: false }),
  useMyCart: () => ({ data: state.cart, isLoading: false }),
  usePlaceOrder: () => ({ mutateAsync: state.place, isPending: state.placing }),
}));

const copy = mkCopy('en');

function cartLine(overrides: Partial<MkCartLine>): MkCartLine {
  return {
    product_id: 'p1',
    qty: 2,
    product_name: 'Clay pot',
    price_poisha: 25000,
    stock: 9,
    product_status: 'active',
    orderable: true,
    vendor_id: 'vendor-1',
    vendor_slug: 'sylhet-crafts',
    vendor_name: 'Sylhet Crafts',
    line_total: 50000,
    image_url: '',
    ...overrides,
  };
}

/** A row as `mk_save_address` returns it: the shape the checkout has to read without guessing. */
function savedAddress(overrides: Partial<MkSavedAddress> = {}): MkSavedAddress {
  return {
    id: 'addr-1',
    label: 'home',
    nickname: '',
    customer_name: 'Rahim Uddin',
    customer_phone: '01712345678',
    address_line: 'House 4, Road 7, Zindabazar',
    landmark: 'Opposite the mosque',
    place_label: 'Zindabazar, Sylhet',
    lat: 23.81,
    lng: 90.41,
    note: 'Ring twice',
    is_default: true,
    times_used: 2,
    last_used_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/marketplace/checkout/:slug" element={<MarketCheckoutPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillForm(phone = '01712-345678') {
  fireEvent.change(await screen.findByLabelText(copy.buyer.name), {
    target: { value: 'Rahim Uddin' },
  });
  fireEvent.change(screen.getByLabelText(copy.buyer.phone), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText(copy.buyer.addressLine), {
    target: { value: 'House 4, Road 7, Zindabazar' },
  });
}

describe('MarketCheckoutPage', () => {
  beforeEach(() => {
    state.uid = 'user-1';
    state.cart = [];
    state.product = null;
    state.delivery = {
      scope: 'all_bd',
      radius_km: 1,
      min_order_poisha: undefined,
      fee_mode: 'default',
      fee_poisha: 15000,
      fixed_fee_poisha: 15000,
      per_km_rate_poisha: 2000,
      default_fee_poisha: 15000,
      center_lat: 23.8,
      center_lng: 90.4,
    };
    state.schedule = undefined;
    state.addresses = [];
    state.save = vi.fn(() =>
      Promise.resolve({ address: savedAddress(), addresses: [savedAddress()] }),
    );
    state.remove = vi.fn(() => Promise.resolve([]));
    state.place = vi.fn(() =>
      Promise.resolve({
        order_id: 'o1',
        code: 'BSDC-ABC123',
        status: 'placed',
        subtotal_poisha: 50000,
        delivery_fee_poisha: 15000,
        total_poisha: 65000,
        line_count: 1,
      }),
    );
    state.placing = false;
  });

  it('asks a signed-out buyer to sign in and does not offer an order', () => {
    state.uid = null;
    renderAt('/marketplace/checkout/sylhet-crafts');
    expect(screen.getByRole('link', { name: copy.buyer.signIn })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.buyer.placeOrder })).toBeNull();
  });

  it('shows field errors and sends nothing when the form is incomplete', async () => {
    state.cart = [cartLine({})];
    renderAt('/marketplace/checkout/sylhet-crafts');
    fireEvent.click(await screen.findByRole('button', { name: copy.buyer.placeOrder }));
    expect(await screen.findByText(copy.fieldErrors.mobile_invalid)).toBeTruthy();
    expect(screen.getByText(copy.fieldErrors.address_short)).toBeTruthy();
    expect(screen.getByText(copy.buyer.pinRequired)).toBeTruthy();
    expect(state.place).not.toHaveBeenCalled();
  });

  it('places a cart order with a normalised phone, the pinned location and no direct items', async () => {
    state.cart = [
      cartLine({}),
      cartLine({ product_id: 'p2', vendor_slug: 'other-shop', line_total: 999 }),
    ];
    renderAt('/marketplace/checkout/sylhet-crafts');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'pick-pin' }));
    fireEvent.click(await screen.findByRole('button', { name: copy.buyer.placeOrder }));

    await waitFor(() => expect(state.place).toHaveBeenCalledTimes(1));
    const input = state.place.mock.calls[0]?.[0] as {
      vendorId: string;
      address: Record<string, unknown>;
      directItems: unknown;
    };
    expect(input.vendorId).toBe('vendor-1');
    expect(input.directItems).toBeNull();
    expect(input.address).toMatchObject({
      customer_name: 'Rahim Uddin',
      customer_phone: '01712345678',
      lat: 23.81,
      lng: 90.41,
      place_label: 'Dhanmondi',
    });
  });

  it('prices a direct buy as product × quantity plus the fixed ৳150 delivery fee', async () => {
    state.product = { id: 'prod-9', name: 'Woven mat', price_poisha: 20000 };
    renderAt('/marketplace/checkout/sylhet-crafts?product=prod-9&qty=3');
    expect(await screen.findByText(/Woven mat/)).toBeTruthy();
    // The line and the subtotal both read ৳600.
    expect(screen.getAllByText('৳600')).toHaveLength(2);
    expect(screen.getByText('৳150')).toBeTruthy();
    expect(screen.getByText('৳750')).toBeTruthy();
  });

  it('sends the direct item and quantity for a direct buy', async () => {
    state.product = { id: 'prod-9', name: 'Woven mat', price_poisha: 20000 };
    renderAt('/marketplace/checkout/sylhet-crafts?product=prod-9&qty=3');
    await fillForm('+8801712345678');
    fireEvent.click(screen.getByRole('button', { name: 'pick-pin' }));
    fireEvent.click(await screen.findByRole('button', { name: copy.buyer.placeOrder }));
    await waitFor(() => expect(state.place).toHaveBeenCalledTimes(1));
    expect(state.place.mock.calls[0]?.[0]).toMatchObject({
      directItems: [{ product_id: 'prod-9', qty: 3 }],
    });
  });

  it('shows the order code once the order is placed', async () => {
    state.cart = [cartLine({})];
    renderAt('/marketplace/checkout/sylhet-crafts');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'pick-pin' }));
    fireEvent.click(await screen.findByRole('button', { name: copy.buyer.placeOrder }));
    expect(await screen.findByText('BSDC-ABC123')).toBeTruthy();
    expect(screen.getByText(copy.buyer.orderPlaced)).toBeTruthy();
  });

  it('shows the shop, the items and the total in the order summary', async () => {
    state.product = { id: 'prod-9', name: 'Woven mat', price_poisha: 20000 };
    renderAt('/marketplace/checkout/sylhet-crafts?product=prod-9&qty=3');
    expect((await screen.findAllByText('Sylhet Crafts')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(copy.buyer.summaryTitle)).toBeTruthy();
    expect(screen.getByText('৳750')).toBeTruthy();
  });

  it('keeps the place-order button disabled while the cart has nothing to order', async () => {
    state.cart = [];
    renderAt('/marketplace/checkout/sylhet-crafts');
    const button = await screen.findByRole('button', { name: copy.buyer.placeOrder });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(copy.buyer.cartEmpty)).toBeTruthy();
  });

  it('fills the form from a saved address and places the order with its id', async () => {
    state.cart = [cartLine({})];
    state.addresses = [savedAddress()];
    renderAt('/marketplace/checkout/sylhet-crafts');

    const card = await screen.findByRole('radio', { name: /House 4, Road 7/ });
    fireEvent.click(card);

    // Picking a door fills the form rather than replacing it, so the member can still change the
    // note or move the pin — and the summary, the steps and the fee all keep one source of truth.
    expect(screen.getByLabelText<HTMLInputElement>(copy.buyer.name).value).toBe('Rahim Uddin');
    expect(screen.getByLabelText<HTMLTextAreaElement>(copy.buyer.addressLine).value).toBe(
      'House 4, Road 7, Zindabazar',
    );

    fireEvent.click(screen.getByRole('button', { name: copy.buyer.placeOrder }));
    await waitFor(() => expect(state.place).toHaveBeenCalledTimes(1));
    expect(state.place.mock.calls[0]?.[0]).toMatchObject({
      addressId: 'addr-1',
      address: {
        customer_name: 'Rahim Uddin',
        customer_phone: '01712345678',
        address_line: 'House 4, Road 7, Zindabazar',
        lat: 23.81,
        lng: 90.41,
      },
    });
  });

  it('stops sending the id once the member changes what the row says', async () => {
    state.cart = [cartLine({})];
    state.addresses = [savedAddress()];
    renderAt('/marketplace/checkout/sylhet-crafts');
    fireEvent.click(await screen.findByRole('radio', { name: /House 4, Road 7/ }));

    fireEvent.change(screen.getByLabelText(copy.buyer.addressLine), {
      target: { value: 'House 11, Road 2, Uposhohor' },
    });
    expect(await screen.findByText(copy.buyer.addressEditedFromSaved)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: copy.buyer.placeOrder }));
    await waitFor(() => expect(state.place).toHaveBeenCalledTimes(1));
    // The saved row would have ordered to the old gate; the form says a new one. The id goes, and
    // `mk_place_order` uses what is typed instead of a row it no longer agrees with.
    expect(state.place.mock.calls[0]?.[0]).toMatchObject({
      addressId: null,
      address: { address_line: 'House 11, Road 2, Uposhohor' },
    });
  });

  it('holds the order button until the shop’s minimum order is met, and says by how much', async () => {
    state.cart = [cartLine({ qty: 1, line_total: 50000 })];
    state.delivery = { ...state.delivery, min_order_poisha: 80000 };
    renderAt('/marketplace/checkout/sylhet-crafts');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'pick-pin' }));

    expect(await screen.findByText(/৳300/)).toBeTruthy();
    const button = screen.getByRole('button', { name: copy.buyer.placeOrder });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(state.place).not.toHaveBeenCalled();
  });

  it('saves the typed address into the book only when the member asks', async () => {
    state.cart = [cartLine({})];
    renderAt('/marketplace/checkout/sylhet-crafts');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'pick-pin' }));

    fireEvent.click(screen.getByRole('button', { name: copy.buyer.placeOrder }));
    await waitFor(() => expect(state.place).toHaveBeenCalledTimes(1));
    expect(state.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(copy.buyer.saveThisAddress));
    fireEvent.click(screen.getByRole('button', { name: copy.buyer.placeOrder }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0]?.[0]).toMatchObject({
      id: null,
      // The first address is the default — the routine decides that too, and the client saying so
      // here only matches what the response would have said.
      is_default: true,
      customer_name: 'Rahim Uddin',
      customer_phone: '01712345678',
      address_line: 'House 4, Road 7, Zindabazar',
      lat: 23.81,
      lng: 90.41,
    });
  });

  it('adds an address from the editor without leaving the checkout', async () => {
    state.cart = [cartLine({})];
    renderAt('/marketplace/checkout/sylhet-crafts');
    fireEvent.click(await screen.findByRole('button', { name: copy.buyer.addressNew }));

    fireEvent.change(await screen.findByLabelText(copy.buyer.addressRecipient), {
      target: { value: 'Ammu' },
    });
    fireEvent.change(screen.getByLabelText(copy.buyer.addressPhone), {
      target: { value: '01812-345678' },
    });
    fireEvent.change(screen.getByLabelText(copy.buyer.addressStreet), {
      target: { value: 'House 9, Road 3, Uposhohor' },
    });
    const pins = screen.getAllByRole('button', { name: 'pick-pin' });
    fireEvent.click(pins[pins.length - 1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: copy.buyer.addressSave }));

    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0]?.[0]).toMatchObject({
      id: null,
      label: 'home',
      customer_name: 'Ammu',
      customer_phone: '01812-345678',
      address_line: 'House 9, Road 3, Uposhohor',
      place_label: 'Dhanmondi',
      lat: 23.81,
      lng: 90.41,
    });
  });

  it('marks the details step done once the contact and address are filled', async () => {
    state.cart = [cartLine({})];
    renderAt('/marketplace/checkout/sylhet-crafts');
    await fillForm();
    expect((await screen.findAllByText(copy.buyer.sectionReady)).length).toBeGreaterThanOrEqual(1);
  });

  it('computes live per-km delivery fee once the buyer drops a pin', async () => {
    state.cart = [cartLine({ qty: 1, line_total: 25000 })];
    state.delivery = {
      ...state.delivery,
      scope: 'radius',
      radius_km: 10,
      fee_mode: 'per_km',
      per_km_rate_poisha: 3000, // ৳30/km
      center_lat: 23.8,
      center_lng: 90.4,
    };
    renderAt('/marketplace/checkout/sylhet-crafts');
    expect(await screen.findByText(copy.delivery.pinToCalculate)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'pick-pin' }));
    // Pin at (23.81, 90.41) is ~1.5 km from (23.80, 90.40) -> ceil = 2 km -> ৳60 fee -> ৳310 total
    expect(await screen.findByText('৳60')).toBeTruthy();
    expect(screen.getByText('৳310')).toBeTruthy();
  });

  it('blocks checkout when the shop is closed on its Dhaka opening schedule', async () => {
    state.cart = [cartLine({})];
    state.schedule = { enabled: true, is_open: false };
    renderAt('/marketplace/checkout/sylhet-crafts');
    expect(await screen.findByText(copy.schedule.closedBanner)).toBeTruthy();
    const button = screen.getByRole('button', { name: copy.buyer.placeOrder });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
