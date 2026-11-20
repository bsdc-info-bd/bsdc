import type * as ReactI18Next from 'react-i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobApplication, JobDetail } from '@/lib/opportunities/opportunity-types';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';
import JobApplicationsPage from '@/routes/JobApplicationsPage';

const POSTER_UID = 'poster-1';

const mocks = vi.hoisted(() => ({
  applications: [] as JobApplication[],
  job: null as JobDetail | null,
  decide: vi.fn(),
  refetch: vi.fn(),
  decidingId: null as string | null,
  isDeciding: false,
  isDetailLoading: false,
  isDetailError: false,
  isQueueLoading: false,
  isQueueError: false,
  queueError: null as unknown,
}));

vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/use-opportunities', () => ({
  useJobDetail: () => ({
    job: mocks.job,
    isLoading: mocks.isDetailLoading,
    isError: mocks.isDetailError,
    isNotFound: !mocks.isDetailLoading && !mocks.isDetailError && mocks.job === null,
    refetch: mocks.refetch,
  }),
  useJobApplications: () => ({
    applications: mocks.applications,
    isLoading: mocks.isQueueLoading,
    isError: mocks.isQueueError,
    error: mocks.queueError,
    decide: mocks.decide,
    refetch: mocks.refetch,
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
  coverUrl: '',
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
  const base: JobApplication = {
    id: 'app-1',
    jobId: 'job-1',
    applicantUid: 'applicant-1',
    applicantName: 'Nusrat Jahan',
    displayName: 'Nusrat Jahan',
    username: 'nusrat',
    avatarUrl: null,
    verified: true,
    phone: '+880 1712-345678',
    email: 'nusrat@example.test',
    location: 'Sylhet',
    yearsExperience: 5,
    education: 'BSc in Computer Science',
    expectedSalaryPoisha: 12500000,
    portfolioUrl: 'https://nusrat.example.com',
    linkedinUrl: 'https://www.linkedin.com/in/nusrat',
    noticePeriod: '30 days',
    skills: ['Firebase', 'Kotlin'],
    certificationImageUrls: [],
    coverLetter: 'I have shipped three Firebase platforms.',
    resumeUrl: 'https://resume.example.com/cv',
    status: 'submitted',
    rejectionReason: '',
    decidedAt: null,
    createdAt: '2026-11-10T00:00:00Z',
  };
  return {
    ...base,
    ...overrides,
    applicantName: overrides.applicantName ?? base.applicantName,
    phone: overrides.phone ?? base.phone,
    email: overrides.email ?? base.email,
    location: overrides.location ?? base.location,
    yearsExperience: overrides.yearsExperience ?? base.yearsExperience,
    education: overrides.education ?? base.education,
    expectedSalaryPoisha: overrides.expectedSalaryPoisha ?? base.expectedSalaryPoisha,
    portfolioUrl: overrides.portfolioUrl ?? base.portfolioUrl,
    linkedinUrl: overrides.linkedinUrl ?? base.linkedinUrl,
    noticePeriod: overrides.noticePeriod ?? base.noticePeriod,
    skills: overrides.skills ?? base.skills,
    certificationImageUrls: overrides.certificationImageUrls ?? base.certificationImageUrls,
    rejectionReason: overrides.rejectionReason ?? base.rejectionReason,
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

function signInAs(uid: string, staff = false) {
  useAuthStore
    .getState()
    .setSession(
      { uid, displayName: 'Signed in', email: 'member@example.test', photoURL: null } as never,
      { ...DEFAULT_CLAIMS, staff },
    );
}

beforeEach(() => {
  useAuthStore.getState().reset();
  mocks.applications = [application()];
  mocks.job = job;
  mocks.decide.mockReset().mockResolvedValue(undefined);
  mocks.refetch.mockReset().mockResolvedValue(undefined);
  mocks.decidingId = null;
  mocks.isDeciding = false;
  mocks.isDetailLoading = false;
  mocks.isDetailError = false;
  mocks.isQueueLoading = false;
  mocks.isQueueError = false;
  mocks.queueError = null;
});

describe('job application review queue', () => {
  it('shows private contact, profile, compensation, links and cover-letter details to the poster', () => {
    signInAs(POSTER_UID);
    renderPage();

    expect(screen.getAllByText('Nusrat Jahan').length).toBeGreaterThan(0);
    expect(screen.getByText('I have shipped three Firebase platforms.')).toBeTruthy();
    expect(screen.getByText('@nusrat')).toHaveAttribute('href', '/@nusrat');
    expect(screen.getByText('+880 1712-345678')).toHaveAttribute('href', 'tel:+8801712345678');
    expect(screen.getByText('nusrat@example.test')).toHaveAttribute(
      'href',
      'mailto:nusrat@example.test',
    );
    expect(screen.getByText('BSc in Computer Science')).toBeTruthy();
    expect(screen.getByText('Firebase')).toBeTruthy();
    expect(screen.getByText('Kotlin')).toBeTruthy();
    expect(screen.getByText('jobs.applications.openResume').closest('a')).toHaveAttribute(
      'href',
      'https://resume.example.com/cv',
    );
    expect(screen.getByText('jobs.application.portfolio').closest('a')).toHaveAttribute(
      'href',
      'https://nusrat.example.com',
    );
  });

  it('requires confirmation before moving an application into review', async () => {
    signInAs(POSTER_UID);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.review' }));

    expect(screen.getByText('jobs.applications.confirmBody')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.actions.reviewing' }));
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('app-1', 'reviewing', ''));
  });

  it('requires confirmation before shortlisting and hiring an applicant', async () => {
    signInAs(POSTER_UID);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.shortlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.actions.shortlisted' }));
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('app-1', 'shortlisted', ''));

    mocks.decide.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.hire' }));
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.actions.hired' }));
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith('app-1', 'hired', ''));
  });

  it('requires a useful rejection reason and confirmation', async () => {
    signInAs(POSTER_UID);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'jobs.applications.decline' }));

    const confirm = screen.getByRole('button', { name: 'jobs.applications.actions.rejected' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'jobs.applications.declineReason' }), {
      target: { value: 'Not enough production experience' },
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith(
        'app-1',
        'rejected',
        'Not enough production experience',
      ),
    );
  });

  it('lets authorised staff review a role they did not post', () => {
    signInAs('staff-member', true);
    renderPage();
    expect(screen.getByText('jobs.applications.staffReview')).toBeTruthy();
    expect(screen.getByText('I have shipped three Firebase platforms.')).toBeTruthy();
  });

  it('refuses the queue to someone who did not post the job and is not staff', () => {
    signInAs('someone-else');
    renderPage();
    expect(screen.getByText('jobs.applications.ownerOnlyTitle')).toBeTruthy();
    expect(screen.queryByText('I have shipped three Firebase platforms.')).toBeNull();
  });

  it('asks a signed-out reader to sign in rather than showing the queue', () => {
    useAuthStore.getState().reset();
    renderPage();
    expect(screen.getByText('jobs.signInToApply')).toBeTruthy();
    expect(screen.queryByText('I have shipped three Firebase platforms.')).toBeNull();
  });

  it('shows an explicit retryable error rather than an empty queue when the query fails', () => {
    signInAs(POSTER_UID);
    mocks.applications = [];
    mocks.isQueueError = true;
    mocks.queueError = { code: '08006' };
    renderPage();

    expect(screen.getByText('jobs.applications.failed')).toBeTruthy();
    expect(screen.queryByText('jobs.applications.emptyTitle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('labels a permission error as access denied rather than as no applicants', () => {
    signInAs(POSTER_UID);
    mocks.applications = [];
    mocks.isQueueError = true;
    mocks.queueError = { code: '42501' };
    renderPage();
    expect(screen.getByText('jobs.applications.accessDeniedTitle')).toBeTruthy();
    expect(screen.queryByText('jobs.applications.emptyTitle')).toBeNull();
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

  it('filters applicants by contact or profile details', () => {
    signInAs(POSTER_UID);
    mocks.applications = [
      application(),
      application({
        id: 'app-2',
        applicantName: 'Farhan Ahmed',
        displayName: 'Farhan Ahmed',
        location: 'Dhaka',
      }),
    ];
    renderPage();
    fireEvent.change(screen.getByRole('searchbox', { name: 'jobs.applications.search' }), {
      target: { value: 'Sylhet' },
    });
    expect(screen.getAllByText('Nusrat Jahan').length).toBeGreaterThan(0);
    expect(screen.queryByText('Farhan Ahmed')).toBeNull();
  });
});
