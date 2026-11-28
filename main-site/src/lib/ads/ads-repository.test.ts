import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAds } from './ads-repository';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/supabase/errors', () => ({
  toDataError: (error: unknown) => new Error(`database:${String(error)}`),
}));

const row = {
  creative_id: 'creative-1',
  campaign_id: 'campaign-1',
  headline: 'Community meetup',
  body: 'Join us this Friday.',
  image_url: 'https://i.ibb.co/full.webp',
  thumb_url: 'https://i.ibb.co/thumb.webp',
  image_alt: 'People at a meetup',
  cta_label: 'Register',
  target_url: 'https://www.bsdc.info.bd/events',
  placement: 'feed' as const,
  layout: 'banner' as const,
  accent_color: '#15803d',
  badge_label: 'This week',
};

beforeEach(() => mocks.rpc.mockReset());

describe('fetchAds delivery RPC', () => {
  it('requests the website placement with optional targeting and maps the creative', async () => {
    mocks.rpc.mockReturnValue({
      returns: () => Promise.resolve({ data: [row], error: null }),
    });

    await expect(
      fetchAds('feed', 1, { language: 'bn', topic: 'community', city: 'Sylhet' }),
    ).resolves.toEqual([
      {
        creativeId: 'creative-1',
        campaignId: 'campaign-1',
        headline: 'Community meetup',
        body: 'Join us this Friday.',
        imageUrl: 'https://i.ibb.co/full.webp',
        thumbUrl: 'https://i.ibb.co/thumb.webp',
        imageAlt: 'People at a meetup',
        ctaLabel: 'Register',
        targetUrl: 'https://www.bsdc.info.bd/events',
        placement: 'feed',
        layout: 'banner',
        accentColor: '#15803d',
        badgeLabel: 'This week',
      },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('serve_ads', {
      p_placement: 'feed',
      p_limit: 1,
      p_platform: 'web',
      p_language: 'bn',
      p_topic: 'community',
      p_city: 'Sylhet',
    });
  });

  it('returns an empty slot for a clean no-inventory response', async () => {
    mocks.rpc.mockReturnValue({
      returns: () => Promise.resolve({ data: null, error: null }),
    });
    await expect(fetchAds('feed')).resolves.toEqual([]);
  });

  it('surfaces delivery RPC errors for query retry and observability', async () => {
    mocks.rpc.mockReturnValue({
      returns: () => Promise.resolve({ data: null, error: 'serve_ads unavailable' }),
    });
    await expect(fetchAds('feed')).rejects.toThrow('database:serve_ads unavailable');
  });
});
