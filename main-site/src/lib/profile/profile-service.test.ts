import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from './types';

const backend = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  fetchProfileByUsername: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ isConfigured: { supabase: true } }));
vi.mock('./supabase-backend', () => ({
  supabaseProfileBackend: {
    name: 'supabase',
    fetchProfile: backend.fetchProfile,
    fetchProfileByUsername: backend.fetchProfileByUsername,
  },
}));

import { fetchProfileByIdentifier, resetProfileBackend } from './profile-service';

const member = { uid: 'agy8CtdeZCeOlsUv1CxJcR1r8K52', username: '' } as Profile;

beforeEach(() => {
  resetProfileBackend();
  vi.clearAllMocks();
});

describe('fetchProfileByIdentifier', () => {
  it('looks up a username case-insensitively before trying a UID', async () => {
    const claimed = { ...member, username: 'ada_dev' };
    backend.fetchProfileByUsername.mockResolvedValueOnce(claimed);

    await expect(fetchProfileByIdentifier('@ADA_DEV')).resolves.toBe(claimed);
    expect(backend.fetchProfileByUsername).toHaveBeenCalledWith('ada_dev');
    expect(backend.fetchProfile).not.toHaveBeenCalled();
  });

  it('falls back to the exact, case-sensitive UID for a profile without a handle', async () => {
    backend.fetchProfileByUsername.mockResolvedValueOnce(null);
    backend.fetchProfile.mockResolvedValueOnce(member);

    await expect(fetchProfileByIdentifier('@agy8CtdeZCeOlsUv1CxJcR1r8K52')).resolves.toBe(member);
    expect(backend.fetchProfileByUsername).toHaveBeenCalledWith('agy8ctdezceolsuv1cxjcr1r8k52');
    expect(backend.fetchProfile).toHaveBeenCalledWith('agy8CtdeZCeOlsUv1CxJcR1r8K52');
  });

  it('does not query storage for an empty permalink', async () => {
    await expect(fetchProfileByIdentifier(' @ ')).resolves.toBeNull();
    expect(backend.fetchProfileByUsername).not.toHaveBeenCalled();
    expect(backend.fetchProfile).not.toHaveBeenCalled();
  });
});
