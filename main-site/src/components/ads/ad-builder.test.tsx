import type * as ReactI18Next from 'react-i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignPaymentPanel } from './CampaignPaymentPanel';
import { CreateCampaignForm } from './CreateCampaignForm';

const mocks = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  submitPayment: vi.fn(),
}));

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
    requests: [],
    isRequestsLoading: false,
    createCampaign: mocks.createCampaign,
    submitPayment: mocks.submitPayment,
    sendForReview: vi.fn(),
    isCreating: false,
    isPaying: false,
    isSending: false,
  }),
}));

beforeEach(() => {
  mocks.createCampaign.mockReset().mockResolvedValue('campaign-9');
  mocks.submitPayment.mockReset().mockResolvedValue(undefined);
});

describe('CreateCampaignForm', () => {
  it('shows the field errors and sends nothing while the form is incomplete', async () => {
    const onCreated = vi.fn();
    render(<CreateCampaignForm onCreated={onCreated} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'ads.builder.save' }));
    expect(await screen.findAllByText('ads.builder.errors.name')).not.toHaveLength(0);
    expect(screen.queryByText('ads.builder.errors.budget')).not.toBeInTheDocument();
    expect(mocks.createCampaign).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('sends the campaign in poisha and hands over the new id', async () => {
    const onCreated = vi.fn();
    render(<CreateCampaignForm onCreated={onCreated} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/ads\.builder\.name/), {
      target: { value: 'Eid sale' },
    });
    fireEvent.change(screen.getByLabelText(/ads\.builder\.headline/), {
      target: { value: 'Eid sale is live' },
    });
    fireEvent.change(screen.getByLabelText(/ads\.builder\.targetUrl/), {
      target: { value: 'https://example.com/eid' },
    });
    fireEvent.change(screen.getByLabelText(/ads\.builder\.budget/), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'ads.builder.save' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('campaign-9'));
    const payload = mocks.createCampaign.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.total_budget).toBe(50000);
    expect(payload.bid).toBe(200);
    expect(payload.platforms).toEqual(['web', 'android']);
  });
});

describe('CampaignPaymentPanel', () => {
  it('shows the BSDC bKash number the advertiser must pay to', () => {
    render(
      <CampaignPaymentPanel campaignId="c1" budgetPoisha={50000} language="en" latest={null} />,
    );
    expect(screen.getByTestId('bkash-number')).toHaveTextContent('01712345678');
  });

  it('refuses an invalid sender and reports only a normalised number', async () => {
    render(
      <CampaignPaymentPanel campaignId="c1" budgetPoisha={50000} language="en" latest={null} />,
    );
    fireEvent.change(screen.getByLabelText(/ads\.builder\.sender/), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/ads\.builder\.account/), {
      target: { value: 'Rahim' },
    });
    fireEvent.change(screen.getByLabelText(/ads\.builder\.txn/), { target: { value: 'TXN9900' } });
    fireEvent.click(screen.getByRole('button', { name: 'ads.builder.submitPayment' }));
    expect(await screen.findByText('ads.builder.errors.sender')).toBeInTheDocument();
    expect(mocks.submitPayment).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/ads\.builder\.sender/), {
      target: { value: '+880 1712-345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ads.builder.submitPayment' }));
    await waitFor(() =>
      expect(mocks.submitPayment).toHaveBeenCalledWith('c1', {
        sender: '01712345678',
        account: 'Rahim',
        txn: 'TXN9900',
      }),
    );
  });

  it('hides the form while a payment is waiting for review', () => {
    render(
      <CampaignPaymentPanel
        campaignId="c1"
        budgetPoisha={50000}
        language="en"
        latest={{
          id: 'r1',
          campaignId: 'c1',
          amountPoisha: 50000,
          txnId: 'TXN1',
          status: 'pending',
          reviewNote: '',
          createdAt: '2026-11-10T00:00:00Z',
          decidedAt: null,
        }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'ads.builder.submitPayment' }),
    ).not.toBeInTheDocument();
  });
});
