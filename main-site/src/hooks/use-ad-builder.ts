import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type * as AdsRepository from '@/lib/ads/ads-repository';
import type { AdPaymentInstructions, AdPaymentRequest } from '@/lib/ads/ads-types';
import { useCallback } from 'react';
import { forOwner } from '@/hooks/use-ads';
import type { Json } from '@/lib/supabase/types';
import { useAuthStore } from '@/store/auth-store';

let repositoryModule: Promise<typeof AdsRepository> | null = null;
const repository = () => {
  repositoryModule ??= import('@/lib/ads/ads-repository').catch((error: unknown) => {
    repositoryModule = null;
    throw error;
  });
  return repositoryModule;
};

/** The advertiser's payment requests, newest first, keyed by campaign id. */
export interface AdBuilderResult {
  instructions: AdPaymentInstructions | null;
  instructionsError: boolean;
  requests: AdPaymentRequest[];
  isRequestsLoading: boolean;
  createCampaign: (payload: Json) => Promise<string>;
  submitPayment: (
    campaignId: string,
    input: { sender: string; account: string; txn: string },
  ) => Promise<void>;
  sendForReview: (campaignId: string) => Promise<void>;
  isCreating: boolean;
  isPaying: boolean;
  isSending: boolean;
}

/**
 * Everything the advertiser's self-service flow needs. Every mutation refreshes
 * the campaign list and the wallet, because a payment decision changes both.
 */
export function useAdBuilder(): AdBuilderResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const instructionsQuery = useQuery({
    queryKey: ['ad-payment-instructions'],
    queryFn: async () => (await repository()).fetchPaymentInstructions(),
    staleTime: 60_000,
    enabled: uid !== null,
  });
  const requestsQuery = useQuery({
    queryKey: ['ad-payment-requests', uid],
    queryFn: async () => forOwner(uid, async () => (await repository()).fetchPaymentRequests()),
    enabled: uid !== null,
    staleTime: 15_000,
  });

  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['campaigns', uid] });
    void queryClient.invalidateQueries({ queryKey: ['ad-wallet', uid] });
    void queryClient.invalidateQueries({ queryKey: ['ad-payment-requests', uid] });
  }, [queryClient, uid]);

  const createMutation = useMutation({
    mutationFn: async (payload: Json) =>
      forOwner(uid, async () => (await repository()).createCampaign(payload)),
    onSuccess: refresh,
  });
  const payMutation = useMutation({
    mutationFn: async (input: {
      campaignId: string;
      sender: string;
      account: string;
      txn: string;
    }) =>
      forOwner(uid, async () =>
        (await repository()).submitPayment(input.campaignId, {
          sender: input.sender,
          account: input.account,
          txn: input.txn,
        }),
      ),
    onSuccess: refresh,
  });
  const sendMutation = useMutation({
    mutationFn: async (campaignId: string) =>
      forOwner(uid, async () => (await repository()).sendForReview(campaignId)),
    onSuccess: refresh,
  });

  return {
    instructions: instructionsQuery.data ?? null,
    instructionsError: instructionsQuery.isError,
    requests: requestsQuery.data ?? [],
    isRequestsLoading: requestsQuery.isLoading,
    createCampaign: (payload) => createMutation.mutateAsync(payload),
    submitPayment: async (campaignId, input) => {
      await payMutation.mutateAsync({ campaignId, ...input });
    },
    sendForReview: async (campaignId) => {
      await sendMutation.mutateAsync(campaignId);
    },
    isCreating: createMutation.isPending,
    isPaying: payMutation.isPending,
    isSending: sendMutation.isPending,
  };
}
