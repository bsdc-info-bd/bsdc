import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  PLACEMENTS,
  activationRefusal,
  bestCreative,
  campaignArgs,
  setupArgs,
  dateToIso,
  eventCost,
  forecastEvents,
  funded,
  money,
  needsAttention,
  oldestFirst,
  percent,
  poishaToTaka,
  seriesBars,
  takaToPoisha,
  validateCreative,
  validateDraft,
  type CampaignDraft,
  type CampaignRow,
  type CreativeDraft,
} from './campaigns';

const DRAFT: CampaignDraft = {
  ownerUid: 'uid-1',
  name: 'Winter intake',
  pricing: 'cpm',
  bid: 1500,
  totalBudget: 500_000,
  dailyBudget: 0,
  startsAt: '2026-11-10',
  endsAt: '2026-12-10',
  cities: [],
  topics: [],
  language: 'any',
  activate: false,
};

const CREATIVE: CreativeDraft = {
  placement: 'feed',
  headline: 'Learn to ship',
  body: 'Twelve weeks, part time.',
  targetUrl: 'https://bsdc.info.bd/learn',
  imageUrl: '',
  ctaLabel: 'Read more',
};

describe('staff booking contract', () => {
  it('uses exactly the placements accepted by the database enum', () => {
    expect(PLACEMENTS).toEqual(['feed', 'sidebar', 'search', 'shop', 'article']);
  });

  it('sends the campaign and first creative to one atomic function', () => {
    const args = setupArgs({ ...DRAFT, activate: true }, { ...CREATIVE, placement: 'shop' });
    expect(args.p_owner_uid).toBe('uid-1');
    expect(args.p_activate).toBe(true);
    expect(args.p_placement).toBe('shop');
    expect(args.p_headline).toBe(CREATIVE.headline);
    expect(args.p_target_url).toBe(CREATIVE.targetUrl);
    expect(args).not.toHaveProperty('p_campaign_id');
  });
});

describe('eventCost', () => {
  // The whole point of this file: the client must charge what the database
  // charges. The proof harness asserts the same cases against the real
  // function, so a change here that the database does not make fails there.
  it('truncates a CPM impression to whole poisha', () => {
    expect(eventCost('cpm', 1500, 'impression')).toBe(1);
    expect(eventCost('cpm', 1999, 'impression')).toBe(1);
    expect(eventCost('cpm', 2000, 'impression')).toBe(2);
  });

  it('does not round up a fractional impression', () => {
    // 1.9 poisha is still one poisha: rounding here would make every forecast
    // optimistic by a third of a poisha per impression.
    expect(eventCost('cpm', 1900, 'impression')).toBe(1);
  });

  it('pays nothing for the event a pricing model does not charge for', () => {
    expect(eventCost('cpm', 1500, 'click')).toBe(0);
    expect(eventCost('cpc', 1500, 'impression')).toBe(0);
    expect(eventCost('cpc', 1500, 'click')).toBe(1500);
  });

  it('pays nothing at all below a thousand per mille', () => {
    expect(eventCost('cpm', 999, 'impression')).toBe(0);
  });
});

describe('forecastEvents', () => {
  it('inverts the cost exactly', () => {
    const { kind, count } = forecastEvents('cpm', 1500, 500_000);
    expect(kind).toBe('impression');
    // 500,000 poisha at 1 poisha an impression, and the leftover 500 poisha
    // that cannot buy one more is not counted.
    expect(count).toBe(500_000);
  });

  it('counts clicks for a click-priced campaign', () => {
    expect(forecastEvents('cpc', 1200, 120_000)).toEqual({ kind: 'click', count: 100 });
  });

  it('buys nothing when a bid buys nothing', () => {
    expect(forecastEvents('cpm', 500, 500_000)).toEqual({ kind: 'impression', count: 0 });
  });
});

describe('taka and poisha', () => {
  it('converts a typed amount without floating point drift', () => {
    expect(takaToPoisha('50')).toBe(5000);
    expect(takaToPoisha('50.05')).toBe(5005);
    expect(takaToPoisha('1,000')).toBe(100_000);
    expect(takaToPoisha('0.07')).toBe(7);
  });

  it('treats an empty or nonsense amount as zero rather than NaN', () => {
    expect(takaToPoisha('')).toBe(0);
    expect(takaToPoisha('   ')).toBe(0);
    expect(takaToPoisha('abc')).toBe(0);
    expect(takaToPoisha('-5')).toBe(0);
  });

  it('writes back a bid an operator can edit', () => {
    expect(poishaToTaka(5000)).toBe('50');
    expect(poishaToTaka(5005)).toBe('50.05');
    expect(poishaToTaka(0)).toBe('0');
  });

  it('formats money in taka from poisha', () => {
    expect(money(500_000)).toBe('৳5,000');
    expect(money(5050)).toBe('৳50.5');
  });
});

