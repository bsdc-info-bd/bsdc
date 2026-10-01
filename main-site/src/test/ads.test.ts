import { describe, expect, it } from 'vitest';
import {
  budgetProgress,
  budgetRemaining,
  canEdit,
  canPause,
  canResume,
  canSubmit,
  clickThroughRate,
  effectiveCostPerClick,
  eventCost,
  forecastEvents,
  isServable,
  pauseReasonKey,
  takaToPoisha,
  validateCampaign,
  validateCreative,
  type Campaign,
  type CampaignDraft,
  type CreativeDraft,
} from '@/lib/ads/ads-types';

const NOW = new Date('2026-06-01T12:00:00.000Z');

function campaign(patch: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    name: 'Winter hiring',
    status: 'active',
    pricing: 'cpm',
    bid: 5000,
    totalBudget: 500_000,
    dailyBudget: 0,
    spent: 0,
    startsAt: '2026-05-01T00:00:00.000Z',
    endsAt: null,
    reviewNote: '',
    creativeCount: 1,
    impressions: 0,
    clicks: 0,
    spendToday: 0,
    ...patch,
  };
}

const CAMPAIGN_DRAFT: CampaignDraft = {
  name: 'Winter hiring',
  pricing: 'cpm',
  bid: 5000,
  totalBudget: 500_000,
  dailyBudget: 50_000,
  cities: [],
  topics: [],
  language: 'any',
};

const CREATIVE_DRAFT: CreativeDraft = {
  placement: 'feed',
  headline: 'Hiring two React engineers',
  body: 'Remote from anywhere in Bangladesh.',
  imageUrl: '',
  ctaLabel: 'See the roles',
  targetUrl: 'https://bsdc.info.bd/jobs',
};

describe('pricing', () => {
  it('charges a thousandth of a cpm bid for one impression', () => {
    expect(eventCost('cpm', 5000, 'impression')).toBe(5);
    expect(eventCost('cpm', 12_345, 'impression')).toBe(12);
  });

  it('never charges a cpm campaign for a click', () => {
    expect(eventCost('cpm', 5000, 'click')).toBe(0);
  });

  it('charges a cpc campaign the whole bid per click and nothing per view', () => {
    expect(eventCost('cpc', 700, 'click')).toBe(700);
    expect(eventCost('cpc', 700, 'impression')).toBe(0);
  });

  it('truncates like integer division rather than rounding up', () => {
    expect(eventCost('cpm', 999, 'impression')).toBe(0);
    expect(eventCost('cpm', 1999, 'impression')).toBe(1);
  });

  it('forecasts reach from the budget and bid', () => {
    expect(forecastEvents('cpm', 5000, 500_000).impressions).toBe(100_000);
    expect(forecastEvents('cpc', 700, 500_000).clicks).toBe(714);
  });
});

describe('budget', () => {
  it('reports what is left and never goes negative', () => {
    expect(budgetRemaining(campaign({ spent: 200_000 }))).toBe(300_000);
    expect(budgetRemaining(campaign({ spent: 900_000 }))).toBe(0);
  });

  it('reports progress as a fraction capped at one', () => {
    expect(budgetProgress(campaign({ spent: 250_000 }))).toBe(0.5);
    expect(budgetProgress(campaign({ spent: 900_000 }))).toBe(1);
    expect(budgetProgress(campaign({ totalBudget: 0 }))).toBe(0);
  });
});

describe('performance figures', () => {
  it('computes a click-through rate to two decimals', () => {
    expect(clickThroughRate(10_000, 125)).toBe(1.25);
  });

  it('returns no rate when nothing has been shown', () => {
    expect(clickThroughRate(0, 0)).toBe(0);
  });

  it('computes what each click actually cost', () => {
    expect(effectiveCostPerClick(100_000, 40)).toBe(2500);
    expect(effectiveCostPerClick(100_000, 0)).toBe(0);
  });
});

