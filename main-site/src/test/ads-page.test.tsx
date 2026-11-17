import type * as ReactI18Next from 'react-i18next';
import type { User } from 'firebase/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdPaymentRequest, Campaign, CampaignCreative } from '@/lib/ads/ads-types';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';
import AdsPage from '@/routes/AdsPage';

const mocks = vi.hoisted(() => ({
  campaigns: [] as Campaign[],
  creatives: [] as CampaignCreative[],
  pause: vi.fn(),
  edit: vi.fn(),
  requests: [] as AdPaymentRequest[],
  create: vi.fn(),
  submitPayment: vi.fn(),
  sendForReview: vi.fn(),
}));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/use-ad-builder', () => ({
  useAdBuilder: () => ({
    instructions: {
      bikashNumber: '01712345678',
      minBudgetPoisha: 10000,
      maxBudgetPoisha: 10000000,
      minBidPoisha: 100,
      maxBidPoisha: 1000000,
      dailyCapMinPoisha: 1000,
    },
    instructionsError: false,
    requests: mocks.requests,
    isRequestsLoading: false,
    createCampaign: mocks.create,
    submitPayment: mocks.submitPayment,
    sendForReview: mocks.sendForReview,
    isCreating: false,
    isPaying: false,
    isSending: false,
  }),
}));
// The credit wallet owns a query client of its own and has its own suite
// (src/lib/ads/ad-credits.test.ts). Mocking the module keeps this file about
// the campaign list, and keeps these tests free of a QueryClientProvider they
// have no other reason to need.
vi.mock('@/components/ads/AdCreditsPanel', () => ({
  AdCreditsPanel: () => null,
}));
vi.mock('@/hooks/use-ad-credits', () => ({
  useAdBikashNumber: () => '01712345678',
  useAdCreditRequests: () => ({ requests: [], isLoading: false, isError: false }),
  useRequestAdCredits: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMyAdCredits: () => ({ credits: 0, isLoading: false }),
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
  mocks.requests = [];
  mocks.create.mockReset().mockResolvedValue('new-campaign');
  mocks.submitPayment.mockReset().mockResolvedValue(undefined);
  mocks.sendForReview.mockReset().mockResolvedValue(undefined);
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

  it('shows performance and copy editing, but no staff actions and no direct wallet top-up', async () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    page();
    expect(screen.getByText('Our campaign')).toBeInTheDocument();
    for (const action of ['ads.submit', 'ads.addCreative', 'ads.topup']) {
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

  it('lists bid, schedule, daily spend and creatives for each campaign', () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    page();
    const facts = screen.getByRole('list', { name: 'ads.factsTitle' });
    expect(facts).toHaveTextContent('ads.bidLine');
    expect(facts).toHaveTextContent('ads.scheduleOpen');
    expect(facts).toHaveTextContent('ads.dailyNoCap');
    expect(facts).toHaveTextContent('ads.creatives');
    expect(facts).not.toHaveTextContent('ads.dailyCapLine');
  });

  it('opens the campaign builder for a signed-in advertiser', () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    page();
    fireEvent.click(screen.getByRole('button', { name: 'ads.builder.newCampaign' }));
    expect(screen.getByRole('heading', { name: 'ads.builder.formTitle' })).toBeInTheDocument();
  });

  it('offers payment for a draft and shows the reason a payment was declined', () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    mocks.campaigns = [{ ...campaign, id: 'draft-1', status: 'draft' }];
    mocks.requests = [
      {
        id: 'r1',
        campaignId: 'draft-1',
        amountPoisha: 50000,
        txnId: 'TXN1',
        status: 'rejected',
        reviewNote: 'Transaction not found',
        createdAt: '2026-11-10T00:00:00Z',
        decidedAt: '2026-11-10T01:00:00Z',
      },
    ];
    page();
    expect(screen.getByText('ads.builder.statusPaymentRejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ads.builder.payNow' })).toBeInTheDocument();
  });

  it('sends a funded draft for review and never offers that before approval', async () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    mocks.campaigns = [{ ...campaign, id: 'draft-2', status: 'draft' }];
    mocks.requests = [
      {
        id: 'r2',
        campaignId: 'draft-2',
        amountPoisha: 50000,
        txnId: 'TXN2',
        status: 'approved',
        reviewNote: '',
        createdAt: '2026-11-10T00:00:00Z',
        decidedAt: '2026-11-10T01:00:00Z',
      },
    ];
    page();
    fireEvent.click(screen.getByRole('button', { name: 'ads.builder.sendReview' }));
    await waitFor(() => expect(mocks.sendForReview).toHaveBeenCalledWith('draft-2'));
  });

  it('does not offer editing for a finished campaign', () => {
    useAuthStore.getState().setSession({ uid: 'advertiser-1' } as User, DEFAULT_CLAIMS);
    mocks.campaigns = [{ ...campaign, status: 'completed' }];
    page();
    fireEvent.click(screen.getByRole('button', { name: 'ads.viewDetails' }));
    expect(screen.queryByRole('button', { name: 'ads.editCopy' })).not.toBeInTheDocument();
  });
});
