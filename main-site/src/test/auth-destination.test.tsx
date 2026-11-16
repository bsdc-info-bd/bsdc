import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { RequireGuest } from '@/components/auth/RequireGuest';
import type { Profile } from '@/lib/profile/profile-service';
import { DEFAULT_NOTIFICATIONS, DEFAULT_PRIVACY } from '@/lib/profile/types';
import { useAuthStore, DEFAULT_CLAIMS } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

vi.mock('@/design-system', () => ({
  PageSkeleton: () => <div>Loading</div>,
  Card: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  Alert: ({ title, children }: { title: string; children?: unknown }) => (
    <div>
      <span>{title}</span>
      <span>{children as never}</span>
    </div>
  ),
  Button: ({ children, onClick }: { children: unknown; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children as never}
    </button>
  ),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    uid: 'existing-member',
    username: 'alice',
    displayName: 'Alice',
    bio: '',
    avatarUrl: '',
    coverUrl: '',
    location: '',
    website: '',
    skills: [],
    interests: [],
    language: 'bn',
    onboardingComplete: true,
    notifications: DEFAULT_NOTIFICATIONS,
    privacy: DEFAULT_PRIVACY,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  useAuthStore.getState().reset();
  useProfileStore.getState().setProfile(null);
  useAuthStore.getState().setSession({ uid: 'new-member' } as User, DEFAULT_CLAIMS);
});

function page(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireGuest />}>
          <Route path="/auth/login" element={<div>Login form</div>} />
        </Route>
        <Route path="/onboarding" element={<div>Profile setup</div>} />
        <Route path="/settings" element={<div>Account settings</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OAuth and email login destinations', () => {
  it('waits for profile loading to settle before navigating', () => {
    page('/auth/login');
    expect(screen.queryByText('Profile setup')).not.toBeInTheDocument();
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('sends a new member to profile setup', () => {
    useAuthStore.getState().setProfileLoaded(true);
    page('/auth/login');
    expect(screen.getByText('Profile setup')).toBeInTheDocument();
  });

  it('honors a safe next destination', () => {
    useAuthStore.getState().setProfileLoaded(true);
    page('/auth/login?next=%2Fsettings');
    expect(screen.getByText('Account settings')).toBeInTheDocument();
  });

  it('does not follow an external next URL', () => {
    useAuthStore.getState().setProfileLoaded(true);
    page('/auth/login?next=https%3A%2F%2Fevil.example');
    expect(screen.getByText('Profile setup')).toBeInTheDocument();
  });

  it('never routes an already-onboarded OAuth member to onboarding even with ?next=/onboarding', () => {
    useProfileStore
      .getState()
      .setProfile(makeProfile({ onboardingComplete: true, username: 'alice' }));
    useAuthStore.getState().setProfileLoaded(true);
    page('/auth/login?next=%2Fonboarding');
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('treats an existing profile with a claimed username as already onboarded', () => {
    useProfileStore
      .getState()
      .setProfile(makeProfile({ onboardingComplete: false, username: 'legacy_dev' }));
    useAuthStore.getState().setProfileLoaded(true);
    page('/auth/login');
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('shows profile sync recovery instead of sending to onboarding on transient profile error', () => {
    useProfileStore.getState().setError('profile/access-failed');
    useAuthStore.getState().setProfileLoaded(true);
    page('/auth/login');
    expect(screen.queryByText('Profile setup')).not.toBeInTheDocument();
    expect(screen.getByText('auth.profileSync.title')).toBeInTheDocument();
    expect(screen.getByText('auth.profileSync.retry')).toBeInTheDocument();
  });
});
