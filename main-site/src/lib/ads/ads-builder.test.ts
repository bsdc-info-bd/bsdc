import { describe, expect, it } from 'vitest';
import {
  EMPTY_BUILDER,
  normaliseSender,
  takaToPoisha,
  toCreatePayload,
  validateNewCampaign,
  type NewCampaignInput,
} from './ads-builder';

const NOW = new Date('2026-11-11T06:00:00Z');
const valid: NewCampaignInput = {
  ...EMPTY_BUILDER,
  name: 'Eid sale',
  headline: 'Eid sale is live',
  targetUrl: 'https://example.com/eid',
};

describe('takaToPoisha', () => {
  it('converts plain taka to whole poisha', () => {
    expect(takaToPoisha('500')).toBe(50000);
    expect(takaToPoisha('2.5')).toBe(250);
    expect(takaToPoisha(' 0.01 ')).toBe(1);
  });
  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['', '-5', '1e3', '12.345', 'abc', '৳500']) {
      expect(takaToPoisha(bad)).toBeNull();
    }
  });
});

describe('validateNewCampaign', () => {
  it('accepts a complete campaign', () => {
    expect(validateNewCampaign(valid, NOW)).toEqual({});
  });
  it('enforces the budget band of ৳100 to ৳100,000', () => {
    expect(validateNewCampaign({ ...valid, budgetTaka: '99.99' }, NOW)).toHaveProperty('budget');
    expect(validateNewCampaign({ ...valid, budgetTaka: '100' }, NOW)).toEqual({});
    expect(validateNewCampaign({ ...valid, budgetTaka: '100001' }, NOW)).toHaveProperty('budget');
  });
  it('keeps the daily cap between ৳10 and the whole budget, or none', () => {
    expect(validateNewCampaign({ ...valid, dailyCapTaka: '9' }, NOW)).toHaveProperty('dailyCap');
    expect(validateNewCampaign({ ...valid, dailyCapTaka: '600' }, NOW)).toHaveProperty('dailyCap');
    expect(validateNewCampaign({ ...valid, dailyCapTaka: '' }, NOW)).toEqual({});
  });
  it('refuses a campaign that ends before it starts or runs past a year', () => {
    expect(
      validateNewCampaign({ ...valid, startsOn: '2026-12-01', endsOn: '2026-11-30' }, NOW),
    ).toHaveProperty('schedule');
    expect(
      validateNewCampaign({ ...valid, startsOn: '2026-12-01', endsOn: '2028-01-01' }, NOW),
    ).toHaveProperty('schedule');
  });
  it('requires https destinations and ImgBB images only', () => {
    expect(
      validateNewCampaign({ ...valid, targetUrl: 'http://example.com/x' }, NOW),
    ).toHaveProperty('targetUrl');
    expect(
      validateNewCampaign({ ...valid, imageUrl: 'https://evil.test/a.png' }, NOW),
    ).toHaveProperty('imageUrl');
    expect(validateNewCampaign({ ...valid, imageUrl: 'https://i.ibb.co/abc/a.png' }, NOW)).toEqual(
      {},
    );
  });
  it('needs at least one platform and a headline of 3 to 80 characters', () => {
    expect(validateNewCampaign({ ...valid, platforms: [] }, NOW)).toHaveProperty('platforms');
    expect(validateNewCampaign({ ...valid, headline: 'ab' }, NOW)).toHaveProperty('headline');
  });
});

describe('toCreatePayload', () => {
  it('sends poisha and an ISO start that is never in the past', () => {
    const payload = toCreatePayload({ ...valid, dailyCapTaka: '50' }, NOW);
    expect(payload.total_budget).toBe(50000);
    expect(payload.bid).toBe(200);
    expect(payload.daily_budget).toBe(5000);
    expect(payload.starts_at).toBe(NOW.toISOString());
    expect(payload.ends_at).toBeNull();
  });
  it('reads a Dhaka calendar day as Dhaka time for the schedule', () => {
    const payload = toCreatePayload(
      { ...valid, startsOn: '2026-12-01', endsOn: '2026-12-02' },
      NOW,
    );
    expect(payload.starts_at).toBe('2026-11-30T18:00:00.000Z');
    expect(payload.ends_at).toBe('2026-12-02T17:59:59.000Z');
  });
});

describe('normaliseSender', () => {
  it('accepts the common ways a Bangladeshi bKash number is written', () => {
    expect(normaliseSender('01712345678')).toBe('01712345678');
    expect(normaliseSender('+8801712-345678')).toBe('01712345678');
    expect(normaliseSender('8801712345678')).toBe('01712345678');
  });
  it('rejects non-mobile and foreign numbers', () => {
    expect(normaliseSender('0201234567')).toBeNull();
    expect(normaliseSender('+15551234567')).toBeNull();
  });
});