describe('percent', () => {
  it('reads a numeric string as a rate', () => {
    expect(percent('2.33')).toBe('2.33%');
    expect(percent(0)).toBe('0.00%');
  });

  it('does not print NaN for a value that is not a number', () => {
    expect(percent('')).toBe('0%');
    expect(percent(Number.NaN)).toBe('0%');
  });
});

describe('dateToIso', () => {
  it('adds midnight UTC to a date field', () => {
    expect(dateToIso('2026-11-10')).toBe('2026-11-10T00:00:00Z');
  });

  it('rejects anything that is not a date', () => {
    expect(dateToIso('')).toBe('');
    expect(dateToIso('10/11/2026')).toBe('');
    expect(dateToIso('2026-11-10T00:00:00Z')).toBe('');
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(DRAFT)).toEqual([]);
  });

  it('needs an owner', () => {
    const problems = validateDraft({ ...DRAFT, ownerUid: '  ' });
    expect(problems.map((problem) => problem.field)).toContain('ownerUid');
  });

  it('says the floor from the inventory rather than a constant', () => {
    const problems = validateDraft({ ...DRAFT, bid: 900 }, 1000);
    expect(problems[0]?.message).toContain('৳10');
    expect(problems[0]?.message).toContain('floor');
  });

  it('says what a bid that buys nothing buys', () => {
    const problems = validateDraft({ ...DRAFT, bid: 500 });
    const bid = problems.find((problem) => problem.field === 'bid');
    expect(bid?.message).toContain('less than one poisha');
  });

  it('refuses a daily cap larger than the budget', () => {
    const problems = validateDraft({ ...DRAFT, dailyBudget: 600_000 });
    expect(problems.map((problem) => problem.field)).toContain('dailyBudget');
  });

  it('allows a zero daily cap, which means no cap', () => {
    expect(validateDraft({ ...DRAFT, dailyBudget: 0 })).toEqual([]);
  });

  it('refuses an end before a start', () => {
    const problems = validateDraft({ ...DRAFT, endsAt: '2026-11-01' });
    expect(problems.map((problem) => problem.field)).toContain('endsAt');
  });

  it('allows an open-ended campaign', () => {
    expect(validateDraft({ ...DRAFT, endsAt: '' })).toEqual([]);
  });

  it('refuses half a date rather than guessing the year', () => {
    const problems = validateDraft({ ...DRAFT, startsAt: '10/11/2026' });
    expect(problems.map((problem) => problem.field)).toContain('startsAt');
  });

  it('enforces the name bounds the database enforces', () => {
    expect(validateDraft({ ...DRAFT, name: 'ab' }).map((problem) => problem.field)).toContain(
      'name',
    );
    expect(
      validateDraft({ ...DRAFT, name: 'x'.repeat(LIMITS.nameMax + 1) }).map(
        (problem) => problem.field,
      ),
    ).toContain('name');
  });
});

describe('validateCreative', () => {
  it('accepts a complete creative', () => {
    expect(validateCreative(CREATIVE)).toEqual([]);
  });

  it('needs an https destination', () => {
    for (const targetUrl of ['http://example.test', '', 'example.test', 'https://a']) {
      const problems = validateCreative({ ...CREATIVE, targetUrl });
      expect(problems.map((problem) => problem.field)).toContain('targetUrl');
    }
  });

  it('holds the copy limits', () => {
    expect(
      validateCreative({ ...CREATIVE, body: 'x'.repeat(LIMITS.bodyMax + 1) }).map(
        (problem) => problem.field,
      ),
    ).toContain('body');
    expect(
      validateCreative({ ...CREATIVE, ctaLabel: 'x'.repeat(LIMITS.ctaMax + 1) }).map(
        (problem) => problem.field,
      ),
    ).toContain('cta');
    expect(
      validateCreative({ ...CREATIVE, headline: 'ab' }).map((problem) => problem.field),
    ).toContain('headline');
  });
});

describe('funding', () => {
  it('needs the budget in the wallet', () => {
    expect(funded(DRAFT, 500_000)).toBe(true);
    expect(funded(DRAFT, 499_999)).toBe(false);
  });

  it('says nothing about funding for a draft', () => {
    expect(activationRefusal(DRAFT, 0)).toBeNull();
  });

  it('names both numbers in the refusal', () => {
    const refusal = activationRefusal({ ...DRAFT, activate: true }, 120_000);
    expect(refusal).toContain('৳1,200');
    expect(refusal).toContain('৳5,000');
    expect(refusal).toContain('Credit it first');
  });

  it('allows activating a funded campaign', () => {
    expect(activationRefusal({ ...DRAFT, activate: true }, 500_000)).toBeNull();
  });
});

