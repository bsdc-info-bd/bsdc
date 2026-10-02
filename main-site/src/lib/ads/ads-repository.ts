import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  AdWalletHistoryRow,
  CampaignCreativeRow,
  CampaignDayRow,
  MyCampaignRow,
  ServedAdRow,
} from '@/lib/supabase/types';
import type {
  AdEventKind,
  AdPlacement,
  AdStatus,
  Campaign,
  CampaignCreative,
  CampaignDay,
  CampaignDraft,
  CreativeDraft,
  ServedAd,
  WalletEntry,
} from './ads-types';

function toServed(row: ServedAdRow): ServedAd {
  return {
    creativeId: row.creative_id,
    campaignId: row.campaign_id,
    headline: row.headline,
    body: row.body,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    targetUrl: row.target_url,
    placement: row.placement,
  };
}

function toCampaign(row: MyCampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    pricing: row.pricing,
    bid: row.bid,
    totalBudget: row.total_budget,
    dailyBudget: row.daily_budget,
    spent: row.spent,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reviewNote: row.review_note,
    creativeCount: row.creative_count,
    impressions: row.impressions,
    clicks: row.clicks,
    spendToday: row.spend_today,
  };
}

function toCreative(row: CampaignCreativeRow): CampaignCreative {
  return {
    id: row.id,
    placement: row.placement,
    headline: row.headline,
    body: row.body,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    targetUrl: row.target_url,
    isEnabled: row.is_enabled,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
  };
}

/** Ads for one slot. Guests are served too; the function leaks no bids. */
export async function fetchAds(placement: AdPlacement, limit = 1): Promise<ServedAd[]> {
  const { data, error } = await getSupabase()
    .rpc('serve_ads', { p_placement: placement, p_limit: limit })
    .returns<ServedAdRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toServed);
}

/**
 * Report a viewed or clicked ad. The database decides whether it counts, so
 * a repeated call is harmless and never charges twice.
 */
export async function recordEvent(creativeId: string, kind: AdEventKind): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('record_ad_event', {
    p_creative_id: creativeId,
    p_kind: kind,
  });
  if (error) throw toDataError(error);
  return data === true;
}

export async function fetchCampaigns(limit = 50): Promise<Campaign[]> {
  const { data, error } = await getSupabase()
    .rpc('my_campaigns', { p_limit: limit })
    .returns<MyCampaignRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toCampaign);
}

export async function fetchCreatives(campaignId: string): Promise<CampaignCreative[]> {
  const { data, error } = await getSupabase()
    .rpc('campaign_creatives', { p_campaign_id: campaignId })
    .returns<CampaignCreativeRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toCreative);
}

export async function fetchDaily(campaignId: string, days = 14): Promise<CampaignDay[]> {
  const { data, error } = await getSupabase()
    .rpc('campaign_daily', { p_campaign_id: campaignId, p_days: days })
    .returns<CampaignDayRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    day: row.day,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
  }));
}

export async function fetchWalletBalance(): Promise<number> {
  const { data, error } = await getSupabase().rpc('ad_wallet_balance');
  if (error) throw toDataError(error);
  return data ?? 0;
}

export async function fetchWalletHistory(limit = 50): Promise<WalletEntry[]> {
  const { data, error } = await getSupabase()
    .rpc('ad_wallet_history', { p_limit: limit })
    .returns<AdWalletHistoryRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    memo: row.memo,
    reference: row.reference,
    createdAt: row.created_at,
  }));
}

export async function createCampaign(draft: CampaignDraft): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_campaign', {
    p_name: draft.name.trim(),
    p_pricing: draft.pricing,
    p_bid: draft.bid,
    p_total_budget: draft.totalBudget,
    p_daily_budget: draft.dailyBudget,
    p_cities: draft.cities,
    p_topics: draft.topics,
    p_language: draft.language,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function addCreative(campaignId: string, draft: CreativeDraft): Promise<string> {
  const { data, error } = await getSupabase().rpc('add_creative', {
    p_campaign_id: campaignId,
    p_placement: draft.placement,
    p_headline: draft.headline.trim(),
    p_body: draft.body.trim(),
    p_target_url: draft.targetUrl.trim(),
    p_image_url: draft.imageUrl.trim(),
    p_cta_label: draft.ctaLabel.trim(),
  });
  if (error) throw toDataError(error);
  return data;
}

export async function submitCampaign(campaignId: string): Promise<AdStatus> {
  const { data, error } = await getSupabase().rpc('submit_campaign', {
    p_campaign_id: campaignId,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function setCampaignPaused(campaignId: string, paused: boolean): Promise<AdStatus> {
  const { data, error } = await getSupabase().rpc('set_campaign_paused', {
    p_campaign_id: campaignId,
    p_paused: paused,
  });
  if (error) throw toDataError(error);
  return data;
}
