import type * as ReactI18Next from 'react-i18next';
import type { User } from 'firebase/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign, CampaignCreative } from '@/lib/ads/ads-types';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';
import AdsPage from '@/routes/AdsPage';

const mocks = vi.hoisted(() => ({
  campaigns: [] as Campaign[],
  creatives: [] as CampaignCreative[],
  pause: vi.fn(),
  edit: vi.fn(),
}));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/use-ads', () => ({
  useCampaigns: () => ({
    campaigns: mocks.campaigns,
    balance: 2500,
    isLoading: false,
    isError: false,
    setPaused: mocks.pause,
    editCopy: mocks.edit,
    isSaving: false,
  }),
  useCampaignDetail: () => ({
    creatives: mocks.creatives,
    daily: [{ day: '2026-11-06', impressions: 12, clicks: 2, spend: 200 }],
    isLoading: false,
    isError: false,
  }),
}));

const campaign: Campaign = {
  id: 'campaign-1',
  name: 'Our campaign',
  status: 'active',
  pricing: 'cpc',
  bid: 100,
  totalBudget: 5000,
  dailyBudget: 0,
  spent: 200,
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: null,
  reviewNote: '',
  creativeCount: 1,
  impressions: 12,
  clicks: 2,
  spendToday: 200,
};
const creative: CampaignCreative = {
  id: 'creative-1',
  placement: 'shop',
  headline: 'Original headline',
  body: 'Original body',
  imageUrl: '',
  ctaLabel: 'Visit',
  targetUrl: 'https://example.test/one',
  isEnabled: true,
  impressions: 12,
  clicks: 2,
  spend: 200,
};
function page() {
  return render(
    <MemoryRouter>
      <AdsPage />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  useAuthStore.getState().reset();
  mocks.campaigns = [campaign];
  mocks.creatives = [creative];
  mocks.pause.mockReset().mockResolvedValue(undefined);
  mocks.edit.mockReset().mockResolvedValue(undefined);
});

describe('advertiser dashboard', () => {
  it('shows only a sign-in link to a guest', () => {
    page();
    expect(screen.getByRole('link', { name: 'ads.signInAction' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    expect(screen.queryByText('Our campaign')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ads.create' })).not.toBeInTheDocument();
  });

  it('shows performance and copy editing but no self-service creation, funding or approval', async () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    page();
    expect(screen.getByText('Our campaign')).toBeInTheDocument();
    for (const action of ['ads.create', 'ads.submit', 'ads.addCreative', 'ads.topup']) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'ads.viewDetails' }));
    expect(screen.getByText('2026-11-06')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ads.editCopy' }));
    expect(screen.getByText('ads.copyReviewBody')).toBeInTheDocument();
    expect(screen.queryByLabelText('ads.fieldPlacement')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ads.fieldUrl')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ads.fieldHeadline'), {
      target: { value: 'Updated headline' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ads.saveCopy' }));
    await waitFor(() =>
      expect(mocks.edit).toHaveBeenCalledWith('creative-1', {
        headline: 'Updated headline',
        body: 'Original body',
        ctaLabel: 'Visit',
      }),
    );
  });

  it('pauses active campaigns and resumes only paused campaigns', async () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    page();
    fireEvent.click(screen.getByRole('button', { name: 'ads.pause' }));
    await waitFor(() => expect(mocks.pause).toHaveBeenCalledWith('campaign-1', true));
    expect(screen.queryByRole('button', { name: 'ads.resume' })).not.toBeInTheDocument();
  });

  it('does not offer editing for a finished campaign', () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    mocks.campaigns = [{ ...campaign, status: 'completed' }];
    page();
    fireEvent.click(screen.getByRole('button', { name: 'ads.viewDetails' }));
    expect(screen.queryByRole('button', { name: 'ads.editCopy' })).not.toBeInTheDocument();
  });
});
