import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/routes/SettingsPage';
import { ROUTES } from '@/lib/site';

/**
 * Every settings panel has its own address.
 *
 * The page used to be one URL and a `useState`, so the back button did nothing,
 * a support reply could not say "open your privacy settings", and a member who
 * reloaded lost the panel they were on. These tests hold the three promises that
 * replaced it: a panel is reachable by URL, choosing a panel changes the URL, and
 * an address that is not a panel goes to the first one instead of rendering
 * nothing.
 */

vi.mock('@/store/auth-store', () => {
  const state = {
    user: {
      uid: 'member-1',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Ada First',
      providerData: [{ providerId: 'password' }],
      metadata: {
        creationTime: '2026-01-01T00:00:00.000Z',
        lastSignInTime: '2026-11-01T00:00:00.000Z',
      },
    },
    profileLoaded: true,
    isSignedIn: true,
    profile: null,
  };
  const useAuthStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state, subscribe: () => () => undefined },
  );
  return {
    useAuthStore,
    selectIsSignedIn: (value: typeof state) => value.isSignedIn,
    selectIsStaff: () => false,
  };
});

vi.mock('@/store/profile-store', () => {
  const profile = {
    uid: 'member-1',
    username: 'ada',
    displayName: 'Ada First',
    bio: '',
    avatarUrl: '',
    coverUrl: '',
    location: '',
    website: '',
    role: 'member',
    status: 'active',
  };
  const state = { profile, loaded: true };
  const useProfileStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state, subscribe: () => () => undefined },
  );
  return { useProfileStore };
});

vi.mock('@/hooks/use-feed', () => ({
  useFeedPreferences: () => ({
    preferences: { algorithm: 'ranked', languages: ['bn', 'en'], mutedTags: [], topics: [] },
    save: vi.fn(),
    isSaving: false,
  }),
}));

// `Seo` needs a Helmet context that only the router shell provides.
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

vi.mock('@/components/media/AvatarUploader', () => ({ AvatarUploader: () => null }));
vi.mock('@/components/notifications/PushCard', () => ({ PushCard: () => null }));
vi.mock('@/components/profile/HandleCard', () => ({ HandleCard: () => null }));
vi.mock('@/components/profile/LocationField', () => ({ LocationField: () => null }));

function Where() {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={`${ROUTES.settings}/:panel`} element={<SettingsPage />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe('settings panels are addresses', () => {
  it('renders the privacy panel at its own path', () => {
    renderAt('/settings/privacy');
    expect(screen.getByTestId('path')).toHaveTextContent('/settings/privacy');
    // The privacy panel is the one with discoverability switches.
    expect(screen.getByText('Control how discoverable you are.')).toBeInTheDocument();
  });

  it('renders the feed panel at its own path', () => {
    renderAt('/settings/feed');
    expect(screen.getByTestId('path')).toHaveTextContent('/settings/feed');
    expect(screen.getByText('Control what reaches you and in which order.')).toBeInTheDocument();
  });

  it('moves to the panel a member picks', async () => {
    const user = userEvent.setup();
    renderAt('/settings/account');
    await user.click(screen.getByRole('tab', { name: 'Security' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/settings/security');
  });

  it('keeps the keyboard on the tab a member moved to', async () => {
    // The strip's buttons are not remounted by a panel change, so the arrow key
    // that moves the selection also leaves focus there. This is a guard, not a
    // fix: a `key` on the strip, or a panel rendered outside it, would silently
    // drop a keyboard member back to the top of the document.
    const user = userEvent.setup();
    renderAt('/settings/account');
    screen.getByRole('tab', { name: 'Account' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('path')).toHaveTextContent('/settings/appearance');
    // A tab that changes the address re-renders the page; without this focus
    // falls to the body and the next arrow key scrolls the document instead of
    // moving along the strip.
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Appearance' }));
  });

  it('sends an address that is not a panel to the first panel', () => {
    renderAt('/settings/nonsense');
    expect(screen.getByTestId('path')).toHaveTextContent('/settings/account');
  });
});
