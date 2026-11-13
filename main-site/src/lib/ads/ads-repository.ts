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
  CreativeCopy,
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
    ...(row.thumb_url ? { thumbUrl: row.thumb_url } : {}),
    ...(row.image_alt ? { imageAlt: row.image_alt } : {}),
    ctaLabel: row.cta_label,
    targetUrl: row.target_url,
    placement: row.placement,
    ...(row.layout ? { layout: row.layout } : {}),
    ...(row.accent_color ? { accentColor: row.accent_color } : {}),
    ...(row.badge_label ? { badgeLabel: row.badge_label } : {}),
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
    ...(row.thumb_url ? { thumbUrl: row.thumb_url } : {}),
    ...(row.image_alt ? { imageAlt: row.image_alt } : {}),
    ctaLabel: row.cta_label,
    targetUrl: row.target_url,
    ...(row.layout ? { layout: row.layout } : {}),
    ...(row.accent_color ? { accentColor: row.accent_color } : {}),
    ...(row.badge_label ? { badgeLabel: row.badge_label } : {}),
    ...(row.platforms ? { platforms: row.platforms } : {}),
    isEnabled: row.is_enabled,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
  };
}

const VIEWER_TOKEN_KEY = 'bsdc_ad_viewer_v1';
let sessionViewerToken = '';

function createViewerToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
}

export function getOrCreateAdViewerToken(): string {
  if (sessionViewerToken.length >= 16) return sessionViewerToken;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(VIEWER_TOKEN_KEY)?.trim() ?? '';
      if (/^[A-Za-z0-9_-]{16,80}$/.test(existing)) {
        sessionViewerToken = existing;
        return sessionViewerToken;
      }
      const next = createViewerToken();
      window.localStorage.setItem(VIEWER_TOKEN_KEY, next);
      sessionViewerToken = next;
      return next;
    }
  } catch {
    // Storage blocked: fall back to per-tab token below.
  }
  sessionViewerToken = createViewerToken();
  return sessionViewerToken;
}

export interface ServeAdsOptions {
  language?: 'bn' | 'en';
  topic?: string;
  city?: string;
}

/** Ads for one slot. Guests are served too; the function leaks no bids. */
export async function fetchAds(
  placement: AdPlacement,
  limit = 1,
  options: ServeAdsOptions = {},
): Promise<ServedAd[]> {
  const args: {
    p_placement: AdPlacement;
    p_limit: number;
    p_platform: 'web';
    p_language?: string;
    p_topic?: string;
    p_city?: string;
  } = {
    p_placement: placement,
    p_limit: limit,
    p_platform: 'web',
  };
  if (options.language) args.p_language = options.language;
  if (options.topic && options.topic.trim().length > 0) args.p_topic = options.topic.trim();
  if (options.city && options.city.trim().length > 0) args.p_city = options.city.trim();

  const { data, error } = await getSupabase().rpc('serve_ads', args).returns<ServedAdRow[]>();
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
    p_viewer_token: getOrCreateAdViewerToken(),
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

/** Copy only: placement, image and destination remain a staff decision. */
export async function editCreativeCopy(creativeId: string, copy: CreativeCopy): Promise<void> {
  const { error } = await getSupabase().rpc('edit_campaign_creative', {
    p_creative_id: creativeId,
    p_headline: copy.headline.trim(),
    p_body: copy.body,
    p_cta_label: copy.ctaLabel,
  });
  if (error) throw toDataError(error);
}

export async function setCampaignPaused(campaignId: string, paused: boolean): Promise<AdStatus> {
  const { data, error } = await getSupabase().rpc('set_campaign_paused', {
    p_campaign_id: campaignId,
    p_paused: paused,
  });
  if (error) throw toDataError(error);
  return data;
}
