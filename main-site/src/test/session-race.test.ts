import type * as FirebaseModule from '@/lib/firebase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRedirectResult, type IdTokenResult, type User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { startAuthListener } from '@/lib/auth/session';
import { useAuthStore, DEFAULT_CLAIMS } from '@/store/auth-store';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  authCallback: (_user: User | null) => {},
  tokenCallback: (_user: User | null) => {},
  ensure: vi.fn(),
  profile: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  getRedirectResult: vi.fn().mockResolvedValue(null),
  onAuthStateChanged: vi.fn((_auth: unknown, callback: (user: User | null) => void) => {
    mocks.authCallback = callback;
    return vi.fn();
  }),
  onIdTokenChanged: vi.fn((_auth: unknown, callback: (user: User | null) => void) => {
    mocks.tokenCallback = callback;
    return vi.fn();
  }),
}));
vi.mock('@/lib/firebase', async (original) => ({
  ...(await original<typeof FirebaseModule>()),
  getFirebaseAuth: () => mocks.auth,
}));
vi.mock('@/lib/auth/data-access', () => ({ ensureDataAccess: mocks.ensure }));
vi.mock('@/lib/profile/profile-service', () => ({
  fetchProfile: mocks.profile,
  ensureProfile: vi.fn().mockResolvedValue(undefined),
  bootstrapDisplayName: () => 'Member',
}));

const user = { uid: 'alice' } as User;
const token = { claims: { role: 'authenticated' } } as unknown as IdTokenResult;
const handlers = () => ({
  onSession: vi.fn(),
  onRedirectError: vi.fn(),
  onProfile: vi.fn(),
  onProfileError: vi.fn(),
  onProfileSettled: vi.fn(),
});
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = user;
  mocks.profile.mockResolvedValue({ uid: user.uid });
});

describe('session ordering', () => {
  it('does not publish a signed-in session from the initial token event before bootstrap', async () => {
    let resolve!: (token: IdTokenResult) => void;
    mocks.ensure.mockReturnValue(
      new Promise<IdTokenResult>((done) => {
        resolve = done;
      }),
    );
    const callbacks = handlers();
    const stop = startAuthListener(callbacks);
    mocks.authCallback(user);
    mocks.tokenCallback(user);
    await flush();
    expect(callbacks.onSession).not.toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
    resolve(token);
    await flush();
    expect(callbacks.onSession).toHaveBeenCalledWith(user, DEFAULT_CLAIMS);
    expect(callbacks.onProfileSettled).toHaveBeenCalledOnce();
    stop();
  });

  it('ignores an old bootstrap after sign-out', async () => {
    let resolve!: (token: IdTokenResult) => void;
    mocks.ensure.mockReturnValue(
      new Promise<IdTokenResult>((done) => {
        resolve = done;
      }),
    );
    const callbacks = handlers();
    const stop = startAuthListener(callbacks);
    mocks.authCallback(user);
    mocks.auth.currentUser = null;
    mocks.authCallback(null);
    resolve(token);
    await flush();
    expect(callbacks.onSession).toHaveBeenCalledTimes(1);
    expect(callbacks.onSession).toHaveBeenLastCalledWith(null, DEFAULT_CLAIMS);
    expect(mocks.profile).not.toHaveBeenCalled();
    stop();
  });

  it('does not publish an old profile after switching accounts', async () => {
    mocks.ensure.mockResolvedValue(token);
    let resolve!: (profile: unknown) => void;
    mocks.profile.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const callbacks = handlers();
    const stop = startAuthListener(callbacks);
    mocks.authCallback(user);
    await flush();
    mocks.auth.currentUser = null;
    mocks.authCallback(null);
    resolve({ uid: user.uid });
    await flush();
    expect(callbacks.onProfile).toHaveBeenCalledTimes(1);
    expect(callbacks.onProfile).toHaveBeenLastCalledWith(null);
    stop();
  });
});

describe('auth store token refresh', () => {
  it('preserves loaded profile state for the same account, not a different account', () => {
    const store = useAuthStore.getState();
    store.reset();
    store.setSession(user, DEFAULT_CLAIMS);
    store.setProfileLoaded(true);
    store.setSession(user, { ...DEFAULT_CLAIMS, role: 'creator' });
    expect(useAuthStore.getState().profileLoaded).toBe(true);
    store.setSession({ uid: 'bob' } as User, DEFAULT_CLAIMS);
    expect(useAuthStore.getState().profileLoaded).toBe(false);
    store.reset();
  });
});

describe('redirect completion errors', () => {
  it('reports a rejected OAuth callback instead of silently dropping it', async () => {
    vi.mocked(getRedirectResult).mockRejectedValueOnce(
      new FirebaseError('auth/unauthorized-domain', 'domain'),
    );
    const callbacks = handlers();
    const stop = startAuthListener(callbacks);
    await flush();
    expect(callbacks.onRedirectError).toHaveBeenCalledWith('auth.errors.unauthorizedDomain');
    stop();
  });

  it('does not publish errors after unmount', async () => {
    vi.mocked(getRedirectResult).mockRejectedValueOnce(
      new FirebaseError('auth/operation-not-allowed', 'disabled'),
    );
    const callbacks = handlers();
    const stop = startAuthListener(callbacks);
    stop();
    await flush();
    expect(callbacks.onRedirectError).not.toHaveBeenCalled();
  });
});
