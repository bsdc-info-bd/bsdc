import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureRealtimeAuth, getSupabase, resetSupabase } from '@/lib/supabase/client';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  ensure: vi.fn(),
  setAuth: vi.fn(),
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
      return { realtime: { setAuth: mocks.setAuth } };
    },
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  resetSupabase();
  mocks.auth.currentUser = { uid: 'alice' };
  mocks.setAuth.mockResolvedValue(undefined);
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
  it('requires and awaits the intended account token before a Realtime join', async () => {
    mocks.ensure.mockResolvedValue({ token: 'alice-token' });
    let finish: (() => void) | undefined;
    mocks.setAuth.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let complete = false;
    const authenticating = ensureRealtimeAuth('alice').then(() => {
      complete = true;
    });
    await vi.waitFor(() => expect(mocks.setAuth).toHaveBeenCalledWith('alice-token'));
    expect(complete).toBe(false);
    finish?.();
    await authenticating;
    expect(complete).toBe(true);
  });
  it('refuses Realtime joins on bootstrap failure, sign-out, or the wrong account', async () => {
    mocks.ensure.mockRejectedValueOnce(new Error('bootstrap unavailable'));
    await expect(ensureRealtimeAuth('alice')).rejects.toThrow('bootstrap unavailable');
    expect(mocks.setAuth).not.toHaveBeenCalled();
    await expect(ensureRealtimeAuth('bob')).rejects.toThrow('auth/required');
    mocks.auth.currentUser = null;
    await expect(ensureRealtimeAuth('alice')).rejects.toThrow('auth/required');
    expect(mocks.setAuth).not.toHaveBeenCalled();
  });
  it('propagates Realtime setAuth failures for an account-scoped join', async () => {
    mocks.ensure.mockResolvedValue({ token: 'alice-token' });
    mocks.setAuth.mockRejectedValueOnce(new Error('socket auth failed'));
    await expect(ensureRealtimeAuth('alice')).rejects.toThrow('socket auth failed');
  });

  it('refuses a Realtime join if the account changes while setAuth is in flight', async () => {
    mocks.ensure.mockResolvedValue({ token: 'alice-token' });
    mocks.setAuth.mockImplementationOnce(() => {
      mocks.auth.currentUser = { uid: 'bob' };
      return Promise.resolve();
    });
    await expect(ensureRealtimeAuth('alice')).rejects.toThrow('auth/required');
  });

  it('keeps anonymous reads anonymous', async () => {
    mocks.auth.currentUser = null;
    await expect(mocks.accessToken!()).resolves.toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
