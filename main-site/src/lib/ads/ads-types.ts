import type {
  DbAdEventKind,
  DbAdPlacement,
  DbAdPricing,
  DbAdStatus,
  DbAdWalletKind,
} from '@/lib/supabase/types';

export type AdStatus = DbAdStatus;
export type AdPlacement = DbAdPlacement;
export type AdPricing = DbAdPricing;
export type AdEventKind = DbAdEventKind;
export type AdWalletKind = DbAdWalletKind;

export const AD_PLACEMENTS: readonly AdPlacement[] = [
  'feed',
  'sidebar',
  'shop',
  'search',
  'article',
] as const;

export interface ServedAd {
  creativeId: string;
  campaignId: string;
  headline: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  targetUrl: string;
  placement: AdPlacement;
}

export interface Campaign {
  id: string;
  name: string;
  status: AdStatus;
  pricing: AdPricing;
  bid: number;
  totalBudget: number;
  dailyBudget: number;
  spent: number;
  startsAt: string;
  endsAt: string | null;
  reviewNote: string;
  creativeCount: number;
  impressions: number;
  clicks: number;
  spendToday: number;
}

export interface CampaignCreative {
  id: string;
  placement: AdPlacement;
  headline: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  targetUrl: string;
  isEnabled: boolean;
  impressions: number;
  clicks: number;
  spend: number;
}

export interface CampaignDay {
  day: string;
  impressions: number;
  clicks: number;
  spend: number;
}

export interface WalletEntry {
  id: string;
  kind: AdWalletKind;
  amount: number;
  memo: string;
  reference: string;
  createdAt: string;
}

/**
 * What one event costs, mirroring bsdc.ad_event_cost() exactly — including
 * the truncation of Postgres integer division, so the figure a screen shows
 * is the figure the database will charge.
 */
export function eventCost(pricing: AdPricing, bid: number, kind: AdEventKind): number {
  if (pricing === 'cpm' && kind === 'impression') return Math.trunc(bid / 1000);
  if (pricing === 'cpc' && kind === 'click') return bid;
  return 0;
}

/** Money left in a campaign, never below zero. */
export function budgetRemaining(campaign: Pick<Campaign, 'totalBudget' | 'spent'>): number {
  return Math.max(0, campaign.totalBudget - campaign.spent);
}

/** How much of the budget has been used, 0 to 1. */
export function budgetProgress(campaign: Pick<Campaign, 'totalBudget' | 'spent'>): number {
  if (campaign.totalBudget <= 0) return 0;
  return Math.min(1, campaign.spent / campaign.totalBudget);
}

/** Click-through rate as a percentage; no impressions means no rate at all. */
export function clickThroughRate(impressions: number, clicks: number): number {
  if (impressions <= 0) return 0;
  return Math.round((clicks / impressions) * 10000) / 100;
}

/** What the advertiser actually paid for each click they received. */
export function effectiveCostPerClick(spend: number, clicks: number): number {
  if (clicks <= 0) return 0;
  return Math.round(spend / clicks);
}

/** The reach a budget can buy at the current bid, as whole events. */
export function forecastEvents(
  pricing: AdPricing,
  bid: number,
  budget: number,
): { impressions: number; clicks: number } {
  const perImpression = eventCost(pricing, bid, 'impression');
  const perClick = eventCost(pricing, bid, 'click');
  return {
    impressions: perImpression > 0 ? Math.floor(budget / perImpression) : 0,
    clicks: perClick > 0 ? Math.floor(budget / perClick) : 0,
  };
}

/**
 * Whether a campaign can be shown right now. This repeats the serve_ads
 * predicate so a dashboard can explain a silent campaign without guessing.
 */
export function isServable(campaign: Campaign, now = new Date()): boolean {
  if (campaign.status !== 'active') return false;
  if (new Date(campaign.startsAt).getTime() > now.getTime()) return false;
  if (campaign.endsAt !== null && new Date(campaign.endsAt).getTime() <= now.getTime()) {
    return false;
  }
  if (campaign.spent >= campaign.totalBudget) return false;
  if (campaign.dailyBudget > 0 && campaign.spendToday >= campaign.dailyBudget) return false;
  return true;
}

