import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  cartTotals,
  canCheckout,
  type CartLine,
  type CartTotals,
  type CatalogProduct,
  type CatalogSort,
  type OrderSummary,
  type PaymentMethod,
  type PlacedOrder,
} from '@/lib/market/market-types';
import type {
  AddressRow,
  OrderItemRow,
  OrderRow,
  ProductReviewRow,
  ProductRow,
  ShopRow,
} from '@/lib/supabase/types';
import { useAuthStore } from '@/store/auth-store';

const repository = () => import('@/lib/market/market-repository');

export interface CatalogFilters {
  category: string | null;
  search: string;
  sort: CatalogSort;
}

export interface ShopCatalogResult {
  products: CatalogProduct[];
  categories: string[];
  filters: CatalogFilters;
  setFilters: (next: CatalogFilters) => void;
  isLoading: boolean;
  isError: boolean;
  wish: (productId: string) => void;
}

/** The storefront. Sorting and filtering happen in Postgres, not in memory. */
export function useShopCatalog(): ShopCatalogResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<CatalogFilters>({
    category: null,
    search: '',
    sort: 'recent',
  });

  const queryKey = ['catalog', uid, filters.category, filters.search, filters.sort];

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await repository()).fetchCatalog(
        filters.category,
        filters.search.trim().length > 0 ? filters.search.trim() : null,
        filters.sort,
      ),
    staleTime: 60_000,
  });

  const products = useMemo(() => query.data ?? [], [query.data]);
  const categories = useMemo(
    () =>
      [
        ...new Set(products.map((product) => product.category).filter((item) => item.length > 0)),
      ].sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const wishMutation = useMutation({
    mutationFn: async (productId: string) => (await repository()).toggleWishlist(productId),
    onMutate: (productId) => {
      const previous = queryClient.getQueryData<CatalogProduct[]>(queryKey);
      queryClient.setQueryData<CatalogProduct[]>(queryKey, (current = []) =>
        current.map((product) =>
          product.id === productId ? { ...product, wishlisted: !product.wishlisted } : product,
        ),
      );
      return { previous };
    },
    onError: (_error, _productId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });

  return {
    products,
    categories,
    filters,
    setFilters,
    isLoading: query.isLoading,
    isError: query.isError,
    wish: (productId) => {
      wishMutation.mutate(productId);
    },
  };
}

export interface ProductResult {
  product: ProductRow | null;
  shop: ShopRow | null;
  reviews: ProductReviewRow[];
  isLoading: boolean;
  isError: boolean;
  add: (quantity: number) => Promise<void>;
  isAdding: boolean;
  review: (rating: number, body: string) => Promise<void>;
  isReviewing: boolean;
}

export function useProduct(slug: string | undefined): ProductResult {
  const queryClient = useQueryClient();
  const queryKey = ['product', slug];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchProduct(slug ?? ''),
    enabled: slug !== undefined && slug.length > 0,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async (input: { productId: string; quantity: number }) =>
      (await repository()).addToCart(input.productId, input.quantity),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: { productId: string; rating: number; body: string }) =>
      (await repository()).submitReview(input.productId, input.rating, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const detail = query.data ?? null;

  return {
    product: detail?.product ?? null,
    shop: detail?.shop ?? null,
    reviews: detail?.reviews ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    add: async (quantity) => {
      if (detail === null) return;
      await addMutation.mutateAsync({ productId: detail.product.id, quantity });
    },
    isAdding: addMutation.isPending,
    review: async (rating, body) => {
      if (detail === null) return;
      await reviewMutation.mutateAsync({ productId: detail.product.id, rating, body });
    },
    isReviewing: reviewMutation.isPending,
  };
}

export interface CartResult {
  lines: CartLine[];
  totals: CartTotals;
  canCheckout: boolean;
  isLoading: boolean;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  clear: () => Promise<void>;
  isUpdating: boolean;
}

/**
 * The cart. Quantities live in Postgres so the same cart follows a member
 * between devices, and totals are recomputed from live prices every read.
 */
export function useCart(): CartResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['cart', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchCart(),
    enabled: uid !== null,
    staleTime: 15_000,
  });

  const lines = useMemo(() => query.data ?? [], [query.data]);
  const shopIds = useMemo(() => [...new Set(lines.map((line) => line.shopId))], [lines]);

  const shippingQuery = useQuery({
    queryKey: ['cart-shipping', shopIds.join(',')],
    queryFn: async () => (await repository()).fetchShippingRules(shopIds),
    enabled: shopIds.length > 0,
    staleTime: 300_000,
  });

  const totals = useMemo(
    () => cartTotals(lines, shippingQuery.data ?? new Map()),
    [lines, shippingQuery.data],
  );

  const quantityMutation = useMutation({
    mutationFn: async (input: { productId: string; quantity: number }) =>
      (await repository()).setCartQuantity(input.productId, input.quantity),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => (await repository()).clearCart(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    lines,
    totals,
    canCheckout: canCheckout(lines),
    isLoading: query.isLoading,
    setQuantity: async (productId, quantity) => {
      await quantityMutation.mutateAsync({ productId, quantity });
    },
    remove: async (productId) => {
      await quantityMutation.mutateAsync({ productId, quantity: 0 });
    },
    clear: async () => {
      await clearMutation.mutateAsync();
    },
    isUpdating: quantityMutation.isPending || clearMutation.isPending,
  };
}

export interface CheckoutResult {
  addresses: AddressRow[];
  isLoading: boolean;
  addAddress: (address: {
    recipient: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    district: string;
    postcode: string;
    isDefault: boolean;
  }) => Promise<AddressRow>;
  place: (addressId: string, method: PaymentMethod, note: string) => Promise<PlacedOrder[]>;
  isPlacing: boolean;
}

export function useCheckout(): CheckoutResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['addresses', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchAddresses(uid ?? ''),
    enabled: uid !== null,
    staleTime: 300_000,
  });

  const addressMutation = useMutation({
    mutationFn: async (address: Parameters<CheckoutResult['addAddress']>[0]) =>
      (await repository()).saveAddress(uid ?? '', address),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const placeMutation = useMutation({
    mutationFn: async (input: { addressId: string; method: PaymentMethod; note: string }) =>
      (await repository()).placeOrder(input.addressId, input.method, input.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });

  return {
    addresses: query.data ?? [],
    isLoading: query.isLoading,
    addAddress: (address) => addressMutation.mutateAsync(address),
    place: (addressId, method, note) => placeMutation.mutateAsync({ addressId, method, note }),
    isPlacing: placeMutation.isPending,
  };
}

export interface OrdersResult {
  orders: OrderSummary[];
  isLoading: boolean;
  isError: boolean;
  cancel: (orderId: string, reason: string) => Promise<void>;
  isCancelling: boolean;
}

export function useOrders(): OrdersResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['orders', uid],
    queryFn: async () => (await repository()).fetchOrders(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (input: { orderId: string; reason: string }) =>
      (await repository()).cancelOrder(input.orderId, input.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    cancel: async (orderId, reason) => {
      await cancelMutation.mutateAsync({ orderId, reason });
    },
    isCancelling: cancelMutation.isPending,
  };
}

export interface OrderDetailResult {
  order: OrderRow | null;
  items: OrderItemRow[];
  isLoading: boolean;
}

export function useOrder(orderId: string | undefined): OrderDetailResult {
  const query = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => (await repository()).fetchOrder(orderId ?? ''),
    enabled: orderId !== undefined && orderId.length > 0,
    staleTime: 30_000,
  });

  return {
    order: query.data?.order ?? null,
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
  };
}