describe('serving eligibility', () => {
  it('serves a funded, approved, started campaign', () => {
    expect(isServable(campaign(), NOW)).toBe(true);
    expect(pauseReasonKey(campaign(), NOW)).toBeNull();
  });

  it('refuses a campaign that is not approved', () => {
    for (const status of ['draft', 'pending_review', 'paused', 'rejected', 'completed'] as const) {
      expect(isServable(campaign({ status }), NOW)).toBe(false);
    }
  });

  it('stops at the total budget', () => {
    const spent = campaign({ spent: 500_000 });
    expect(isServable(spent, NOW)).toBe(false);
    expect(pauseReasonKey(spent, NOW)).toBe('ads.reasons.budgetSpent');
  });

  it('stops at the daily cap and explains why', () => {
    const capped = campaign({ dailyBudget: 50_000, spendToday: 50_000 });
    expect(isServable(capped, NOW)).toBe(false);
    expect(pauseReasonKey(capped, NOW)).toBe('ads.reasons.dailyCap');
  });

  it('respects the schedule at both ends', () => {
    expect(isServable(campaign({ startsAt: '2026-07-01T00:00:00.000Z' }), NOW)).toBe(false);
    expect(isServable(campaign({ endsAt: '2026-05-30T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('campaign state', () => {
  it('allows only a live campaign to be paused', () => {
    expect(canPause('active')).toBe(true);
    expect(canPause('paused')).toBe(false);
    expect(canPause('draft')).toBe(false);
  });

  it('allows only a paused campaign to be resumed', () => {
    expect(canResume('paused')).toBe(true);
    expect(canResume('active')).toBe(false);
  });

  it('allows submission from draft, rejected or paused', () => {
    expect(canSubmit('draft')).toBe(true);
    expect(canSubmit('rejected')).toBe(true);
    expect(canSubmit('paused')).toBe(true);
    expect(canSubmit('pending_review')).toBe(false);
    expect(canSubmit('completed')).toBe(false);
  });

  it('freezes the text once it is under review', () => {
    expect(canEdit('draft')).toBe(true);
    expect(canEdit('pending_review')).toBe(false);
    expect(canEdit('active')).toBe(false);
  });
});

describe('validation', () => {
  it('accepts a complete campaign draft', () => {
    expect(validateCampaign(CAMPAIGN_DRAFT)).toEqual([]);
  });

  it('rejects a daily cap above the total budget', () => {
    const problems = validateCampaign({ ...CAMPAIGN_DRAFT, dailyBudget: 900_000 });
    expect(problems.map((p) => p.key)).toContain('ads.errors.dailyOverTotal');
  });

  it('rejects a bid a budget cannot serve once', () => {
    const problems = validateCampaign({
      ...CAMPAIGN_DRAFT,
      pricing: 'cpc',
      bid: 900_000,
      totalBudget: 100_000,
      dailyBudget: 0,
    });
    expect(problems.map((p) => p.key)).toContain('ads.errors.bidOverBudget');
  });

  it('rejects a budget below the floor and a bid below the floor', () => {
    expect(validateCampaign({ ...CAMPAIGN_DRAFT, totalBudget: 500 }).map((p) => p.field)).toContain(
      'totalBudget',
    );
    expect(validateCampaign({ ...CAMPAIGN_DRAFT, bid: 50 }).map((p) => p.field)).toContain('bid');
  });

  it('accepts a complete creative', () => {
    expect(validateCreative(CREATIVE_DRAFT)).toEqual([]);
  });

  it('refuses a destination that is not https', () => {
    for (const url of ['http://bsdc.info.bd', 'javascript:alert(1)', 'bsdc.info.bd', '']) {
      expect(validateCreative({ ...CREATIVE_DRAFT, targetUrl: url }).map((p) => p.field)).toContain(
        'targetUrl',
      );
    }
  });

  it('refuses a headline that is too short or too long', () => {
    expect(validateCreative({ ...CREATIVE_DRAFT, headline: 'hi' }).map((p) => p.field)).toContain(
      'headline',
    );
    expect(
      validateCreative({ ...CREATIVE_DRAFT, headline: 'a'.repeat(81) }).map((p) => p.field),
    ).toContain('headline');
  });
});

describe('taka input', () => {
  it('turns taka into poisha', () => {
    expect(takaToPoisha('50')).toBe(5000);
    expect(takaToPoisha('12.34')).toBe(1234);
  });

  it('rounds to the nearest poisha rather than drifting', () => {
    expect(takaToPoisha('0.005')).toBe(1);
    expect(takaToPoisha('99.999')).toBe(10_000);
  });

  it('reports nonsense as invalid rather than zero', () => {
    expect(takaToPoisha('abc')).toBe(-1);
    expect(takaToPoisha('-5')).toBe(-1);
  });
});