/** Why a campaign is not being shown, as a translation key. */
export function pauseReasonKey(campaign: Campaign, now = new Date()): string | null {
  if (isServable(campaign, now)) return null;
  if (campaign.status !== 'active') return `ads.statuses.${campaign.status}`;
  if (campaign.spent >= campaign.totalBudget) return 'ads.reasons.budgetSpent';
  if (campaign.dailyBudget > 0 && campaign.spendToday >= campaign.dailyBudget) {
    return 'ads.reasons.dailyCap';
  }
  if (new Date(campaign.startsAt).getTime() > now.getTime()) return 'ads.reasons.notStarted';
  return 'ads.reasons.ended';
}

/** The owner may only pause a live campaign, or resume a paused one. */
export function canPause(status: AdStatus): boolean {
  return status === 'active';
}

export function canResume(status: AdStatus): boolean {
  return status === 'paused';
}

export function canSubmit(status: AdStatus): boolean {
  return status === 'draft' || status === 'rejected' || status === 'paused';
}

export function canEdit(status: AdStatus): boolean {
  return status === 'draft' || status === 'rejected';
}

export interface CampaignDraft {
  name: string;
  pricing: AdPricing;
  /** Poisha per thousand impressions, or per click. */
  bid: number;
  totalBudget: number;
  dailyBudget: number;
  cities: string[];
  topics: string[];
  language: 'any' | 'bn' | 'en';
}

export interface CreativeDraft {
  placement: AdPlacement;
  headline: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  targetUrl: string;
}

export interface AdProblem {
  field: string;
  key: string;
}

const HTTPS = /^https:\/\/\S{4,500}$/;

/** Every check the database will make, made here first so nobody waits. */
export function validateCampaign(draft: CampaignDraft): AdProblem[] {
  const problems: AdProblem[] = [];
  const name = draft.name.trim();

  if (name.length < 3 || name.length > 120) {
    problems.push({ field: 'name', key: 'ads.errors.name' });
  }
  if (!Number.isInteger(draft.bid) || draft.bid < 100 || draft.bid > 10_000_000) {
    problems.push({ field: 'bid', key: 'ads.errors.bid' });
  }
  if (!Number.isInteger(draft.totalBudget) || draft.totalBudget < 1000) {
    problems.push({ field: 'totalBudget', key: 'ads.errors.totalBudget' });
  }
  if (!Number.isInteger(draft.dailyBudget) || draft.dailyBudget < 0) {
    problems.push({ field: 'dailyBudget', key: 'ads.errors.dailyBudget' });
  } else if (draft.dailyBudget > 0 && draft.dailyBudget > draft.totalBudget) {
    problems.push({ field: 'dailyBudget', key: 'ads.errors.dailyOverTotal' });
  }
  // A bid nobody can afford to serve once is a bid that will never spend.
  if (
    draft.totalBudget > 0 &&
    eventCost(draft.pricing, draft.bid, draft.pricing === 'cpm' ? 'impression' : 'click') >
      draft.totalBudget
  ) {
    problems.push({ field: 'bid', key: 'ads.errors.bidOverBudget' });
  }

  return problems;
}

export function validateCreative(draft: CreativeDraft): AdProblem[] {
  const problems: AdProblem[] = [];
  const headline = draft.headline.trim();

  if (headline.length < 3 || headline.length > 80) {
    problems.push({ field: 'headline', key: 'ads.errors.headline' });
  }
  if (draft.body.length > 200) problems.push({ field: 'body', key: 'ads.errors.body' });
  if (!HTTPS.test(draft.targetUrl.trim())) {
    problems.push({ field: 'targetUrl', key: 'ads.errors.targetUrl' });
  }
  if (draft.ctaLabel.length > 32) problems.push({ field: 'ctaLabel', key: 'ads.errors.ctaLabel' });

  return problems;
}

/** Taka a person typed, as the poisha the database stores. */
export function takaToPoisha(input: string): number {
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed) || parsed < 0) return -1;
  return Math.round(parsed * 100);
}
