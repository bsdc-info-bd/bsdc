/**
 * The campaign builder's rules, kept out of the screen so they can be tested
 * without a browser and compared against the database.
 *
 * Two things live here that matter more than they look:
 *
 *   * `eventCost` mirrors `bsdc.ad_event_cost` exactly, including its integer
 *     truncation. A CPM bid of 1,500 poisha pays 1 poisha per impression — not
 *     1.5, because there is no such coin. If this file rounded and the
 *     database truncated, a forecast would be wrong by up to a whole poisha on
 *     every event, and a campaign built on a forecast that is one poisha high
 *     ends one poisha short of its budget. The proof harness asserts the two
 *     agree.
 *   * `toDraft` and `validateDraft` are the whole create form: taka in, poisha
 *     out, and every constraint in `0022_ads.sql` checked before the round trip
 *     so an operator reads a sentence instead of a constraint name.
 */

export type AdPricing = 'cpm' | 'cpc';

export type AdStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'paused' | 'completed';

export type AdPlacement = 'feed' | 'sidebar' | 'search' | 'shop' | 'article';

export type AdLayout = 'banner' | 'card' | 'compact' | 'native';

export type AdPlatform = 'web' | 'android';

export interface CampaignDraft {
  readonly ownerUid: string;
  readonly name: string;
  readonly pricing: AdPricing;
  readonly bid: number;
  readonly totalBudget: number;
  readonly dailyBudget: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly cities: readonly string[];
  readonly topics: readonly string[];
  readonly language: string;
  readonly activate: boolean;
}

