import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketCheckoutPage from './MarketCheckoutPage';
import { mkCopy } from '@/lib/mk/mk-copy';
import type { MkCartLine } from '@/lib/mk/mk-types';
import type * as I18nModule from 'react-i18next';

const state = vi.hoisted(() => ({
  uid: 'user-1' as string | null,
  cart: [] as unknown[],
  product: null as null | { id: string; name: string; price_poisha: number },
  place: vi.fn(),
  placing: false,
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
  useVendorPage: () => ({ data: { vendor: { name: 'Sylhet Crafts' } }, isLoading: false }),
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
});
