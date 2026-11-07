import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { CorporateEnv } from './env';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./client', () => ({
  getDb: () => ({ rpc: mocks.rpc, from: mocks.from }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  watchUser: vi.fn(),
}));
import { loadIdentity } from './session';
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
const user = { uid: 'alice', displayName: 'Alice', email: 'alice@example.test' } as User;
const row = {
  uid: 'alice',
  display_name: 'Alice',
  avatar_url: null,
  role: 'member',
  status: 'active',
  rank: 1,
};
const ok = (data: unknown) => ({ data, error: null });
const failure = (code: string, message: string) => ({
  data: null,
  error: { code, message, details: '' },
});
beforeEach(() => {
  vi.resetAllMocks();
});

describe('the database decides the effective corporate identity', () => {
  it('uses the database effective role instead of the raw profile role', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === 'staff_identity' ? ok([row]) : ok([{ role: 'owner', staff: true, bootstrap: true }]),
    );
    await expect(loadIdentity(env, user)).resolves.toMatchObject({
      uid: 'alice',
      role: 'owner',
      rank: 7,
    });
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['staff_identity', 'my_role']);
  });
  it('uses the effective role after a first profile is provisioned', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === 'staff_identity'
        ? ok([])
        : name === 'provision_staff'
          ? ok(row)
          : ok([{ role: 'admin', staff: true }]),
    );
    await expect(loadIdentity(env, user)).resolves.toMatchObject({ role: 'admin', rank: 6 });
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual([
      'staff_identity',
      'provision_staff',
      'my_role',
    ]);
  });
  it('does not hide permission or expired-token errors behind the public profile table', async () => {
    mocks.rpc.mockResolvedValue(failure('42501', 'permission denied for function staff_identity'));
    await expect(loadIdentity(env, user)).rejects.toThrow('database grants');
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue(failure('PGRST301', 'JWT expired'));
    await expect(loadIdentity(env, user)).rejects.toThrow('session expired');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('only falls back to the profile role when the effective-role routine is absent', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === 'staff_identity' ? ok([{ ...row, role: 'admin' }]) : failure('PGRST202', 'missing'),
    );
    await expect(loadIdentity(env, user)).resolves.toMatchObject({ role: 'admin', rank: 6 });
  });
  it('refuses an inactive, mismatched or unknown identity', async () => {
    mocks.rpc.mockResolvedValueOnce(ok([{ ...row, status: 'suspended' }]));
    await expect(loadIdentity(env, user)).rejects.toThrow('suspended');
    mocks.rpc.mockResolvedValueOnce(ok([{ ...row, uid: 'bob' }]));
    await expect(loadIdentity(env, user)).rejects.toThrow('another account');
    mocks.rpc.mockResolvedValueOnce(ok([row])).mockResolvedValueOnce(ok([{ role: 'superuser' }]));
    await expect(loadIdentity(env, user)).rejects.toThrow('effective role');
  });
});