export interface CreativeDraft {
  readonly placement: AdPlacement;
  readonly headline: string;
  readonly body: string;
  readonly targetUrl: string;
  readonly imageUrl: string;
  readonly ctaLabel: string;
  readonly thumbUrl?: string;
  readonly imageAlt?: string;
  readonly layout?: AdLayout;
  readonly accentColor?: string;
  readonly badgeLabel?: string;
  readonly platforms?: readonly AdPlatform[];
  readonly isEnabled?: boolean;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export interface CampaignRow {
  readonly campaign_id: string;
  readonly owner_uid: string;
  readonly owner_name: string;
  readonly name: string;
  readonly status: AdStatus;
  readonly pricing: AdPricing;
  readonly bid: number;
  readonly total_budget: number;
  readonly spent: number;
  readonly budget_used_pct: number | string;
  readonly impressions: number;
  readonly clicks: number;
  readonly ctr: number | string;
  readonly cost_per_click: number;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly creative_count: number;
}

export interface CampaignDetailRow {
  readonly campaign_id: string;
  readonly owner_uid: string;
  readonly name: string;
  readonly status: AdStatus;
  readonly pricing: AdPricing;
  readonly bid: number;
  readonly total_budget: number;
  readonly daily_budget: number;
  readonly spent: number;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly target_cities: readonly string[];
  readonly target_topics: readonly string[];
  readonly target_language: 'any' | 'bn' | 'en';
  readonly review_note: string;
}

export interface OwnerRow {
  readonly uid: string;
  readonly username: string;
  readonly display_name: string;
  readonly avatar_url: string;
  readonly status: string;
  readonly campaigns: number;
  readonly active_campaigns: number;
  readonly wallet_balance: number;
  readonly lifetime_spend: number;
  readonly last_campaign_at: string | null;
}

export interface PlacementRow {
  readonly placement: AdPlacement;
  readonly live_campaigns: number;
  readonly impressions_today: number;
  readonly clicks_today: number;
  readonly spend_today: number;
  readonly ctr_today: number | string;
  readonly floor_bid: number;
}

export interface PerformanceRow {
  readonly campaign_id: string;
  readonly name: string;
  readonly status: AdStatus;
  readonly pricing: AdPricing;
  readonly bid: number;
  readonly total_budget: number;
  readonly daily_budget: number;
  readonly spent: number;
  readonly remaining: number;
  readonly budget_used_pct: number | string;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly days_running: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly ctr: number | string;
  readonly cost_per_click: number;
  readonly cost_per_mille: number;
  readonly spend_today: number;
  readonly impressions_today: number;
  readonly clicks_today: number;
  readonly wallet_balance: number;
  readonly creative_count: number;
  readonly active_creatives: number;
  readonly review_note: string;
}

export interface CreativePerformanceRow {
  readonly creative_id: string;
  readonly placement: AdPlacement;
  readonly headline: string;
  readonly body: string;
  readonly image_url: string;
  readonly cta_label: string;
  readonly target_url: string;
  readonly is_enabled: boolean;
  readonly impressions: number;
  readonly clicks: number;
  readonly spend: number;
  readonly ctr: number | string;
  readonly cost_per_click: number;
  readonly thumb_url: string;
  readonly image_alt: string;
  readonly layout: AdLayout;
  readonly accent_color: string;
  readonly badge_label: string;
  readonly platforms: readonly AdPlatform[];
}

export interface DayRow {
  readonly day: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly spend: number;
  readonly ctr: number | string;
}

export const PLACEMENTS: readonly AdPlacement[] = ['feed', 'sidebar', 'search', 'shop', 'article'];

export const PLACEMENT_LABELS: Readonly<Record<AdPlacement, string>> = {
  feed: 'Feed',
  sidebar: 'Sidebar',
  search: 'Search results',
  shop: 'Shop',
  article: 'Article',
};

export const LAYOUTS: readonly AdLayout[] = ['card', 'banner', 'compact', 'native'];

export const LAYOUT_LABELS: Readonly<Record<AdLayout, string>> = {
  card: 'Card (standard)',
  banner: 'Wide banner',
  compact: 'Compact thumbnail',
  native: 'Native story',
};

export const PLATFORMS: readonly AdPlatform[] = ['web', 'android'];

export const PLATFORM_LABELS: Readonly<Record<AdPlatform, string>> = {
  web: 'Web',
  android: 'Android',
};

export const STATUS_LABELS: Readonly<Record<AdStatus, string>> = {
  draft: 'Draft',
  pending_review: 'Waiting for review',
  active: 'Running',
  rejected: 'Refused',
  paused: 'Paused',
  completed: 'Finished',
};

export const STATUS_TONES: Readonly<Record<AdStatus, 'ok' | 'warn' | 'bad' | 'neutral'>> = {
  draft: 'neutral',
  pending_review: 'warn',
  active: 'ok',
  rejected: 'bad',
  paused: 'warn',
  completed: 'neutral',
};

/** Limits from `0022_ads.sql` and `0089_ads_delivery_creatives_and_tracking_upgrade.sql`. */
export const LIMITS = {
  bidMin: 100,
  bidMax: 10_000_000,
  budgetMin: 1_000,
  nameMin: 3,
  nameMax: 80,
  headlineMin: 3,
  headlineMax: 80,
  bodyMax: 200,
  ctaMax: 32,
  altMax: 200,
  badgeMax: 32,
  urlMax: 500,
} as const;

export const DEFAULT_CREATIVE_PLATFORMS: readonly AdPlatform[] = ['web', 'android'];

/** Matches `bsdc.media_host_of` in `0083_imgbb_only_media.sql`. */
export function isImgbbUrl(raw: string): boolean {
  const value = raw.trim();
  if (value === '') return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'i.ibb.co' ||
      host === 'ibb.co' ||
      host === 'i.ibb.co.com' ||
      host.endsWith('.ibb.co') ||
      host.endsWith('.ibb.co.com')
    );
  } catch {
    return false;
  }
}

