import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { JobFilters, JobListing } from '@/lib/opportunities/opportunity-types';
import JobsPage from './JobsPage';

const board = vi.hoisted(() => ({
  jobs: [] as JobListing[],
  facets: [] as string[],
  filters: {} as JobFilters,
  setFilters: vi.fn(),
}));

vi.mock('@/hooks/use-opportunities', () => ({
  useJobBoard: () => ({
    jobs: board.jobs,
    facets: board.facets,
    filters: board.filters,
    setFilters: board.setFilters,
    isLoading: false,
    isError: false,
    apply: vi.fn(),
    isApplying: false,
  }),
}));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});
vi.mock('@/store/auth-store', () => ({
  selectIsSignedIn: () => false,
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

function job(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: 'job-1',
    slug: 'react-developer',
    title: 'React developer',
    company: 'Dhaka Labs',
    jobType: 'full_time',
    workMode: 'remote',
    level: 'mid',
    city: 'Dhaka',
    salaryMin: null,
    salaryMax: null,
    currency: 'BDT',
    period: 'month',
    skills: ['react', 'typescript'],
    applications: 0,
    publishedAt: null,
    myStatus: null,
    ...overrides,
  };
}

function renderPage(): ReactElement {
  const page = <JobsPage />;
  render(<MemoryRouter>{page}</MemoryRouter>);
  return page;
}

describe('JobsPage skill filter', () => {
  beforeEach(() => {
    board.jobs = [job()];
    board.facets = ['react', 'typescript'];
    board.filters = { workMode: null, skill: null, level: null, query: '' };
    board.setFilters.mockReset();
  });

  it('selects a skill when its chip is pressed', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'react' }));
    expect(board.setFilters).toHaveBeenLastCalledWith(expect.objectContaining({ skill: 'react' }));
  });

  it('clears the skill when its selected chip is pressed again', () => {
    board.filters = { workMode: null, skill: 'react', level: null, query: '' };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'react' }));
    expect(board.setFilters).toHaveBeenLastCalledWith(expect.objectContaining({ skill: null }));
  });
});
