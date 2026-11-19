import type * as ReactI18Next from 'react-i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobApplication, JobDetail } from '@/lib/opportunities/opportunity-types';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';
import JobApplicationsPage from '@/routes/JobApplicationsPage';

/**
 * The employer's application queue.
 *
 * Until this page existed the web could only show "N applicants" and apply: an
 * employer had no way to read a cover letter or hire anyone. These cases pin the
 * behaviour that matters — the poster sees the queue and can decide, and nobody
 * else is shown other people's applications.
 */

const POSTER_UID = 'poster-1';

const mocks = vi.hoisted(() => ({
  applications: [] as JobApplication[],
  job: null as JobDetail | null,
  decide: vi.fn(),
  decidingId: null as string | null,
  isDeciding: false,
  isLoading: false,
  isError: false,
}));

vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/use-opportunities', () => ({
  useJobDetail: () => ({
    job: mocks.job,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    isNotFound: mocks.job === null,
  }),
  useJobApplications: () => ({
    applications: mocks.applications,
    isLoading: false,
    isError: mocks.isError,
    decide: mocks.decide,
    isDeciding: mocks.isDeciding,
    decidingId: mocks.decidingId,
  }),
}));

const job: JobDetail = {
  id: 'job-1',
  slug: 'senior-firebase-engineer',
  title: 'Senior Firebase engineer',
  company: 'BSDC',
  jobType: 'full_time',
  workMode: 'remote',
  level: 'senior',
  city: 'Dhaka',
  salaryMin: 120000,
  salaryMax: 180000,
  currency: 'BDT',
  period: 'month',
  skills: ['Firebase'],
  applications: 2,
  publishedAt: '2026-11-01T00:00:00Z',
  myStatus: null,
  description: 'Build the platform.',
  country: 'BD',
  applyUrl: '',
  status: 'open',
  expiresAt: null,
  posterUid: POSTER_UID,
};

function application(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 'app-1',
    jobId: 'job-1',
    applicantUid: 'applicant-1',
    displayName: 'Nusrat Jahan',
    username: 'nusrat',
    avatarUrl: null,
    verified: true,
    coverLetter: 'I have shipped three Firebase platforms.',
    resumeUrl: '',
    status: 'submitted',
    decidedAt: null,
    createdAt: '2026-11-10T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/jobs/senior-firebase-engineer/applications']}>
      <Routes>
        <Route path="/jobs/:slug/applications" element={<JobApplicationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function signInAs(uid: string) {
  // Through the store's own action, so the test cannot drift from the real
  // `status` value (`authenticated`) the way a hand-built literal would.
  useAuthStore
    .getState()
    .setSession(
      { uid, displayName: 'Signed in', email: 'member@example.test', photoURL: null } as never,
      DEFAULT_CLAIMS,
    );
}

beforeEach(() => {
  useAuthStore.getState().reset();
  mocks.applications = [application()];
  mocks.job = job;
  mocks.decide.mockReset().mockResolvedValue(undefined);
  mocks.decidingId = null;
  mocks.isDeciding = false;
  mocks.isLoading = false;
  mocks.isError = false;
});

describe('job applications queue', () => {
  it('shows the poster each applicant with their cover letter', () => {
    signInAs(POSTER_UID);
    renderPage();

    expect(screen.getByText('Nusrat Jahan')).toBeTruthy();
    expect(screen.getByText('I have shipped three Firebase platforms.')).toBeTruthy();
    expect(screen.getByText('@nusrat')).toBeTruthy();
  });

  it('hires an applicant from the queue', async () => {
    signInAs(POSTER_UID);
    renderPage();

    fireEvent.click(screen.getByText('jobs.applications.hire'));

    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('app-1', 'hired'));
  });

  it('shortlists an applicant from the queue', async () => {
    signInAs(POSTER_UID);
    renderPage();

    fireEvent.click(screen.getByText('jobs.applications.shortlist'));

    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('app-1', 'shortlisted'));
  });

  it('will not decline without a reason of at least three characters', async () => {
    signInAs(POSTER_UID);
    renderPage();

    fireEvent.click(screen.getByText('jobs.applications.decline'));

    // The dialog explains itself and asks for a reason; its confirm button is
    // the one inside the dialog, and it stays disabled until the reason is real.
    expect(await screen.findByText('jobs.applications.declineReason')).toBeTruthy();
    const confirm = screen
      .getAllByRole('button')
      .filter((button) => button.textContent === 'jobs.applications.decline')
      .at(-1) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Not enough Firebase depth' },
    });
    await waitFor(() => expect(confirm.disabled).toBe(false));

    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('app-1', 'rejected'));
  });

  it('refuses the queue to someone who did not post the job', () => {
    signInAs('someone-else');
    renderPage();

    expect(screen.getByText('jobs.applications.ownerOnlyTitle')).toBeTruthy();
    // The applicant's name must not leak to a member who did not post the role.
    expect(screen.queryByText('Nusrat Jahan')).toBeNull();
  });

  it('asks a signed-out reader to sign in rather than showing the queue', () => {
    useAuthStore.getState().reset();
    renderPage();

    expect(screen.getByText('jobs.signInToApply')).toBeTruthy();
    expect(screen.queryByText('Nusrat Jahan')).toBeNull();
  });

  it('says plainly that nobody has applied yet', () => {
    signInAs(POSTER_UID);
    mocks.applications = [];
    renderPage();

    expect(screen.getByText('jobs.applications.emptyTitle')).toBeTruthy();
  });

  it('renders a cover-letter-less application without inventing text', () => {
    signInAs(POSTER_UID);
    mocks.applications = [application({ coverLetter: '' })];
    renderPage();

    expect(screen.getByText('jobs.applications.noCoverLetter')).toBeTruthy();
  });
});
