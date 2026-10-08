import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { RequireGuest } from '@/components/auth/RequireGuest';
import { useAuthStore, DEFAULT_CLAIMS } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

vi.mock('@/design-system', () => ({ PageSkeleton: () => <div>Loading</div> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
});
