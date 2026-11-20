import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Channel, Group } from '@/lib/communities/community-types';
import type { Post } from '@/lib/content/post-repository';
import ChannelPage from './ChannelPage';

const hooks = vi.hoisted(() => ({
  useGroup: vi.fn(),
  useChannelFeed: vi.fn(),
}));

vi.mock('@/hooks/use-communities', () => ({
  useGroup: hooks.useGroup,
}));
vi.mock('@/hooks/use-channel-feed', () => ({
  useChannelFeed: hooks.useChannelFeed,
}));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    slug: 'sylhet-php',
    name: 'Sylhet PHP',
    description: 'Talks and jobs.',
    privacy: 'public',
    avatarUrl: '',
    coverUrl: '',
    rules: '',
    language: 'bn',
    ownerUid: 'owner-uid',
    isArchived: false,
    members: 10,
    posts: 3,
    myRole: 'owner',
    requestStatus: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'channel-general',
    groupId: 'group-1',
    slug: 'general',
    name: 'general',
    topic: 'The general room',
    position: 0,
    isReadOnly: false,
    postCount: 1,
    ...overrides,
  };
}

function postFixture(): Post {
  return {
    id: 'post-1',
    slug: 'a-post',
    kind: 'post',
    title: 'A post',
    excerpt: 'Excerpt.',
    coverUrl: '',
    readingTime: 1,
    views: 1,
    comments: 0,
    likes: 0,
    tags: [],
    media: [],
    author: { uid: 'u1', username: 'someone', displayName: 'Someone', avatarUrl: '' },
    status: 'published',
    visibility: 'public',
    body: '',
    code: '',
    codeLanguage: '',
    language: 'en',
    isSensitive: false,
    allowComments: true,
    publishedAt: '2025-01-01T00:00:00Z',
    editedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    poll: [],
    channelId: null,
    channelName: null,
    channelSlug: null,
    groupSlug: null,
    groupName: null,
  };
}

function feedState(overrides: { posts?: unknown[]; isLoading?: boolean; isError?: boolean } = {}) {
  return {
    posts: overrides.posts ?? [],
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
  };
}

function groupState(overrides: Record<string, unknown> = {}) {
  return {
    group: group(),
    channels: [channel()],
    members: [],
    requests: [],
    isLoading: false,
    isError: false,
    join: vi.fn(),
    leave: vi.fn(),
    decide: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/g/:slug/c/:channelSlug" element={<ChannelPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the channel page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the channel name, the topic and the posts', () => {
    hooks.useGroup.mockReturnValue(groupState());
    hooks.useChannelFeed.mockReturnValue(
      feedState({
        posts: [postFixture()],
      }),
    );

    renderAt('/g/sylhet-php/c/general');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('general');
    expect(screen.getByText('The general room')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A post' })).toBeInTheDocument();
  });

  it('asks the feed for the found channel id, not the url slug', () => {
    hooks.useGroup.mockReturnValue(groupState());
    hooks.useChannelFeed.mockReturnValue(feedState());

    renderAt('/g/sylhet-php/c/general');

    expect(hooks.useChannelFeed).toHaveBeenCalledWith('channel-general');
  });

  it('asks the feed for nothing when the channel is not in the group list', () => {
    hooks.useGroup.mockReturnValue(groupState({ channels: [] }));
    hooks.useChannelFeed.mockReturnValue(feedState());

    renderAt('/g/sylhet-php/c/announcements');

    expect(hooks.useChannelFeed).toHaveBeenCalledWith(null);
    expect(screen.getByText('channels.notFoundTitle')).toBeInTheDocument();
  });

  it('answers a missing channel and an unreadable one with the same copy, and no alert', () => {
    hooks.useGroup.mockReturnValue(groupState({ channels: [] }));
    hooks.useChannelFeed.mockReturnValue(feedState());

    const missing = renderAt('/g/sylhet-php/c/absent');
    expect(missing.getByText('channels.notFoundTitle')).toBeInTheDocument();
    cleanup();

    // A private group's room that is not in the list is answered with the same
    // sentence: the URL must not reveal that the room exists.
    hooks.useGroup.mockReturnValue(
      groupState({ group: group({ privacy: 'private' }), channels: [] }),
    );
    const unreadable = renderAt('/g/sylhet-php/c/announcements');
    expect(unreadable.getByText('channels.notFoundTitle')).toBeInTheDocument();
    cleanup();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks a read-only channel', () => {
    hooks.useGroup.mockReturnValue(groupState({ channels: [channel({ isReadOnly: true })] }));
    hooks.useChannelFeed.mockReturnValue(feedState());

    renderAt('/g/sylhet-php/c/general');

    expect(screen.getByText('groups.readOnly')).toBeInTheDocument();
  });

  it('names the group in the empty state', () => {
    hooks.useGroup.mockReturnValue(groupState());
    hooks.useChannelFeed.mockReturnValue(feedState());

    renderAt('/g/sylhet-php/c/general');

    expect(screen.getByText('channels.emptyTitle')).toBeInTheDocument();
  });

  it('shows the skeleton while the group is loading', () => {
    hooks.useGroup.mockReturnValue({
      ...groupState(),
      isLoading: true,
    });
    hooks.useChannelFeed.mockReturnValue(feedState());

    renderAt('/g/sylhet-php/c/general');

    // PageSkeleton is role="status" with an aria-label, not visible text.
    expect(screen.getByRole('status', { name: 'common.loading' })).toBeInTheDocument();
  });

  it('writes a singular count for a channel with one post', () => {
    hooks.useGroup.mockReturnValue(groupState({ channels: [channel({ postCount: 1 })] }));
    hooks.useChannelFeed.mockReturnValue(feedState());

    renderAt('/g/sylhet-php/c/general');

    expect(screen.getByText('channels.posts')).toBeInTheDocument();
    expect(hooks.useChannelFeed).toHaveBeenCalledWith('channel-general');
  });
});
