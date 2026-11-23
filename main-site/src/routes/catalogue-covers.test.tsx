import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import type { CourseSummary } from '@/lib/learning/learning-types';
import type { Project } from '@/lib/opportunities/opportunity-types';
import LearnPage from './LearnPage';
import ProjectsPage from './ProjectsPage';

/**
 * The cover a visitor sees first is the largest thing above the fold, which makes
 * it the element Lighthouse measures as LCP — and `loading="lazy"` on it means the
 * request starts only after layout settles, behind the browser's low-priority
 * queue. `/learn` and `/projects` both measured 3.4 s of LCP against 0.7 s of
 * first paint for exactly this reason: the text was there, the image was not.
 *
 * The feed already keeps this rule (`FeedList` passes `priority={index === 0}` and
 * `PostCard.test.tsx` pins the attributes); the catalogue grids each re-declared
 * `loading="lazy"` on their first card instead. So the rule gets a test at the
 * pages that broke it, not only at the component that honours it.
 */

const hooks = vi.hoisted(() => ({
  useCourseCatalog: vi.fn(),
  useMyCertificates: vi.fn(),
  useProjects: vi.fn(),
  useMyProjects: vi.fn(),
}));

vi.mock('@/hooks/use-learning', () => ({
  useCourseCatalog: hooks.useCourseCatalog,
  useMyCertificates: hooks.useMyCertificates,
}));
vi.mock('@/hooks/use-opportunities', () => ({
  useProjects: hooks.useProjects,
  useMyProjects: hooks.useMyProjects,
}));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

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

function course(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    id: 'c1',
    slug: 'react-for-backend-devs',
    title: 'React for backend devs',
    summary: 'A short course about shipping a UI on top of an API you already own.',
    coverUrl: 'https://i.ibb.co/learn/react.webp',
    level: 'beginner',
    language: 'en',
    tags: ['react'],
    durationMinutes: 120,
    lessonCount: 8,
    enrolledCount: 41,
    instructorUid: 'u1',
    myProgress: null,
    myStatus: null,
    hasCertificate: true,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    slug: 'bsdc-web',
    name: 'BSDC Web',
    tagline: 'The community platform, in the open.',
    description:
      'Everything a member sees on the web: the feed, the channels, the marketplace and the learning tracks.',
    repoUrl: 'https://github.com/bsdc-info-bd/bsdc',
    demoUrl: '',
    coverUrl: 'https://i.ibb.co/project/web.webp',
    tech: ['typescript', 'react'],
    license: 'MIT',
    lookingForContributors: true,
    ownerUid: 'u1',
    stars: 12,
    starred: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  hooks.useMyCertificates.mockReturnValue({ certificates: [] });
  hooks.useMyProjects.mockReturnValue({ projects: [], isLoading: false, isError: false });
  hooks.useCourseCatalog.mockReturnValue({
    courses: [course(), course({ id: 'c2', slug: 'sql', title: 'SQL for people who hate SQL' })],
    filters: { level: null, tag: null },
    setFilters: vi.fn(),
    isLoading: false,
    isError: false,
  });
  hooks.useProjects.mockReturnValue({
    projects: [project(), project({ id: 'p2', slug: 'other', name: 'Another project' })],
    sort: 'popular',
    setSort: vi.fn(),
    star: vi.fn(),
    isLoading: false,
    isError: false,
  });
});

function renderAt(element: React.ReactNode) {
  return render(<MemoryRouter initialEntries={['/here']}>{element}</MemoryRouter>);
}

describe('the first cover in a catalogue grid', () => {
  it('is loaded eagerly at high priority on /learn, and only that one', () => {
    renderAt(<LearnPage />);
    const [first, second] = screen.getAllByRole('img');
    expect(first).toHaveAttribute('alt', 'React for backend devs');
    expect(first).toHaveAttribute('loading', 'eager');
    expect(first).toHaveAttribute('fetchpriority', 'high');
    expect(second).toHaveAttribute('loading', 'lazy');
    expect(second).not.toHaveAttribute('fetchpriority');
  });

  it('is loaded eagerly at high priority on /projects, and only that one', () => {
    renderAt(<ProjectsPage />);
    const [first, second] = screen.getAllByRole('img');
    expect(first).toHaveAttribute('alt', 'BSDC Web');
    expect(first).toHaveAttribute('loading', 'eager');
    expect(first).toHaveAttribute('fetchpriority', 'high');
    expect(second).toHaveAttribute('loading', 'lazy');
    expect(second).not.toHaveAttribute('fetchpriority');
  });

  it('leaves a card with no cover alone', () => {
    // A page whose first project has no cover must not hand the priority to a
    // later card by accident: the rule is about the *first* card, not the first
    // image on the page.
    hooks.useProjects.mockReturnValue({
      projects: [
        project({ coverUrl: '' }),
        project({ id: 'p2', slug: 'other', name: 'Another project' }),
      ],
      sort: 'popular',
      setSort: vi.fn(),
      star: vi.fn(),
      isLoading: false,
      isError: false,
    });
    renderAt(<ProjectsPage />);
    const images = screen.queryAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('loading', 'lazy');
    expect(images[0]).not.toHaveAttribute('fetchpriority');
  });
});
