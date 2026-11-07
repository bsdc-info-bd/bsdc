import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CorporateEnv } from './env';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  ensure: vi.fn(),
  accessToken: null as null | (() => Promise<string | null>),
}));
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => mocks.auth,
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onIdTokenChanged: vi.fn(),
}));
vi.mock('./data-access', () => ({ ensureCorporateDataAccess: mocks.ensure }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(
    (_url: string, _key: string, options: { accessToken: () => Promise<string | null> }) => {
      mocks.accessToken = options.accessToken;
      return {};
    },
  ),
}));
import { getDb, resetClients } from './client';

const env: CorporateEnv = {
  appId: 'bsdc-admin',
  appName: 'Admin',
  siteUrl: 'https://www.bsdc.info.bd',
  verificationUrl: 'https://vf.main.bsdc.info.bd',
  firebase: {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'project',
    appId: 'app',
    databaseURL: '',
  },
  supabase: { url: 'https://example.supabase.co', publishableKey: 'key' },
};
beforeEach(() => {
  vi.clearAllMocks();
  resetClients();
  mocks.auth.currentUser = { uid: 'alice' };
  getDb(env);
});

describe('corporate Supabase token boundary', () => {
  it('waits for database access and sends the refreshed token', async () => {
    mocks.ensure.mockResolvedValue({ token: 'refreshed-token' });
    await expect(mocks.accessToken!()).resolves.toBe('refreshed-token');
    expect(mocks.ensure).toHaveBeenCalledWith(env, mocks.auth.currentUser);
  });
  it('does not use a token if bootstrap fails', async () => {
    mocks.ensure.mockRejectedValue(new Error('bootstrap unavailable'));
    await expect(mocks.accessToken!()).rejects.toThrow('bootstrap unavailable');
  });
  it('never sends the previous account token after an account switch', async () => {
    mocks.ensure.mockImplementation(() => {
      mocks.auth.currentUser = { uid: 'bob' };
      return Promise.resolve({ token: 'alice-token' });
    });
    await expect(mocks.accessToken!()).rejects.toThrow('session changed');
  });
  it('keeps unsigned-in calls anonymous', async () => {
    mocks.auth.currentUser = null;
    await expect(mocks.accessToken!()).resolves.toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
