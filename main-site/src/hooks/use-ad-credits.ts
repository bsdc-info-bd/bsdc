import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decideAdCreditRequest,
  fetchAdCreditQueue,
  fetchMyAdCredits,
  requestAdCredits,
  type AdCreditQueueRow,
  type MyAdCredits,
} from '@/lib/ads/ads-repository';
import { useAuthStore } from '@/store/auth-store';

/**
 * Advertising credit hooks.
 *
 * The repository is imported lazily for the same reason the rest of the app
 * does it: the ads bundle is only downloaded by someone who opens an
 * advertising screen.
 */
const repository = () => import('@/lib/ads/ads-repository');

export interface AdCreditsResult {
  data: MyAdCredits | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

/** The signed-in advertiser's wallet and request history. */
export function useAdCredits(enabled: boolean): AdCreditsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const query = useQuery({
    queryKey: ['ad-credits', uid],
    queryFn: () => fetchMyAdCredits(),
    enabled: enabled && uid !== null,
    staleTime: 30_000,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * The platform's bKash receiving number, from `ad_payment_instructions()`.
 *
 * Null when the deployment has not configured one. The buying panel says so
 * rather than showing an empty box the member is expected to fill in.
 */
export function useAdBikashNumber(enabled: boolean): string | null {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const query = useQuery({
    queryKey: ['ad-payment-instructions', uid],
    queryFn: async () => (await repository()).fetchPaymentInstructions(),
    enabled: enabled && uid !== null,
    staleTime: 300_000,
  });
  return query.data?.bikashNumber ?? null;
}

/** Asks for credits. Invalidates the wallet as soon as the server answers. */
export function useRequestAdCredits() {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { credits: number; senderNumber: string; txnId: string }) =>
      requestAdCredits(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ad-credits', uid] });
      void queryClient.invalidateQueries({ queryKey: ['ad-wallet', uid] });
    },
  });
}

export interface AdCreditQueueResult {
  rows: AdCreditQueueRow[];
  isLoading: boolean;
  isError: boolean;
  /** Refetch the queue without losing the current tab's rows. */
  refresh: () => Promise<void>;
  decide: (id: string, decision: 'approve' | 'reject', note?: string) => Promise<void>;
  isDeciding: boolean;
  decidingId: string | null;
}

/** The staff review queue. Enabled only for someone holding the permission. */
export function useAdCreditQueue(
  status: 'pending' | 'approved' | 'rejected',
  enabled: boolean,
): AdCreditQueueResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['ad-credit-queue', status],
    queryFn: () => fetchAdCreditQueue(status),
    enabled,
    staleTime: 15_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: { id: string; decision: 'approve' | 'reject'; note: string }) =>
      (await repository()).decideAdCreditRequest(input.id, input.decision, input.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ad-credit-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['ad-wallet'] });
    },
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: async () => {
      await query.refetch();
    },
    decide: async (id, decision, note = '') => {
      await mutation.mutateAsync({ id, decision, note });
    },
    isDeciding: mutation.isPending,
    decidingId: mutation.isPending ? (mutation.variables?.id ?? null) : null,
  };
}

// Re-exported so screens can type their props without reaching into the repo.
export { decideAdCreditRequest };
export type { AdCreditQueueRow, MyAdCredits };
