import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase/client';
import type { OrderStatus } from '@/lib/mk/mk-logic';
import * as repo from '@/lib/mk/mk-repository';
import { useAuthStore } from '@/store/auth-store';

const KEYS = {
  dashboard: ['mk', 'dashboard'] as const,
  orders: ['mk', 'orders'] as const,
  catalog: ['mk', 'catalog'] as const,
  application: ['mk', 'application'] as const,
  payment: ['mk', 'payment'] as const,
  shops: ['mk', 'shops'] as const,
};

export function usePaymentInstructions() {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  return useQuery({
    queryKey: [...KEYS.payment, uid],
    queryFn: repo.fetchPaymentInstructions,
    enabled: uid !== null,
    staleTime: 60_000,
  });
}

export function useMyApplication() {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  return useQuery({
    queryKey: [...KEYS.application, uid],
    queryFn: repo.fetchMyApplication,
    enabled: uid !== null,
    staleTime: 15_000,
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: repo.submitVendorApplication,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.application });
      void queryClient.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useVendorDashboard() {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  return useQuery({
    queryKey: [...KEYS.dashboard, uid],
    queryFn: repo.fetchVendorDashboard,
    enabled: uid !== null,
    staleTime: 15_000,
  });
}

/**
 * The vendor's orders, kept live. Any change to an order row the vendor can
 * see (RLS limits the stream to their own orders) refreshes the list at once.
 */
export function useVendorOrders(enabled: boolean) {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...KEYS.orders, uid],
    queryFn: () => repo.fetchVendorOrders(null),
    enabled: uid !== null && enabled,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (uid === null || !enabled) return undefined;
    const channel = getSupabase()
      .channel(`mk-vendor-orders-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mk_orders' },
        () => {
          void queryClient.invalidateQueries({ queryKey: KEYS.orders });
          void queryClient.invalidateQueries({ queryKey: KEYS.dashboard });
        },
      )
      .subscribe();
    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [uid, enabled, queryClient]);

  return query;
}

export function useSetOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string; next: OrderStatus; reason?: string }) =>
      repo.setVendorOrderStatus(input.orderId, input.next, input.reason ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.orders });
      void queryClient.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useVendorCatalog(enabled: boolean) {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  return useQuery({
    queryKey: [...KEYS.catalog, uid],
    queryFn: repo.fetchVendorCatalog,
    enabled: uid !== null && enabled,
    staleTime: 15_000,
  });
}

export function useCatalogMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEYS.catalog });
  };
  return {
    saveCategory: useMutation({
      mutationFn: (input: { id: string | null; name: string; sort: number }) =>
        repo.saveVendorCategory(input.id, input.name, input.sort),
      onSuccess: refresh,
    }),
    saveProduct: useMutation({
      mutationFn: (input: { id: string | null; payload: repo.ProductPayload }) =>
        repo.saveVendorProduct(input.id, input.payload),
      onSuccess: refresh,
    }),
  };
}

export function useUpdateShopProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: repo.updateVendorProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useBuyCredits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      packageCode: '10' | '50' | '100';
      sender: string;
      holder: string;
      txnId: string;
    }) => repo.buyCredits(input.packageCode, input.sender, input.holder, input.txnId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useListedShops(type: string | null, query: string, origin: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: [...KEYS.shops, type, query, origin?.lat ?? null, origin?.lng ?? null],
    queryFn: () => repo.listShops(type, query, origin),
    staleTime: 30_000,
  });
}
