import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { EventDetail } from '@/lib/communities/community-types';
import type { JobDetail } from '@/lib/opportunities/opportunity-types';
import EventPage from './EventPage';
import JobPage from './JobPage';

const hooks = vi.hoisted(() => ({
  useJobDetail: vi.fn(),
  useEventDetail: vi.fn(),
}));

vi.mock('@/hooks/use-opportunities', () => ({ useJobDetail: hooks.useJobDetail }));
vi.mock('@/hooks/use-communities', () => ({ useEventDetail: hooks.useEventDetail }));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

// The auth store is a plain object here so each test states who is signed in.
const auth = vi.hoisted(() => ({ user: null as null | { uid: string } }));
vi.mock('@/store/auth-store', () => ({
  selectIsSignedIn: (state: { user: unknown }) => state.user !== null,
  useAuthStore: (selector: (state: { user: unknown }) => unknown) => selector(auth),
}));

function job(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'job-1',
    slug: 'senior-backend',
    title: 'Senior Backend Engineer',
    company: 'Shohoz Labs',
    jobType: 'full_time',
    workMode: 'onsite',
    level: 'senior',
    city: 'Dhaka',
    salaryMin: null,
    salaryMax: null,
    currency: 'BDT',
    period: 'month',
    skills: ['node'],
    applications: 2,
    publishedAt: '2026-10-01T00:00:00Z',
    myStatus: null,
    description: 'Build payment rails.\nOn call twice a month.',
    country: 'BD',
    applyUrl: '',
    status: 'open',
    expiresAt: null,
    posterUid: 'poster-uid',
    ...overrides,
  };
}

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'evt-1',
    slug: 'friday-meetup',
    title: 'Friday Meetup',
    mode: 'online',
    venue: '',
    city: '',
    coverUrl: '',
    startsAt: '2026-10-15T12:00:00Z',
    endsAt: '2026-10-15T14:00:00Z',
    capacity: null,
    going: 4,
    groupId: null,
    pageId: null,
    myStatus: null,
    description: 'Talks on Postgres.',
    joinUrl: 'https://meet.example.com/secret-room',
    timezone: 'Asia/Dhaka',
    isCancelled: false,
    hostUid: 'host-uid',
    ...overrides,
  };
}

function jobState(overrides: Record<string, unknown> = {}) {
  return { ...jobReturn(), ...overrides };
}
function jobReturn() {
  return {
    job: job(),
    isLoading: false,
    isError: false,
    isNotFound: false,
    apply: vi.fn(() => Promise.resolve()),
    isApplying: false,
  };
}

function eventState(overrides: Record<string, unknown> = {}) {
  return { ...eventReturn(), ...overrides };
}
function eventReturn() {
  return {
    event: event(),
    isLoading: false,
    isError: false,
    isNotFound: false,
    rsvp: vi.fn(),
    isSaving: false,
    saveFailed: false,
  };
}

function renderAt(path: string, route: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

const renderJob = () => renderAt('/jobs/senior-backend', '/jobs/:slug', <JobPage />);
const renderEvent = () => renderAt('/events/friday-meetup', '/events/:slug', <EventPage />);

beforeEach(() => {
  auth.user = null;
  hooks.useJobDetail.mockReset();
  hooks.useEventDetail.mockReset();
});

describe('JobPage', () => {
  it('shows a loading skeleton while the role is fetched', () => {
    hooks.useJobDetail.mockReturnValue(jobState({ isLoading: true, job: null }));
    renderJob();
    expect(screen.getByRole('status', { name: 'jobs.detail.loading' })).toBeInTheDocument();
  });

  it('shows an alert when the role cannot be loaded', () => {
    hooks.useJobDetail.mockReturnValue(jobState({ isError: true, job: null }));
    renderJob();
    expect(screen.getByRole('alert')).toHaveTextContent('jobs.detail.failed');
  });

  it('says the role is not open when the reader may not see it', () => {
    hooks.useJobDetail.mockReturnValue(jobState({ isNotFound: true, job: null }));
    renderJob();
    expect(screen.getByText('jobs.detail.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jobs.detail.back' })).toHaveAttribute('href', '/jobs');
  });

  it('asks a signed-out reader to sign in rather than offering to apply', () => {
    hooks.useJobDetail.mockReturnValue(jobState());
    renderJob();
    expect(screen.getByText('jobs.signInToApply')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.apply' })).toBeNull();
  });

  it('offers to apply to a signed-in reader and sends the cover letter', async () => {
    auth.user = { uid: 'reader-uid' };
    const state = jobState();
    hooks.useJobDetail.mockReturnValue(state);
    renderJob();

    fireEvent.click(screen.getByRole('button', { name: 'jobs.apply' }));
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'jobs.sendApplication' });
    expect(send).toBeDisabled();

    const letter = within(dialog).getByRole('textbox');
    fireEvent.change(letter, {
      target: { value: 'I have shipped three production Node services.' },
    });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(state.apply).toHaveBeenCalledWith(
      'job-1',
      'I have shipped three production Node services.',
    );
    // The dialog closes only once the application has been accepted.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows the status of an application already sent, and no second apply button', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useJobDetail.mockReturnValue(jobState({ job: job({ myStatus: 'shortlisted' }) }));
    renderJob();
    expect(screen.getByText('jobs.detail.applicationStatus')).toBeInTheDocument();
    expect(screen.getByText('jobs.statuses.shortlisted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.apply' })).toBeNull();
  });

  it('tells the poster their own role and offers no apply button to them', () => {
    auth.user = { uid: 'poster-uid' };
    hooks.useJobDetail.mockReturnValue(jobState());
    renderJob();
    expect(screen.getByText('jobs.detail.postedByYou')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.apply' })).toBeNull();
  });

  it('marks a closed role as closed and refuses an apply button for it', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useJobDetail.mockReturnValue(jobState({ job: job({ status: 'closed' }) }));
    renderJob();
    expect(screen.getByText('jobs.detail.statuses.closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jobs.apply' })).toBeNull();
  });

  it('links to the company site only for a web address', () => {
    hooks.useJobDetail.mockReturnValue(
      jobState({ job: job({ applyUrl: 'https://careers.example.com/role' }) }),
    );
    const { unmount } = renderJob();
    const link = screen.getByRole('link', { name: 'jobs.detail.applyExternal' });
    expect(link).toHaveAttribute('href', 'https://careers.example.com/role');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    unmount();

    hooks.useJobDetail.mockReturnValue(jobState({ job: job({ applyUrl: 'javascript:alert(1)' }) }));
    renderJob();
    expect(screen.queryByRole('link', { name: 'jobs.detail.applyExternal' })).toBeNull();
  });
});

