/**
 * The advertiser's campaign form, as pure logic. The database enforces the same
 * bounds (0101); this module answers the form question before a round trip and
 * converts what the person typed in taka into the poisha the database stores.
 */
import type { AdLayout, AdPlacement, AdPlatform, AdPricing } from './ads-types';

export const BUILDER_LIMITS = {
  minBudgetPoisha: 10000,
  maxBudgetPoisha: 10000000,
  maxBidPoisha: 1000000,
  dailyCapMinPoisha: 1000,
  nameMin: 3,
  nameMax: 80,
  headlineMin: 3,
  headlineMax: 80,
  bodyMax: 200,
  ctaMax: 32,
  txnMin: 4,
  txnMax: 40,
  accountMin: 2,
  accountMax: 80,
  maxScheduleDays: 365,
} as const;

export interface NewCampaignInput {
  name: string;
  pricing: AdPricing;
  /** Taka per 1,000 views, or per click. Entered as taka, stored as poisha. */
  bidTaka: string;
  budgetTaka: string;
  /** Empty means no daily cap. */
  dailyCapTaka: string;
  startsOn: string;
  endsOn: string;
  language: 'any' | 'bn' | 'en';
  placement: AdPlacement;
  platforms: AdPlatform[];
  layout: AdLayout;
  headline: string;
  body: string;
  ctaLabel: string;
  targetUrl: string;
  imageUrl: string;
}

export type BuilderErrorKey =
  | 'name'
  | 'bid'
  | 'budget'
  | 'dailyCap'
  | 'schedule'
  | 'platforms'
  | 'headline'
  | 'body'
  | 'cta'
  | 'targetUrl'
  | 'imageUrl';

export type BuilderErrors = Partial<Record<BuilderErrorKey, true>>;

/** Taka text to whole poisha. Returns null for anything that is not a plain amount. */
export function takaToPoisha(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

const IMGBB = /^https:\/\/(i\.)?ibb\.co\//;

/** Checks the form. An empty result means the form may be sent. */
export function validateNewCampaign(input: NewCampaignInput, now: Date): BuilderErrors {
  const errors: BuilderErrors = {};
  const name = input.name.trim();
  if (name.length < BUILDER_LIMITS.nameMin || name.length > BUILDER_LIMITS.nameMax)
    errors.name = true;

  const bid = takaToPoisha(input.bidTaka);
  if (bid === null || bid < 100 || bid > BUILDER_LIMITS.maxBidPoisha) errors.bid = true;

  const budget = takaToPoisha(input.budgetTaka);
  if (
    budget === null ||
    budget < BUILDER_LIMITS.minBudgetPoisha ||
    budget > BUILDER_LIMITS.maxBudgetPoisha
  ) {
    errors.budget = true;
  }

  const capText = input.dailyCapTaka.trim();
  if (capText !== '') {
    const cap = takaToPoisha(capText);
    if (
      cap === null ||
      cap < BUILDER_LIMITS.dailyCapMinPoisha ||
      (budget !== null && cap > budget)
    ) {
      errors.dailyCap = true;
    }
  }

  const start = input.startsOn ? new Date(`${input.startsOn}T00:00:00+06:00`) : now;
  const end = input.endsOn ? new Date(`${input.endsOn}T23:59:59+06:00`) : null;
  const latest = new Date(start.getTime() + BUILDER_LIMITS.maxScheduleDays * 86_400_000);
  if (Number.isNaN(start.getTime()) || (end !== null && (end <= start || end > latest))) {
    errors.schedule = true;
  }

  if (input.platforms.length === 0) errors.platforms = true;

  const headline = input.headline.trim();
  if (
    headline.length < BUILDER_LIMITS.headlineMin ||
    headline.length > BUILDER_LIMITS.headlineMax
  ) {
    errors.headline = true;
  }
  if (input.body.length > BUILDER_LIMITS.bodyMax) errors.body = true;
  if (input.ctaLabel.length > BUILDER_LIMITS.ctaMax) errors.cta = true;

  const target = input.targetUrl.trim();
  if (target.length < 12 || target.length > 500 || !/^https:\/\/\S+$/.test(target)) {
    errors.targetUrl = true;
  }
  const image = input.imageUrl.trim();
  if (image !== '' && !IMGBB.test(image)) errors.imageUrl = true;

  return errors;
}

/** The exact object the create RPC receives. Money is poisha; dates are ISO instants. */
/** Scalars and string lists only, so it is valid `Json` for the RPC and readable in tests. */
export type CreatePayload = Record<string, string | number | boolean | null | string[]>;

export function toCreatePayload(input: NewCampaignInput, now: Date): CreatePayload {
  const start = input.startsOn ? new Date(`${input.startsOn}T00:00:00+06:00`) : now;
  const end = input.endsOn ? new Date(`${input.endsOn}T23:59:59+06:00`) : null;
  const cap = input.dailyCapTaka.trim() === '' ? 0 : (takaToPoisha(input.dailyCapTaka) ?? 0);
  return {
    name: input.name.trim(),
    pricing: input.pricing,
    bid: takaToPoisha(input.bidTaka),
    total_budget: takaToPoisha(input.budgetTaka),
    daily_budget: cap,
    starts_at: start.toISOString(),
    ends_at: end ? end.toISOString() : null,
    language: input.language,
    placement: input.placement,
    platforms: input.platforms,
    layout: input.layout,
    headline: input.headline.trim(),
    body: input.body,
    cta_label: input.ctaLabel.trim(),
    target_url: input.targetUrl.trim(),
    image_url: input.imageUrl.trim(),
  };
}

/** A Bangladeshi mobile in the form bKash uses (01 then 9 digits), or null. */
export function normaliseSender(raw: string): string | null {
  let digits = raw.replace(/[\s-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

export const EMPTY_BUILDER: NewCampaignInput = {
  name: '',
  pricing: 'cpc',
  bidTaka: '2',
  budgetTaka: '500',
  dailyCapTaka: '',
  startsOn: '',
  endsOn: '',
  language: 'any',
  placement: 'feed',
  platforms: ['web', 'android'],
  layout: 'card',
  headline: '',
  body: '',
  ctaLabel: '',
  targetUrl: '',
  imageUrl: '',
};
