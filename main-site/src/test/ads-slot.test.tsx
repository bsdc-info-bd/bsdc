import type * as ReactI18Next from 'react-i18next';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdSlot } from '@/components/ads/AdSlot';
import type { ServedAd } from '@/lib/ads/ads-types';

const mocks = vi.hoisted(() => ({
  ad: null as ServedAd | null,
  onClick: vi.fn(),
  ref: vi.fn(),
}));

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/hooks/use-ads', () => ({
  useAdSlot: () => ({
    ad: mocks.ad,
    isLoading: false,
    ref: mocks.ref,
    onClick: mocks.onClick,
  }),
}));

beforeEach(() => {
  mocks.ad = null;
  mocks.onClick.mockReset();
  mocks.ref.mockReset();
});

describe('AdSlot rendering and safety', () => {
  it('renders nothing when no creative is eligible or target URL is not https', () => {
    const { container, rerender } = render(<AdSlot placement="feed" />);
    expect(container.firstChild).toBeNull();

    mocks.ad = {
      creativeId: 'cr-unsafe',
      campaignId: 'cmp-1',
      headline: 'Insecure destination',
      body: 'Should never render',
      imageUrl: 'https://i.ibb.co/demo/full.webp',
      ctaLabel: 'Open',
      targetUrl: 'http://example.test/landing',
      placement: 'feed',
    };
    rerender(<AdSlot placement="feed" />);
    expect(container.firstChild).toBeNull();

    mocks.ad = {
      ...mocks.ad,
      targetUrl: 'javascript:alert(1)',
    };
    rerender(<AdSlot placement="feed" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders custom badge, ImgBB artwork, accent color, layout, and click callback', () => {
    mocks.ad = {
      creativeId: 'cr-1',
      campaignId: 'cmp-1',
      headline: 'BSDC Kotlin Bootcamp',
      body: 'Enroll for hands-on mobile workshops.',
      imageUrl: 'https://i.ibb.co/demo/full.webp',
      thumbUrl: 'https://i.ibb.co/demo/med.webp',
      imageAlt: 'Kotlin Bootcamp Banner',
      ctaLabel: 'Join Cohort',
      targetUrl: 'https://www.bsdc.info.bd/learn',
      placement: 'feed',
      layout: 'banner',
      accentColor: '#15803d',
      badgeLabel: 'Featured',
    };

    const { rerender } = render(<AdSlot placement="feed" />);

    expect(screen.getByText('ads.sponsored')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
    const bannerImg = screen.getByRole('img', { name: 'Kotlin Bootcamp Banner' });
    expect(bannerImg).toHaveAttribute('src', 'https://i.ibb.co/demo/med.webp');
    expect(bannerImg.getAttribute('srcset') ?? '').toContain('https://i.ibb.co/demo/full.webp');

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://www.bsdc.info.bd/learn');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow sponsored');

    fireEvent.click(link);
    expect(mocks.onClick).toHaveBeenCalledOnce();

    mocks.ad = { ...mocks.ad, layout: 'card', thumbUrl: '' };
    rerender(<AdSlot placement="feed" />);
    expect(screen.getByRole('img', { name: 'Kotlin Bootcamp Banner' })).toHaveAttribute(
      'src',
      'https://i.ibb.co/demo/full.webp',
    );
  });
});
