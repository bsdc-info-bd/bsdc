import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeed } from '@/hooks/use-feed';
import type { Post } from '@/lib/content/post-repository';
import type { FeedCandidate, FeedPreferences } from '@/lib/feed/ranking';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';

const mocks = vi.hoisted(() => ({
  fetchCandidates: vi.fn(),
  fetchFeedPreferences: vi.fn(),
  fetchNewPostCount: vi.fn(),
  hydratePosts: vi.fn(),
  recordImpression: vi.fn(),
  saveFeedPreferences: vi.fn(),
}));

vi.mock('@/lib/feed/feed-repository', () => ({
  fetchCandidates: mocks.fetchCandidates,
  fetchFeedPreferences: mocks.fetchFeedPreferences,
  fetchNewPostCount: mocks.fetchNewPostCount,
  hydratePosts: mocks.hydratePosts,
  recordImpression: mocks.recordImpression,
  saveFeedPreferences: mocks.saveFeedPreferences,
}));

function makePost(id: string, authorUid: string): Post {
  return {
    id,
    slug: id,
    kind: 'post',
    status: 'published',
    visibility: 'public',
    title: id,
    body: 'Body text',
    excerpt: 'Body text',
    coverUrl: '',
    code: '',
    codeLanguage: '',
    language: 'en',
    readingTime: 1,
    views: 1,
    likes: 0,
    comments: 0,
    isSensitive: false,
    allowComments: true,
    publishedAt: '2026-10-01T10:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    author: { uid: authorUid, username: authorUid, displayName: authorUid, avatarUrl: '' },
    tags: [],
    media: [],
    poll: [],
  };
}

function makeCandidate(
  postId: string,
  authorUid: string,
  overrides: Partial<FeedCandidate> = {},
): FeedCandidate {
  return {
    postId,
    authorUid,
    publishedAt: '2026-10-01T10:00:00.000Z',
    likes: 0,
    comments: 0,
    views: 5,
    language: 'en',
    isSensitive: false,
    kind: 'post',
    authorFollowed: false,
    affinity: 0,
    alreadySeen: false,
    tags: [],
    ...overrides,
  };
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().reset();
  mocks.fetchNewPostCount.mockResolvedValue(0);
  mocks.recordImpression.mockResolvedValue(undefined);
  mocks.fetchFeedPreferences.mockResolvedValue({
    algorithm: 'ranked',
    languages: ['bn', 'en'],
    mutedTags: [],
    showSensitive: false,
    hideSeen: true,
  } satisfies FeedPreferences);
});

describe('feed account isolation and own-post trap prevention', () => {
  it('shows other members’ previously seen posts instead of trapping an active author with only their own posts', async () => {
    useAuthStore.getState().setSession({ uid: 'alice' } as User, DEFAULT_CLAIMS);
    const alicePost = makeCandidate('p-alice', 'alice', { alreadySeen: true });
    const bobPost = makeCandidate('p-bob', 'bob', { alreadySeen: true });
    mocks.fetchCandidates.mockResolvedValue([alicePost, bobPost]);
    mocks.hydratePosts.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => makePost(id, id === 'p-alice' ? 'alice' : 'bob'))),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useFeed('ranked'), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.posts).toHaveLength(2));
    expect(result.current.posts.map((p) => p.id)).toContain('p-bob');
    expect(result.current.onlyOwnByPreferences).toBe(false);
  });

  it('flags when feed preferences hide every other member’s post', async () => {
    useAuthStore.getState().setSession({ uid: 'alice' } as User, DEFAULT_CLAIMS);
    mocks.fetchFeedPreferences.mockResolvedValue({
      algorithm: 'ranked',
      languages: ['bn'],
      mutedTags: [],
      showSensitive: false,
      hideSeen: true,
    } satisfies FeedPreferences);
    const alicePost = makeCandidate('p-alice', 'alice', { language: 'en' });
    const bobPost = makeCandidate('p-bob', 'bob', { language: 'en' });
    mocks.fetchCandidates.mockResolvedValue([alicePost, bobPost]);
    mocks.hydratePosts.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => makePost(id, id === 'p-alice' ? 'alice' : 'bob'))),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useFeed('ranked'), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.onlyOwnByPreferences).toBe(true));
    expect(result.current.posts.map((p) => p.id)).toEqual(['p-alice']);
  });
});
