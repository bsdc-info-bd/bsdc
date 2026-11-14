import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type * as AdsRepository from '@/lib/ads/ads-repository';
import type * as FirebaseModule from '@/lib/firebase';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdPlacement,
  Campaign,
  CampaignCreative,
  CampaignDay,
  CreativeCopy,
  ServedAd,
} from '@/lib/ads/ads-types';
import { isConfigured } from '@/lib/env';
import { useAuthStore } from '@/store/auth-store';

let repositoryModule: Promise<typeof AdsRepository> | null = null;
const repository = () => {
  repositoryModule ??= import('@/lib/ads/ads-repository').catch((error: unknown) => {
    repositoryModule = null;
    throw error;
  });
  return repositoryModule;
};
let firebaseModule: Promise<typeof FirebaseModule> | null = null;

/** Never cache one Firebase user's answer under another user's query key. */
async function forOwner<T>(uid: string | null, request: () => Promise<T>): Promise<T> {
  firebaseModule ??= import('@/lib/firebase').catch((error: unknown) => {
    firebaseModule = null;
    throw error;
  });
  const { getFirebaseAuth } = await firebaseModule;
  const isCurrent = () =>
    uid !== null &&
    useAuthStore.getState().user?.uid === uid &&
    getFirebaseAuth().currentUser?.uid === uid;
  if (!isCurrent()) throw new Error('auth/account-changed');
  const result = await request();
  if (!isCurrent()) throw new Error('auth/account-changed');
  return result;
}

/** How long a creative must be at least half visible before it counts. */
const VIEWABLE_MS = 1000;

export interface AdSlotResult {
  ad: ServedAd | null;
  isLoading: boolean;
  /** Attach to the rendered ad; starts the viewability timer. */
  ref: (node: HTMLElement | null) => void;
  onClick: () => void;
}

export interface AdSlotOptions {
  topic?: string | undefined;
  city?: string | undefined;
}

/**
 * One ad for one slot, counted the way the industry agrees an impression
 * should be counted: at least half of it on screen for a full second. The
 * server still deduplicates, so a failed report costs nobody anything.
 */
export function useAdSlot(placement: AdPlacement, options: AdSlotOptions = {}): AdSlotResult {
  const { i18n } = useTranslation();
  const language = i18n.language === 'bn' ? 'bn' : 'en';
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const reported = useRef(false);
  const topic = options.topic?.trim() ?? '';
  const city = options.city?.trim() ?? '';

  const query = useQuery({
    queryKey: ['ad-slot', placement, uid, language, topic, city],
    queryFn: async () =>
      (await repository()).fetchAds(placement, 1, {
        language,
        ...(topic.length > 0 ? { topic } : {}),
        ...(city.length > 0 ? { city } : {}),
      }),
    enabled: isConfigured.supabase,
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
  isLoading: boolean;
  isError: boolean;
  setPaused: (campaignId: string, paused: boolean) => Promise<void>;
  editCopy: (creativeId: string, copy: CreativeCopy) => Promise<void>;
  isSaving: boolean;
}

/** Only the signed-in owner's reporting and permitted controls. */
export function useCampaigns(): CampaignsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const campaignQuery = useQuery({
    queryKey: ['campaigns', uid],
    queryFn: async () => forOwner(uid, async () => (await repository()).fetchCampaigns()),
    enabled: uid !== null,
    staleTime: 30_000,
  });
  const balanceQuery = useQuery({
    queryKey: ['ad-wallet', uid],
    queryFn: async () => forOwner(uid, async () => (await repository()).fetchWalletBalance()),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['campaigns', uid] });
    void queryClient.invalidateQueries({ queryKey: ['creatives', uid] });
  };
  const pauseMutation = useMutation({
    mutationFn: async (input: { campaignId: string; paused: boolean }) =>
      forOwner(uid, async () =>
        (await repository()).setCampaignPaused(input.campaignId, input.paused),
      ),
    onSuccess: invalidate,
  });
  const copyMutation = useMutation({
    mutationFn: async (input: { creativeId: string; copy: CreativeCopy }) =>
      forOwner(uid, async () =>
        (await repository()).editCreativeCopy(input.creativeId, input.copy),
      ),
    onSuccess: invalidate,
  });

  return {
    campaigns: campaignQuery.data ?? [],
    balance: balanceQuery.data ?? 0,
    isLoading: campaignQuery.isLoading || balanceQuery.isLoading,
    isError: campaignQuery.isError || balanceQuery.isError,
    setPaused: async (campaignId, paused) => {
      await pauseMutation.mutateAsync({ campaignId, paused });
    },
    editCopy: async (creativeId, copy) => {
      await copyMutation.mutateAsync({ creativeId, copy });
    },
    isSaving: pauseMutation.isPending || copyMutation.isPending,
  };
}

export interface CampaignDetailResult {
  creatives: CampaignCreative[];
  daily: CampaignDay[];
  isLoading: boolean;
  isError: boolean;
}

export function useCampaignDetail(campaignId: string | null): CampaignDetailResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const creativeQuery = useQuery({
    queryKey: ['creatives', uid, campaignId],
    queryFn: async () =>
      forOwner(uid, async () => (await repository()).fetchCreatives(campaignId ?? '')),
    enabled: uid !== null && campaignId !== null,
    staleTime: 30_000,
  });

  const dailyQuery = useQuery({
    queryKey: ['campaign-daily', uid, campaignId],
    queryFn: async () =>
      forOwner(uid, async () => (await repository()).fetchDaily(campaignId ?? '')),
    enabled: uid !== null && campaignId !== null,
    staleTime: 60_000,
  });

  return {
    creatives: creativeQuery.data ?? [],
    daily: dailyQuery.data ?? [],
    isLoading: creativeQuery.isLoading || dailyQuery.isLoading,
    isError: creativeQuery.isError || dailyQuery.isError,
  };
}