describe('campaignArgs', () => {
  it('sends an open-ended campaign as a null, not an empty string', () => {
    const args = campaignArgs({ ...DRAFT, endsAt: '' });
    expect(args.p_ends_at).toBeNull();
    expect(args.p_starts_at).toBe('2026-11-10T00:00:00Z');
  });

  it('leaves the start to the database when it is empty', () => {
    const args = campaignArgs({ ...DRAFT, startsAt: '' });
    expect(args.p_starts_at).toBeUndefined();
  });

  it('trims what a person typed', () => {
    const args = campaignArgs({ ...DRAFT, name: '  Winter intake  ' });
    expect(args.p_name).toBe('Winter intake');
  });

  it('turns an empty language into any', () => {
    expect(campaignArgs({ ...DRAFT, language: '  ' }).p_language).toBe('any');
  });
});

describe('the queues', () => {
  const row = (overrides: Partial<CampaignRow>): CampaignRow => ({
    campaign_id: 'c1',
    owner_uid: 'o1',
    owner_name: 'Owner',
    name: 'Campaign',
    status: 'active',
    pricing: 'cpm',
    bid: 1500,
    total_budget: 500_000,
    spent: 0,
    budget_used_pct: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cost_per_click: 0,
    starts_at: '2026-11-01T00:00:00Z',
    ends_at: null,
    creative_count: 1,
    ...overrides,
  });

  it('puts the oldest first', () => {
    const sorted = oldestFirst([
      row({ campaign_id: 'b', starts_at: '2026-11-05T00:00:00Z' }),
      row({ campaign_id: 'a', starts_at: '2026-11-01T00:00:00Z' }),
    ]);
    expect(sorted.map((entry) => entry.campaign_id)).toEqual(['a', 'b']);
  });

  it('does not mutate the list it was given', () => {
    const rows = [row({ campaign_id: 'b' }), row({ campaign_id: 'a' })];
    oldestFirst(rows);
    expect(rows[0]?.campaign_id).toBe('b');
  });

  it('surfaces what is waiting and what is running with nothing to serve', () => {
    const attention = needsAttention([
      row({ campaign_id: 'waiting', status: 'pending_review' }),
      row({ campaign_id: 'empty', status: 'active', creative_count: 0 }),
      row({ campaign_id: 'fine', status: 'active', creative_count: 2 }),
      row({ campaign_id: 'paused', status: 'paused', creative_count: 0 }),
    ]);
    expect(attention.map((entry) => entry.campaign_id)).toEqual(['waiting', 'empty']);
  });
});

describe('the series', () => {
  it('scales bars to the busiest day', () => {
    const bars = seriesBars(
      [
        { day: '2026-11-01', impressions: 0, clicks: 0, spend: 0, ctr: 0 },
        { day: '2026-11-02', impressions: 500, clicks: 5, spend: 100, ctr: 1 },
        { day: '2026-11-03', impressions: 1000, clicks: 10, spend: 200, ctr: 1 },
      ],
      48,
    );
    expect(bars[2]?.height).toBe(48);
    expect(bars[1]?.height).toBe(24);
    expect(bars[0]?.height).toBe(0);
  });

  it('keeps a quiet day at zero rather than a minimum visible bar', () => {
    const bars = seriesBars([{ day: '2026-11-01', impressions: 0, clicks: 0, spend: 0, ctr: 0 }]);
    expect(bars[0]?.height).toBe(0);
  });

  it('does not divide by zero when every day is quiet', () => {
    const bars = seriesBars([
      { day: '2026-11-01', impressions: 0, clicks: 0, spend: 0, ctr: 0 },
      { day: '2026-11-02', impressions: 0, clicks: 0, spend: 0, ctr: 0 },
    ]);
    expect(bars.map((bar) => bar.height)).toEqual([0, 0]);
  });

  it('draws a single-impression day faintly rather than invisibly', () => {
    const bars = seriesBars([
      { day: '2026-11-01', impressions: 1, clicks: 0, spend: 0, ctr: 0 },
      { day: '2026-11-02', impressions: 4000, clicks: 0, spend: 0, ctr: 0 },
    ]);
    expect(bars[0]?.height).toBe(2);
  });
});

describe('bestCreative', () => {
  it('picks the highest click-through rate among the creatives that ran', () => {
    const best = bestCreative([
      { headline: 'A', impressions: 1000, clicks: 10 },
      { headline: 'B', impressions: 1000, clicks: 40 },
      { headline: 'C', impressions: 4000, clicks: 80 },
    ]);
    expect(best?.headline).toBe('B');
  });

  it('does not rank an untried creative last, it leaves it out', () => {
    const best = bestCreative([
      { headline: 'A', impressions: 0, clicks: 0 },
      { headline: 'B', impressions: 1000, clicks: 10 },
      { headline: 'C', impressions: 1000, clicks: 20 },
    ]);
    expect(best?.headline).toBe('C');
  });

  it('says nothing when there is nothing to compare', () => {
    expect(bestCreative([{ headline: 'A', impressions: 1000, clicks: 10 }])).toBeNull();
  });
});
