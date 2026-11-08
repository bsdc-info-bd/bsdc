import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PostCard } from './PostCard';
import type { Post } from '@/lib/content/post-repository';
import type * as I18nModule from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { minutes?: number; defaultValue?: string }) =>
        key === 'post.readingTime'
          ? `${String(options?.minutes ?? 0)} min read`
          : (options?.defaultValue ?? key),
      i18n: { language: 'en' },
    }),
  };
});

/**
 * The card a reader meets in the feed.
 *
 * Two properties matter enough to test without a browser: the card is not one
 * giant link (or the avatar and the tags cannot be links of their own), and the
 * first card's picture is the one the browser is told not to defer. Everything
 * else here is a regression guard on the shape — a post with no title, a post with
 * no pictures, a post with fourteen tags.
 */
function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    slug: 'hello-bangladesh',
    kind: 'post',
    title: 'Hello Bangladesh',
    excerpt: 'A first post about shipping software from Sylhet.',
    coverUrl: '',
    readingTime: 4,
    views: 1200,
    comments: 8,
    likes: 12,
    tags: ['react', 'typescript', 'dhaka'],
    media: [],
    author: { uid: 'u1', username: 'ada', displayName: 'Ada Lovelace', avatarUrl: '' },
    status: 'published',
    visibility: 'public',
    body: '',
    code: '',
    codeLanguage: '',
    language: 'en',
    isSensitive: false,
    allowComments: true,
    publishedAt: '2026-11-01T10:00:00.000Z',
    editedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    poll: [],
    ...overrides,
  } as Post;
}

function renderCard(entry: Post, priority = false) {
  return render(
    <MemoryRouter>
      <PostCard post={entry} priority={priority} />
    </MemoryRouter>,
  );
}

describe('a post in the feed', () => {
  it('makes the title the link, and keeps the card itself out of the anchor', () => {
    renderCard(post());
    const article = screen.getByRole('article');
    // The card is an article, not an anchor. If it were an anchor, the avatar and
    // every tag inside it would be a link inside a link, which is invalid and
    // which browsers resolve by ignoring the inner one.
    expect(article.tagName).toBe('ARTICLE');
    expect(within(article).getAllByRole('link').length).toBeGreaterThan(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hello Bangladesh');
    expect(screen.getByRole('link', { name: 'Hello Bangladesh' })).toHaveAttribute(
      'href',
      '/p/hello-bangladesh',
    );
  });

  it('links the author and the tags to where they lead', () => {
    renderCard(post());
    // The avatar and the name are both links to the same profile, which is what
    // every feed does; the test asks for at least one of each, not exactly one.
    const author = screen.getAllByRole('link', { name: 'Ada Lovelace' });
    expect(author.length).toBeGreaterThan(0);
    expect(author[0]).toHaveAttribute('href', '/@ada');
    expect(screen.getByRole('link', { name: '#react' })).toHaveAttribute('href', '/tag/react');
  });

  it('shows at most four tags, so a post with twenty does not become a tag cloud', () => {
    renderCard(post({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(screen.getByRole('link', { name: '#d' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '#e' })).toBeNull();
  });

  it('renders a titleless post without an empty heading', () => {
    renderCard(post({ title: '' }));
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    // The excerpt is still the way in.
    expect(screen.getByText(/shipping software from Sylhet/)).toBeInTheDocument();
  });

  it('survives a post with no author row', () => {
    renderCard(post({ author: null }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hello Bangladesh');
  });

  it('marks only the first card’s picture as worth loading early', () => {
    const picture = {
      mediaId: 'm1',
      url: 'https://i.ibb.co/full/a.webp',
      thumbUrl: 'https://i.ibb.co/medium/a.webp',
      altText: 'A screenshot of the dashboard',
      position: 0,
      width: 1200,
      height: 800,
    };
    const { unmount } = renderCard(post({ media: [picture] }), true);
    const first = screen.getByRole('img', { name: 'A screenshot of the dashboard' });
    expect(first).toHaveAttribute('fetchpriority', 'high');
    expect(first).toHaveAttribute('loading', 'eager');
    expect(first).toHaveAttribute('src', 'https://i.ibb.co/medium/a.webp');
    expect(first.getAttribute('srcset') ?? '').toContain(' 640w');
    expect(first.getAttribute('srcset') ?? '').toContain(' 1200w');
    unmount();

    renderCard(post({ media: [picture] }), false);
    const later = screen.getByRole('img', { name: 'A screenshot of the dashboard' });
    expect(later).not.toHaveAttribute('fetchpriority');
    expect(later).toHaveAttribute('loading', 'lazy');
  });
});
