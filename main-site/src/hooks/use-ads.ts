import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdPlacement,
  Campaign,
  CampaignCreative,
  CampaignDay,
  CampaignDraft,
  CreativeDraft,
  ServedAd,
  WalletEntry,
} from '@/lib/ads/ads-types';
import { useAuthStore } from '@/store/auth-store';

const repository = () => import('@/lib/ads/ads-repository');

/** How long a creative must be at least half visible before it counts. */
const VIEWABLE_MS = 1000;

export interface AdSlotResult {
  ad: ServedAd | null;
  isLoading: boolean;
  /** Attach to the rendered ad; starts the viewability timer. */
  ref: (node: HTMLElement | null) => void;
  onClick: () => void;
}

/**
 * One ad for one slot, counted the way the industry agrees an impression
 * should be counted: at least half of it on screen for a full second. The
 * server still deduplicates, so a failed report costs nobody anything.
 */
export function useAdSlot(placement: AdPlacement): AdSlotResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const reported = useRef(false);

  const query = useQuery({
    queryKey: ['ad-slot', placement, uid],
    queryFn: async () => (await repository()).fetchAds(placement, 1),
    staleTime: 120_000,
    retry: false,
  });

  const ad = query.data?.[0] ?? null;

  useEffect(() => {
    reported.current = false;
  }, [ad?.creativeId]);

  useEffect(() => {
    if (node === null || ad === null || typeof IntersectionObserver === 'undefined') return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const creativeId = ad.creativeId;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry !== undefined && entry.isIntersecting) {
          timer ??= setTimeout(() => {
            if (reported.current) return;
            reported.current = true;
            void repository()
              .then(async (module) => module.recordEvent(creativeId, 'impression'))
              .catch(() => undefined);
          }, VIEWABLE_MS);
        } else if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => {
      if (timer !== null) clearTimeout(timer);
      observer.disconnect();
    };
  }, [node, ad]);

  const onClick = useCallback(() => {
    if (ad === null) return;
    void repository()
      .then(async (module) => module.recordEvent(ad.creativeId, 'click'))
      .catch(() => undefined);
  }, [ad]);

  return { ad, isLoading: query.isLoading, ref: setNode, onClick };
}

export interface CampaignsResult {
  campaigns: Campaign[];
  balance: number;
  wallet: WalletEntry[];
  isLoading: boolean;
  isError: boolean;
  create: (draft: CampaignDraft) => Promise<string>;
  addCreative: (campaignId: string, draft: CreativeDraft) => Promise<void>;
  submit: (campaignId: string) => Promise<void>;
  setPaused: (campaignId: string, paused: boolean) => Promise<void>;
  isSaving: boolean;
}

/** The advertiser's own campaigns, wallet and the actions on them. */
export function useCampaigns(): CampaignsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const campaignQuery = useQuery({
    queryKey: ['campaigns', uid],
    queryFn: async () => (await repository()).fetchCampaigns(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const balanceQuery = useQuery({
    queryKey: ['ad-wallet', uid],
    queryFn: async () => (await repository()).fetchWalletBalance(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: ['ad-wallet-history', uid],
    queryFn: async () => (await repository()).fetchWalletHistory(),
    enabled: uid !== null,
    staleTime: 60_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    void queryClient.invalidateQueries({ queryKey: ['ad-wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['creatives'] });
  };

  const createMutation = useMutation({
    mutationFn: async (draft: CampaignDraft) => (await repository()).createCampaign(draft),
    onSuccess: invalidate,
  });

  const creativeMutation = useMutation({
    mutationFn: async (input: { campaignId: string; draft: CreativeDraft }) =>
      (await repository()).addCreative(input.campaignId, input.draft),
    onSuccess: invalidate,
  });

  const submitMutation = useMutation({
    mutationFn: async (campaignId: string) => (await repository()).submitCampaign(campaignId),
    onSuccess: invalidate,
  });

  const pauseMutation = useMutation({
    mutationFn: async (input: { campaignId: string; paused: boolean }) =>
      (await repository()).setCampaignPaused(input.campaignId, input.paused),
    onSuccess: invalidate,
  });

  return {
    campaigns: campaignQuery.data ?? [],
    balance: balanceQuery.data ?? 0,
    wallet: historyQuery.data ?? [],
    isLoading: campaignQuery.isLoading,
    isError: campaignQuery.isError,
    create: async (draft) => createMutation.mutateAsync(draft),
    addCreative: async (campaignId, draft) => {
      await creativeMutation.mutateAsync({ campaignId, draft });
    },
    submit: async (campaignId) => {
      await submitMutation.mutateAsync(campaignId);
    },
    setPaused: async (campaignId, paused) => {
      await pauseMutation.mutateAsync({ campaignId, paused });
    },
    isSaving:
      createMutation.isPending ||
      creativeMutation.isPending ||
      submitMutation.isPending ||
      pauseMutation.isPending,
  };
}

export interface CampaignDetailResult {
  creatives: CampaignCreative[];
  daily: CampaignDay[];
  isLoading: boolean;
}

export function useCampaignDetail(campaignId: string | null): CampaignDetailResult {
  const creativeQuery = useQuery({
    queryKey: ['creatives', campaignId],
    queryFn: async () => (await repository()).fetchCreatives(campaignId ?? ''),
    enabled: campaignId !== null,
    staleTime: 30_000,
  });

  const dailyQuery = useQuery({
    queryKey: ['campaign-daily', campaignId],
    queryFn: async () => (await repository()).fetchDaily(campaignId ?? ''),
    enabled: campaignId !== null,
    staleTime: 60_000,
  });

  return {
    creatives: creativeQuery.data ?? [],
    daily: dailyQuery.data ?? [],
    isLoading: creativeQuery.isLoading,
  };
}
