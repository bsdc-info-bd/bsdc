import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileSchema } from '@/lib/profile/types';
import ProfilePage from './ProfilePage';

const services = vi.hoisted(() => ({
  fetchProfileByIdentifier: vi.fn(),
  fetchProfileStats: vi.fn(),
}));
const auth = vi.hoisted(() => ({ user: null as { uid: string } | null }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/lib/env', () => ({ isConfigured: { firebase: true, supabase: false } }));
vi.mock('@/lib/profile/profile-service', () => services);
vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (state: { user: typeof auth.user }) => unknown) =>
    selector({ user: auth.user }),
}));
vi.mock('@/hooks/use-presence', () => ({ usePresence: () => 'offline' }));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('@/components/content/PostCard', () => ({ PostCard: () => null }));
vi.mock('@/components/social/FollowButton', () => ({ FollowButton: () => null }));
vi.mock('@/components/media/MediaImage', () => ({
  MediaImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('@/components/media/Lightbox', () => ({
  Lightbox: ({ label, onClose }: { label: string; onClose: () => void }) => (
    <div role="dialog" aria-label={label}>
      <button type="button" onClick={onClose}>
        close preview
      </button>
    </div>
  ),
}));

const uid = 'agy8CtdeZCeOlsUv1CxJcR1r8K52';
const member = profileSchema.parse({
  uid,
  displayName: 'Ayesha Noor',
  coverUrl: 'https://i.ibb.co/profile/cover.webp',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:handle" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  services.fetchProfileByIdentifier.mockResolvedValue(member);
  services.fetchProfileStats.mockResolvedValue({
    posts: 0,
    followers: 0,
    following: 0,
    reputation: 0,
  });
});

describe('public member permalinks and profile covers', () => {
  it('loads an unclaimed profile by the exact-case UID and renders its cover', async () => {
    renderAt(`/@${uid}`);

    expect(await screen.findByRole('heading', { name: 'Ayesha Noor' })).toBeInTheDocument();
    expect(services.fetchProfileByIdentifier).toHaveBeenCalledWith(uid);
    expect(screen.getByRole('img', { name: /compose\.cover\.label/ })).toHaveAttribute(
      'src',
      member.coverUrl,
    );
    expect(screen.getByText(`@${uid}`)).toBeInTheDocument();
  });

  it('opens the cover in an accessible, dismissible full-size viewer', async () => {
    renderAt(`/@${uid}`);

    const cover = await screen.findByRole('button', { name: /Ayesha Noor/ });
    fireEvent.click(cover);
    expect(screen.getByRole('dialog', { name: /compose\.cover\.label/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close preview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links a member to their UID permalink before they choose a username', async () => {
    auth.user = { uid };
    renderAt(`/@${uid}`);

    const edit = await screen.findByRole('link', { name: /profile\.editProfile/ });
    expect(edit).toHaveAttribute('href', '/settings/account');
    expect(screen.getByText(`@${uid}`)).toBeInTheDocument();
  });
});
