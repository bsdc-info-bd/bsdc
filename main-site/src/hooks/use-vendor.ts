import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { OrderStatus } from '@/lib/market/market-types';
import type { PayoutAccountRow } from '@/lib/supabase/types';
import type {
  LedgerEntry,
  PayoutRequest,
  ProductDraft,
  ShopDashboard,
  ShopOrder,
  ShopProduct,
} from '@/lib/vendor/vendor-types';
import { useAuthStore } from '@/store/auth-store';

const repository = () => import('@/lib/vendor/vendor-repository');

export interface VendorShopResult {
  shop: ShopDashboard | null;
  isLoading: boolean;
  isError: boolean;
  open: (input: { slug: string; name: string; tagline: string; city: string }) => Promise<void>;
  isOpening: boolean;
}

/**
 * The shop behind the signed-in member. A member without one gets null, and
 * the dashboard offers to open one instead of pretending a shop exists.
 */
export function useVendorShop(): VendorShopResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['vendor-shop', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchMyShop(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const openMutation = useMutation({
    mutationFn: async (input: { slug: string; name: string; tagline: string; city: string }) =>
      (await repository()).openShop(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vendor-shop'] });
    },
  });

  return {
    shop: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    open: async (input) => {
      await openMutation.mutateAsync(input);
    },
    isOpening: openMutation.isPending,
  };
}

export interface VendorOrdersResult {
  orders: ShopOrder[];
  openCount: number;
  isLoading: boolean;
  advance: (orderId: string, status: OrderStatus) => Promise<void>;
  markPaid: (orderId: string, reference: string) => Promise<void>;
  isSaving: boolean;
}

export function useVendorOrders(): VendorOrdersResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['vendor-orders', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchShopOrders(),
    enabled: uid !== null,
    staleTime: 15_000,
  });

  const orders = useMemo(() => query.data ?? [], [query.data]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['vendor-shop'] });
    void queryClient.invalidateQueries({ queryKey: ['vendor-ledger'] });
  };

  const advanceMutation = useMutation({
    mutationFn: async (input: { orderId: string; status: OrderStatus }) =>
      (await repository()).advanceOrder(input.orderId, input.status),
    onSuccess: invalidate,
  });

  const paidMutation = useMutation({
    mutationFn: async (input: { orderId: string; reference: string }) =>
      (await repository()).markOrderPaid(input.orderId, input.reference),
    onSuccess: invalidate,
  });

  return {
    orders,
    openCount: orders.filter((order) => order.nextStatuses.length > 0).length,
    isLoading: query.isLoading,
    advance: async (orderId, status) => {
      await advanceMutation.mutateAsync({ orderId, status });
    },
    markPaid: async (orderId, reference) => {
      await paidMutation.mutateAsync({ orderId, reference });
    },
    isSaving: advanceMutation.isPending || paidMutation.isPending,
  };
}

export interface VendorProductsResult {
  products: ShopProduct[];
  isLoading: boolean;
  create: (shopId: string, draft: ProductDraft) => Promise<void>;
  publish: (productId: string, publish: boolean) => Promise<void>;
  restock: (productId: string, delta: number) => Promise<void>;
  isSaving: boolean;
}

export function useVendorProducts(): VendorProductsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['vendor-products', uid],
    queryFn: async () => (await repository()).fetchShopProducts(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['vendor-products'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: { shopId: string; draft: ProductDraft }) =>
      (await repository()).createProduct(input.shopId, input.draft),
    onSuccess: invalidate,
  });

  const publishMutation = useMutation({
    mutationFn: async (input: { productId: string; publish: boolean }) =>
      (await repository()).publishProduct(input.productId, input.publish),
    onSuccess: invalidate,
  });

  const restockMutation = useMutation({
    mutationFn: async (input: { productId: string; delta: number }) =>
      (await repository()).restockProduct(input.productId, input.delta),
    onSuccess: invalidate,
  });

  return {
    products: query.data ?? [],
    isLoading: query.isLoading,
    create: async (shopId, draft) => {
      await createMutation.mutateAsync({ shopId, draft });
    },
    publish: async (productId, publish) => {
      await publishMutation.mutateAsync({ productId, publish });
    },
    restock: async (productId, delta) => {
      await restockMutation.mutateAsync({ productId, delta });
    },
    isSaving: createMutation.isPending || publishMutation.isPending || restockMutation.isPending,
  };
}

export interface VendorPayoutsResult {
  entries: LedgerEntry[];
  payouts: PayoutRequest[];
  accounts: PayoutAccountRow[];
  isLoading: boolean;
  request: (accountId: string, amount: number) => Promise<void>;
  addAccount: (input: {
    method: PayoutAccountRow['method'];
    accountName: string;
    accountRef: string;
    bankName: string;
    branch: string;
  }) => Promise<void>;
  isSaving: boolean;
}

/** Ledger, payout history and the accounts money may be sent to. */
export function useVendorPayouts(shopId: string | null): VendorPayoutsResult {
  const queryClient = useQueryClient();

  const ledgerQuery = useQuery({
    queryKey: ['vendor-ledger', shopId],
    queryFn: async () => (await repository()).fetchLedger(),
    enabled: shopId !== null,
    staleTime: 30_000,
  });

  const payoutQuery = useQuery({
    queryKey: ['vendor-payouts', shopId],
    queryFn: async () => (await repository()).fetchPayouts(),
    enabled: shopId !== null,
    staleTime: 30_000,
  });

  const accountQuery = useQuery({
    queryKey: ['vendor-accounts', shopId],
    queryFn: async () => (await repository()).fetchPayoutAccounts(shopId ?? ''),
    enabled: shopId !== null,
    staleTime: 300_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['vendor-ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['vendor-payouts'] });
    void queryClient.invalidateQueries({ queryKey: ['vendor-accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['vendor-shop'] });
  };

  const requestMutation = useMutation({
    mutationFn: async (input: { accountId: string; amount: number }) =>
      (await repository()).requestPayout(input.accountId, input.amount),
    onSuccess: invalidate,
  });

  const accountMutation = useMutation({
    mutationFn: async (input: {
      method: PayoutAccountRow['method'];
      accountName: string;
      accountRef: string;
      bankName: string;
      branch: string;
    }) => (await repository()).savePayoutAccount({ ...input, shopId: shopId ?? '' }),
    onSuccess: invalidate,
  });

  return {
    entries: ledgerQuery.data ?? [],
    payouts: payoutQuery.data ?? [],
    accounts: accountQuery.data ?? [],
    isLoading: ledgerQuery.isLoading || payoutQuery.isLoading,
    request: async (accountId, amount) => {
      await requestMutation.mutateAsync({ accountId, amount });
    },
    addAccount: async (input) => {
      if (shopId === null) return;
      await accountMutation.mutateAsync(input);
    },
    isSaving: requestMutation.isPending || accountMutation.isPending,
  };
}
