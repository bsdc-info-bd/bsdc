import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabase, resetSupabase } from '@/lib/supabase/client';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  ensure: vi.fn(),
  accessToken: null as null | (() => Promise<string | null>),
}));
vi.mock('@/lib/env', () => ({
  isConfigured: { firebase: true, supabase: true },
  env: { supabase: { url: 'https://example.supabase.co', publishableKey: 'test' } },
}));
vi.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => mocks.auth }));
vi.mock('@/lib/auth/data-access', () => ({ ensureDataAccess: mocks.ensure }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(
    (_url: string, _key: string, options: { accessToken: () => Promise<string | null> }) => {
      mocks.accessToken = options.accessToken;
      return {};
    },
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  resetSupabase();
  mocks.auth.currentUser = { uid: 'alice' };
  getSupabase();
});

describe('Supabase token boundary', () => {
  it('waits for database access and sends the refreshed token, not the stale token', async () => {
    mocks.ensure.mockResolvedValue({ token: 'refreshed-token' });
    await expect(mocks.accessToken!()).resolves.toBe('refreshed-token');
    expect(mocks.ensure).toHaveBeenCalledWith(mocks.auth.currentUser);
  });
  it('does not send a request with a token whose bootstrap failed', async () => {
    mocks.ensure.mockRejectedValue(new Error('bootstrap unavailable'));
    await expect(mocks.accessToken!()).rejects.toThrow('bootstrap unavailable');
  });
  it('refuses the previous account token if the account changes while waiting', async () => {
    mocks.ensure.mockImplementation(() => {
      mocks.auth.currentUser = { uid: 'bob' };
      return Promise.resolve({ token: 'alice-token' });
    });
    await expect(mocks.accessToken!()).rejects.toThrow('auth/required');
  });
  it('keeps anonymous reads anonymous', async () => {
    mocks.auth.currentUser = null;
    await expect(mocks.accessToken!()).resolves.toBe('');
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
