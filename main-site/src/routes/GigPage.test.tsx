import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Gig } from '@/lib/opportunities/opportunity-types';
import GigPage from './GigPage';

const hooks = vi.hoisted(() => ({ useGigDetail: vi.fn() }));

vi.mock('@/hooks/use-opportunities', () => ({ useGigDetail: hooks.useGigDetail }));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

const auth = vi.hoisted(() => ({ user: null as null | { uid: string } }));
vi.mock('@/store/auth-store', () => ({
  selectIsSignedIn: (state: { user: unknown }) => state.user !== null,
  useAuthStore: (selector: (state: { user: unknown }) => unknown) => selector(auth),
}));

function gig(overrides: Partial<Gig> = {}): Gig {
  return {
    id: 'gig-1',
    slug: 'payments-api',
    title: 'Payments API build',
    description: 'Build the refund webhook.\nTests included.',
    budgetMin: 300,
    budgetMax: 600,
    currency: 'USD',
    isHourly: false,
    durationDays: 14,
    skills: ['node', 'postgres'],
    proposals: 3,
    clientUid: 'client-uid',
    publishedAt: '2026-10-01T00:00:00Z',
    status: 'open',
    ...overrides,
  } as Gig;
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    gig: gig(),
    myProposalStatus: null,
    isLoading: false,
    isError: false,
    isNotFound: false,
    propose: vi.fn(() => Promise.resolve()),
    isProposing: false,
    ...overrides,
  };
}

function renderGig() {
  return render(
    <MemoryRouter initialEntries={['/freelance/payments-api']}>
      <Routes>
        <Route path="/freelance/:slug" element={<GigPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = null;
  hooks.useGigDetail.mockReset();
});

describe('GigPage', () => {
  it('shows a loading skeleton while the gig is fetched', () => {
    hooks.useGigDetail.mockReturnValue(state({ isLoading: true, gig: null }));
    renderGig();
    expect(screen.getByRole('status', { name: 'freelance.detail.loading' })).toBeInTheDocument();
  });

  it('shows an alert when the gig cannot be loaded', () => {
    hooks.useGigDetail.mockReturnValue(state({ isError: true, gig: null }));
    renderGig();
    expect(screen.getByRole('alert')).toHaveTextContent('freelance.detail.failed');
  });

  it('says the gig is not found, with a way back, when it is not visible', () => {
    hooks.useGigDetail.mockReturnValue(state({ isNotFound: true, gig: null }));
    renderGig();
    expect(screen.getByText('freelance.detail.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'freelance.detail.back' })).toHaveAttribute(
      'href',
      '/freelance',
    );
  });

  it('shows the title, budget, duration, proposal count and skills of an open gig', () => {
    hooks.useGigDetail.mockReturnValue(state());
    renderGig();
    expect(screen.getByRole('heading', { level: 1, name: 'Payments API build' })).toBeVisible();
    expect(screen.getByText('freelance.durationDays', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('freelance.proposalCount', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('node')).toBeInTheDocument();
    expect(screen.getByText('postgres')).toBeInTheDocument();
  });

  it('renders the description as text, never as markup', () => {
    hooks.useGigDetail.mockReturnValue(
      state({ gig: gig({ description: '<img src=x onerror=alert(1)> plain' }) }),
    );
    const { container } = renderGig();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> plain/)).toBeInTheDocument();
  });

  it('asks a signed-out reader to sign in rather than offering to propose', () => {
    hooks.useGigDetail.mockReturnValue(state());
    renderGig();
    expect(screen.getByText('freelance.signInToPropose')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'freelance.propose' })).toBeNull();
  });

  it('keeps send disabled until the pitch, bid and days are valid, then sends them', async () => {
    auth.user = { uid: 'reader-uid' };
    const current = state();
    hooks.useGigDetail.mockReturnValue(current);
    renderGig();

    fireEvent.click(screen.getByRole('button', { name: 'freelance.propose' }));
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'freelance.sendProposal' });
    expect(send).toBeDisabled();

    const [pitch] = within(dialog).getAllByRole('textbox');
    fireEvent.change(pitch!, { target: { value: 'Shipped three refund pipelines already.' } });
    expect(send).toBeDisabled();

    const [bid, days] = within(dialog).getAllByRole('spinbutton');
    fireEvent.change(bid!, { target: { value: '450' } });
    fireEvent.change(days!, { target: { value: '10' } });
    expect(send).not.toBeDisabled();

    fireEvent.click(send);
    expect(current.propose).toHaveBeenCalledWith(
      'Shipped three refund pipelines already.',
      450,
      10,
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('refuses a bid that is not a number', async () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useGigDetail.mockReturnValue(state());
    renderGig();
    fireEvent.click(screen.getByRole('button', { name: 'freelance.propose' }));
    const dialog = await screen.findByRole('dialog');
    const [pitch] = within(dialog).getAllByRole('textbox');
    fireEvent.change(pitch!, { target: { value: 'Shipped three refund pipelines already.' } });
    const [bid, days] = within(dialog).getAllByRole('spinbutton');
    fireEvent.change(bid!, { target: { value: '' } });
    fireEvent.change(days!, { target: { value: '10' } });
    expect(within(dialog).getByRole('button', { name: 'freelance.sendProposal' })).toBeDisabled();
  });

  it('shows the status of a proposal already sent, and no second propose button', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useGigDetail.mockReturnValue(state({ myProposalStatus: 'shortlisted' }));
    renderGig();
    expect(screen.getByText('freelance.detail.proposalStatus')).toBeInTheDocument();
    expect(screen.getByText('jobs.statuses.shortlisted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'freelance.propose' })).toBeNull();
  });

  it('tells the client their own gig and offers no propose button to them', () => {
    auth.user = { uid: 'client-uid' };
    hooks.useGigDetail.mockReturnValue(state());
    renderGig();
    expect(screen.getByText('freelance.detail.postedByYou')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'freelance.propose' })).toBeNull();
  });

  it('marks a closed gig as closed and accepts no proposals', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useGigDetail.mockReturnValue(state({ gig: gig({ status: 'closed' }) }));
    renderGig();
    expect(screen.getByText('freelance.detail.statuses.closed')).toBeInTheDocument();
    expect(screen.getByText('freelance.detail.notAccepting')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'freelance.propose' })).toBeNull();
  });
});