describe('EventPage', () => {
  it('shows a loading skeleton while the event is fetched', () => {
    hooks.useEventDetail.mockReturnValue(eventState({ isLoading: true, event: null }));
    renderEvent();
    expect(screen.getByRole('status', { name: 'events.detail.loading' })).toBeInTheDocument();
  });

  it('says the event is not available when the reader may not see it', () => {
    hooks.useEventDetail.mockReturnValue(eventState({ isNotFound: true, event: null }));
    renderEvent();
    expect(screen.getByText('events.detail.notFoundTitle')).toBeInTheDocument();
  });

  it('withholds the join link from someone who has not said they are going', () => {
    auth.user = { uid: 'stranger-uid' };
    hooks.useEventDetail.mockReturnValue(eventState());
    renderEvent();
    expect(screen.getByText('events.detail.joinHidden')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'events.detail.joinLink' })).toBeNull();
    expect(document.body.innerHTML).not.toContain('secret-room');
  });

  it('gives the join link to someone who is going', () => {
    auth.user = { uid: 'stranger-uid' };
    hooks.useEventDetail.mockReturnValue(eventState({ event: event({ myStatus: 'going' }) }));
    renderEvent();
    expect(screen.getByRole('link', { name: 'events.detail.joinLink' })).toHaveAttribute(
      'href',
      'https://meet.example.com/secret-room',
    );
  });

  it('gives the join link to the host', () => {
    auth.user = { uid: 'host-uid' };
    hooks.useEventDetail.mockReturnValue(eventState());
    renderEvent();
    expect(screen.getByText('events.detail.hostedByYou')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'events.detail.joinLink' })).toBeInTheDocument();
  });

  it('shows a cancelled event as cancelled and offers no RSVP', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useEventDetail.mockReturnValue(eventState({ event: event({ isCancelled: true }) }));
    renderEvent();
    expect(screen.getByRole('alert')).toHaveTextContent('events.detail.cancelled');
    expect(screen.queryByRole('button', { name: 'events.rsvp.going' })).toBeNull();
  });

  it('asks a signed-out reader to sign in to respond', () => {
    hooks.useEventDetail.mockReturnValue(eventState());
    renderEvent();
    expect(screen.getByText('events.signInToRsvp')).toBeInTheDocument();
  });

  it('records a response through the hook', () => {
    auth.user = { uid: 'reader-uid' };
    const state = eventState();
    hooks.useEventDetail.mockReturnValue(state);
    renderEvent();
    fireEvent.click(screen.getByRole('button', { name: 'events.rsvp.interested' }));
    expect(state.rsvp).toHaveBeenCalledWith('interested');
  });

  it('disables going when the event is full and the reader is not already going', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useEventDetail.mockReturnValue(eventState({ event: event({ capacity: 4, going: 4 }) }));
    renderEvent();
    expect(screen.getByRole('button', { name: 'events.rsvp.going' })).toBeDisabled();
  });

  it('reports a response that could not be saved', () => {
    auth.user = { uid: 'reader-uid' };
    hooks.useEventDetail.mockReturnValue(eventState({ saveFailed: true }));
    renderEvent();
    expect(screen.getByRole('alert')).toHaveTextContent('events.detail.rsvpFailed');
  });
});
