import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import type { AppNotification } from '@/lib/interactions/interaction-types';
import NotificationsPage from './NotificationsPage';

const hooks = vi.hoisted(() => ({
  useNotifications: vi.fn(),
}));

vi.mock('@/hooks/use-interactions', () => ({ useNotifications: hooks.useNotifications }));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
// The push card talks to a service worker and is not what this test is about.
vi.mock('@/components/notifications/PushCard', () => ({ PushCard: () => null }));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) =>
        options?.count === undefined ? key : `${key}:${options.count}`,
      i18n: { language: 'en' },
    }),
  };
});

function line(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    kind: 'reaction',
    body: '',
    postId: 'post-1',
    commentId: null,
    conversationId: null,
    targetUrl: '/p/a-river-level',
    readAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    lastAt: '2026-11-01T10:00:00.000Z',
    occurrences: 1,
    unreadCount: 1,
    isUnread: true,
    actor: { uid: 'rahim', username: 'rahim', displayName: 'Rahim Second', avatarUrl: '' },
    ...overrides,
  };
}

function state(overrides: Partial<ReturnType<typeof hooks.useNotifications>> = {}) {
  const value = {
    notifications: [] as AppNotification[],
    isLoading: false,
    isError: false,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    clearRead: vi.fn(),
    isClearing: false,
    ...overrides,
  };
  hooks.useNotifications.mockReturnValue(value);
  return value;
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the inbox', () => {
  // The report this screen was fixed from: it threw on open and the boundary
  // said "Something went wrong on this screen". A render that throws fails
  // here, which is the cheapest possible guard against the same regression.
  it('renders a full line without throwing', () => {
    state({ notifications: [line({ body: 'A reply about the river' })] });
    expect(() => {
      renderPage();
    }).not.toThrow();
    expect(screen.getByText('notifications.kinds.reaction')).toBeInTheDocument();
  });

  it('renders a line whose actor has gone, without a missing-name hole', () => {
    state({ notifications: [line({ actor: null })] });
    renderPage();
    // The words are still there; the person is "someone".
    expect(screen.getByText(/notifications\.kinds\.reaction/)).toBeInTheDocument();
  });

  it('renders an empty inbox as an invitation, not an error', () => {
    state({ notifications: [] });
    renderPage();
    expect(screen.getByText('notifications.emptyTitle')).toBeInTheDocument();
    expect(screen.queryByText('notifications.failed')).not.toBeInTheDocument();
  });

  it('says nothing was lost when the list could not be loaded', () => {
    state({ isError: true });
    renderPage();
    expect(screen.getByText('notifications.failed')).toBeInTheDocument();
    expect(screen.getByText('notifications.failedHint')).toBeInTheDocument();
  });
});

describe('opening a line', () => {
  it('goes where the database said, not where the screen guessed', () => {
    state({ notifications: [line({ targetUrl: '/p/a-river-level' })] });
    renderPage();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/p/a-river-level');
  });

  it('opens a message in its thread', () => {
    state({
      notifications: [
        line({ kind: 'message', conversationId: 'c-9', targetUrl: '/messages/c-9', postId: null }),
      ],
    });
    renderPage();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/messages/c-9');
  });

  // A follow answers `/people` at the database, because the database cannot
  // know whether the person is still there. The screen knows who the actor is
  // — the inbox resolved them into the same row — so it opens that person
  // instead, and falls back to the directory when the account has gone.
  it('opens a follow on the person who followed', () => {
    state({ notifications: [line({ kind: 'follow', targetUrl: '/people', postId: null })] });
    renderPage();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/@rahim');
  });

  it('falls back to the directory when the person is gone', () => {
    state({
      notifications: [line({ kind: 'follow', targetUrl: '/people', postId: null, actor: null })],
    });
    renderPage();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/people');
  });

  // Reading is an action, not a side effect of looking: an inbox that clears
  // its own bold on mount cannot be scanned.
  it('marks a line read when it is opened, and only then', () => {
    const value = state({ notifications: [line({ id: 'n7' })] });
    renderPage();
    expect(value.markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link'));
    expect(value.markRead).toHaveBeenCalledWith(['n7']);
  });

  it('does not write the same read twice', () => {
    const value = state({ notifications: [line({ id: 'n7' })] });
    renderPage();
    fireEvent.click(screen.getByRole('link'));
    fireEvent.click(screen.getByRole('link'));
    expect(value.markRead).toHaveBeenCalledTimes(1);
  });
});

describe('the actions', () => {
  it('offers marking everything read only while something is unread', () => {
    state({ notifications: [line({ isUnread: false, readAt: '2026-11-02T00:00:00Z' })] });
    renderPage();
    expect(screen.queryByText('notifications.markAllRead')).not.toBeInTheDocument();
    expect(screen.getByText('notifications.clearRead')).toBeInTheDocument();
  });

  it('offers clearing only when something has been read', () => {
    state({ notifications: [line({ isUnread: true })] });
    renderPage();
    expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument();
    expect(screen.queryByText('notifications.clearRead')).not.toBeInTheDocument();
  });

  it('calls what the buttons say', () => {
    const value = state({
      notifications: [line({ id: 'a', isUnread: true }), line({ id: 'b', isUnread: false })],
    });
    renderPage();
    fireEvent.click(screen.getByText('notifications.markAllRead'));
    expect(value.markAllRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('notifications.clearRead'));
    expect(value.clearRead).toHaveBeenCalledTimes(1);
  });
});

describe('a line that stands for several', () => {
  it('says how many are behind it', () => {
    state({ notifications: [line({ kind: 'message', occurrences: 4, unreadCount: 4 })] });
    renderPage();
    expect(screen.getByText('notifications.andMore:3')).toBeInTheDocument();
  });

  it('says nothing extra when it stands for one', () => {
    state({ notifications: [line({ occurrences: 1 })] });
    renderPage();
    expect(screen.queryByText(/notifications\.andMore/)).not.toBeInTheDocument();
  });
});