export function isHexColor(raw: string): boolean {
  const value = raw.trim();
  return value === '' || /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * What one event costs, in poisha — the same arithmetic as
 * `bsdc.ad_event_cost`, including the truncation.
 *
 * `Math.trunc` rather than `Math.round`: the database divides integers, so
 * 1,500 / 1000 is 1 and not 2. `Math.floor` would agree for these positive
 * values, but `trunc` says what is happening.
 */
export function eventCost(pricing: AdPricing, bid: number, kind: 'impression' | 'click'): number {
  if (pricing === 'cpm' && kind === 'impression') return Math.trunc(bid / 1000);
  if (pricing === 'cpc' && kind === 'click') return bid;
  return 0;
}

/**
 * How many events a budget buys at a bid — the number that makes a bid
 * meaningful. It is the inverse of `eventCost`, and it must be the inverse of
 * *this* `eventCost`: a bid too small to pay for one event buys nothing, and
 * saying so is better than showing an enormous number.
 */
export function forecastEvents(
  pricing: AdPricing,
  bid: number,
  budget: number,
): { readonly kind: 'impression' | 'click'; readonly count: number } {
  const kind = pricing === 'cpm' ? 'impression' : 'click';
  const unit = eventCost(pricing, bid, kind);
  if (unit <= 0) return { kind, count: 0 };
  return { kind, count: Math.floor(budget / unit) };
}

/** Taka typed by a person, into the poisha the database stores. */
export function takaToPoisha(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  const amount = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

/**
 * Poisha into taka, for a field a person will edit. Trailing zeros are
 * dropped so 5,000 poisha reads as "50" and not "50.00" — an operator editing
 * a bid should not have to delete a decimal point to change it.
 */
export function poishaToTaka(poisha: number): string {
  const taka = poisha / 100;
  return Number.isInteger(taka) ? String(taka) : taka.toFixed(2);
}

export function money(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function count(value: number): string {
  return value.toLocaleString('en-US');
}

/** A rate the database returned as a numeric string, rendered as a percentage. */
export function percent(value: number | string, places = 2): string {
  // A blank is "no value", not "zero": `Number('')` is 0, which would print a
  // confident 0.00% for a rate the database did not send.
  if (typeof value === 'string' && value.trim() === '') return '0%';
  const rate = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(rate)) return '0%';
  return `${rate.toFixed(places)}%`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A date field into the timestamp the function expects, or an empty string. */
export function dateToIso(value: string): string {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return '';
  return `${trimmed}T00:00:00Z`;
}

/**
 * Every rule the campaign insert will enforce, in the order a person fills the
 * form. The database is still the authority; this is so the operator is not
 * made to submit in order to find out.
 */
export function validateDraft(
  draft: CampaignDraft,
  floorBid: number = LIMITS.bidMin,
): readonly Problem[] {
  const problems: Problem[] = [];
  const name = draft.name.trim();

  if (draft.ownerUid.trim().length === 0) {
    problems.push({ field: 'ownerUid', message: 'Choose who this campaign is for.' });
  }
  if (name.length < LIMITS.nameMin) {
    problems.push({
      field: 'name',
      message: `A campaign needs a name of at least ${LIMITS.nameMin} characters — it is what the owner sees in their console.`,
    });
  }
  if (name.length > LIMITS.nameMax) {
    problems.push({ field: 'name', message: `Keep the name under ${LIMITS.nameMax} characters.` });
  }
  if (draft.bid < floorBid) {
    problems.push({
      field: 'bid',
      message: `The bid is below the floor of ${money(floorBid)}. Nothing is served below it.`,
    });
  }
  if (draft.bid > LIMITS.bidMax) {
    problems.push({
      field: 'bid',
      message: `The bid is above the ceiling of ${money(LIMITS.bidMax)}.`,
    });
  }
  if (draft.totalBudget < LIMITS.budgetMin) {
    problems.push({
      field: 'totalBudget',
      message: `A budget under ${money(LIMITS.budgetMin)} would buy no impressions at this bid.`,
    });
  }
  if (draft.dailyBudget !== 0 && draft.dailyBudget > draft.totalBudget) {
    problems.push({
      field: 'dailyBudget',
      message:
        'A daily cap larger than the whole budget never applies. Raise the budget or lower the cap.',
    });
  }

  const startsAt = dateToIso(draft.startsAt);
  const endsAt = dateToIso(draft.endsAt);
  if (draft.startsAt.trim().length > 0 && startsAt === '') {
    problems.push({ field: 'startsAt', message: 'Pick a start date.' });
  }
  if (draft.endsAt.trim().length > 0 && endsAt === '') {
    problems.push({
      field: 'endsAt',
      message: 'Pick an end date, or leave it empty to run until the budget is spent.',
    });
  }
  if (startsAt !== '' && endsAt !== '' && endsAt <= startsAt) {
    problems.push({ field: 'endsAt', message: 'A campaign has to end after it starts.' });
  }

  // A bid that cannot pay for one event buys nothing, whatever the budget is.
  if (draft.bid > 0 && draft.bid < LIMITS.bidMax) {
    const unit = eventCost(
      draft.pricing,
      draft.bid,
      draft.pricing === 'cpm' ? 'impression' : 'click',
    );
    if (unit <= 0) {
      problems.push({
        field: 'bid',
        message:
          draft.pricing === 'cpm'
            ? `At ${money(draft.bid)} per thousand, an impression costs less than one poisha, so this bid would pay nothing. Bid at least ${money(1000)}.`
            : 'A click has to cost at least one poisha.',
      });
    }
  }

  return problems;
}

/** Every rule the creative insert will enforce. */
export function validateCreative(draft: CreativeDraft): readonly Problem[] {
  const problems: Problem[] = [];
  const headline = draft.headline.trim();
  const body = draft.body.trim();
  const cta = draft.ctaLabel.trim();
  const url = draft.targetUrl.trim();
  const imageUrl = draft.imageUrl.trim();
  const thumbUrl = (draft.thumbUrl ?? '').trim();
  const imageAlt = (draft.imageAlt ?? '').trim();
  const accentColor = (draft.accentColor ?? '').trim();
  const badgeLabel = (draft.badgeLabel ?? '').trim();
  const layout = draft.layout ?? 'card';
  const platforms = draft.platforms ?? DEFAULT_CREATIVE_PLATFORMS;

  if (headline.length < LIMITS.headlineMin) {
    problems.push({ field: 'headline', message: 'A creative needs a headline an eye can catch.' });
  }
  if (headline.length > LIMITS.headlineMax) {
    problems.push({
      field: 'headline',
      message: `Headlines are cut after ${LIMITS.headlineMax} characters.`,
    });
  }
  if (body.length > LIMITS.bodyMax) {
    problems.push({
      field: 'body',
      message: `Body copy is cut after ${LIMITS.bodyMax} characters.`,
    });
  }
  if (cta.length > LIMITS.ctaMax) {
    problems.push({
      field: 'cta',
      message: `A button label is at most ${LIMITS.ctaMax} characters.`,
    });
  }
  if (!/^https:\/\/\S{4,500}$/.test(url)) {
    problems.push({
      field: 'targetUrl',
      message:
        'A destination has to be an https address — an ad is a promise about where a click goes.',
    });
  }
  if (imageUrl.length > LIMITS.urlMax || (imageUrl.length > 0 && !isImgbbUrl(imageUrl))) {
    problems.push({
      field: 'imageUrl',
      message: 'Ad images must be hosted on ImgBB (https://i.ibb.co/...).',
    });
  }
  if (thumbUrl.length > LIMITS.urlMax || (thumbUrl.length > 0 && !isImgbbUrl(thumbUrl))) {
    problems.push({
      field: 'thumbUrl',
      message: 'Ad thumbnails must be hosted on ImgBB (https://i.ibb.co/...).',
    });
  }
  if (imageAlt.length > LIMITS.altMax) {
    problems.push({
      field: 'imageAlt',
      message: `Image description is cut after ${LIMITS.altMax} characters.`,
    });
  }
  if (!LAYOUTS.includes(layout)) {
    problems.push({ field: 'layout', message: 'Choose a valid ad layout.' });
  }
  if (!isHexColor(accentColor)) {
    problems.push({
      field: 'accentColor',
      message: 'Accent color must be a 6-digit hex code such as #15803d.',
    });
  }
  if (badgeLabel.length > LIMITS.badgeMax) {
    problems.push({
      field: 'badgeLabel',
      message: `Badge label is at most ${LIMITS.badgeMax} characters.`,
    });
  }
  if (platforms.length === 0) {
    problems.push({
      field: 'platforms',
      message: 'Select at least one platform (Web or Android).',
    });
  }
  return problems;
}

/** What the wallet has to hold before a campaign may run. */
export function funded(draft: CampaignDraft, walletBalance: number): boolean {
  return walletBalance >= draft.totalBudget;
}

export function activationRefusal(draft: CampaignDraft, walletBalance: number): string | null {
  if (!draft.activate) return null;
  if (funded(draft, walletBalance)) return null;
  return `That wallet holds ${money(walletBalance)} and the budget is ${money(
    draft.totalBudget,
  )}. Credit it first, or save the campaign as a draft.`;
}

/** Oldest first: the queue that is fair is the queue nobody can jump. */
export function oldestFirst<T extends { readonly starts_at: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** The campaigns that need a person: waiting, or running with no live creative. */
export function needsAttention(rows: readonly CampaignRow[]): CampaignRow[] {
  return rows.filter(
    (row) =>
      row.status === 'pending_review' || (row.status === 'active' && row.creative_count === 0),
  );
}

/**
 * The arguments `staff_create_campaign` expects. Kept as a function because
 * the function's parameter is `p_ends_at` with no default for "never ends" —
 * an empty date has to become `null`, and not an empty string Postgres would
 * try to cast.
 */
export function campaignArgs(draft: CampaignDraft): Record<string, unknown> {
  return {
    p_owner_uid: draft.ownerUid.trim(),
    p_name: draft.name.trim(),
    p_pricing: draft.pricing,
    p_bid: draft.bid,
    p_total_budget: draft.totalBudget,
    p_daily_budget: draft.dailyBudget,
    p_starts_at: dateToIso(draft.startsAt) === '' ? undefined : dateToIso(draft.startsAt),
    p_ends_at: dateToIso(draft.endsAt) === '' ? null : dateToIso(draft.endsAt),
    p_cities: draft.cities,
    p_topics: draft.topics,
    p_language: draft.language.trim() === '' ? 'any' : draft.language.trim(),
    p_activate: draft.activate,
  };
}

function creativeOptionArgs(draft: CreativeDraft): Record<string, unknown> {
  return {
    p_thumb_url: (draft.thumbUrl ?? '').trim(),
    p_image_alt: (draft.imageAlt ?? '').trim(),
    p_layout: draft.layout ?? 'card',
    p_accent_color: (draft.accentColor ?? '').trim(),
    p_badge_label: (draft.badgeLabel ?? '').trim(),
    p_platforms:
      draft.platforms && draft.platforms.length > 0 ? draft.platforms : DEFAULT_CREATIVE_PLATFORMS,
  };
}

/** Arguments for the atomic staff builder, including optional first creative. */
export function setupArgs(draft: CampaignDraft, creative: CreativeDraft): Record<string, unknown> {
  return {
    ...campaignArgs(draft),
    p_placement: creative.placement,
    p_headline: creative.headline.trim(),
    p_body: creative.body.trim(),
    p_target_url: creative.targetUrl.trim(),
    p_image_url: creative.imageUrl.trim(),
    p_cta_label: creative.ctaLabel.trim(),
    ...creativeOptionArgs(creative),
  };
}

export function creativeArgs(campaignId: string, draft: CreativeDraft): Record<string, unknown> {
  return {
    p_campaign_id: campaignId,
    p_placement: draft.placement,
    p_headline: draft.headline.trim(),
    p_body: draft.body.trim(),
    p_target_url: draft.targetUrl.trim(),
    p_image_url: draft.imageUrl.trim(),
    p_cta_label: draft.ctaLabel.trim(),
    ...creativeOptionArgs(draft),
  };
}

export function updateCampaignArgs(
  campaignId: string,
  draft: Omit<CampaignDraft, 'ownerUid' | 'activate'>,
): Record<string, unknown> {
  const endsIso = dateToIso(draft.endsAt);
  return {
    p_campaign_id: campaignId,
    p_name: draft.name.trim(),
    p_pricing: draft.pricing,
    p_bid: draft.bid,
    p_total_budget: draft.totalBudget,
    p_daily_budget: draft.dailyBudget,
    p_starts_at: dateToIso(draft.startsAt) === '' ? null : dateToIso(draft.startsAt),
    p_ends_at: endsIso === '' ? null : endsIso,
    p_clear_end: endsIso === '',
    p_cities: draft.cities,
    p_topics: draft.topics,
    p_language: draft.language.trim() === '' ? 'any' : draft.language.trim(),
  };
}

export function updateCreativeArgs(
  creativeId: string,
  draft: CreativeDraft,
): Record<string, unknown> {
  return {
    p_creative_id: creativeId,
    p_placement: draft.placement,
    p_headline: draft.headline.trim(),
    p_body: draft.body.trim(),
    p_target_url: draft.targetUrl.trim(),
    p_image_url: draft.imageUrl.trim(),
    p_cta_label: draft.ctaLabel.trim(),
    ...creativeOptionArgs(draft),
    p_is_enabled: draft.isEnabled ?? true,
  };
}

/**
 * The series as a bar chart: heights are a share of the busiest day, so a
 * quiet week does not draw as a blank card. `Math.max(1, …)` keeps a bar with
 * one impression visible and keeps the divisor away from zero.
 */
export function seriesBars(
  rows: readonly DayRow[],
  height = 48,
): ReadonlyArray<{ readonly day: string; readonly impressions: number; readonly height: number }> {
  const peak = Math.max(1, ...rows.map((row) => row.impressions));
  return rows.map((row) => ({
    day: row.day,
    impressions: row.impressions,
    height: Math.max(row.impressions === 0 ? 0 : 2, Math.round((row.impressions / peak) * height)),
  }));
}

/**
 * Which creative is worth keeping. A creative with no impressions is not
 * "worst" — it has not been tried — so it is excluded from the comparison
 * rather than ranked last.
 */
export function bestCreative<T extends { readonly impressions: number; readonly clicks: number }>(
  rows: readonly T[],
): T | null {
  const tried = rows.filter((row) => row.impressions > 0);
  if (tried.length < 2) return null;
  return tried.reduce((best, row) =>
    row.clicks / row.impressions > best.clicks / best.impressions ? row : best,
  );
}
