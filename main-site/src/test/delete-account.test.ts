import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Account deletion, which is a Play Store requirement and the one action in the
 * product that cannot be undone.
 *
 * The interesting property is not "the button calls a function" — it is the
 * order. The database work needs a valid Firebase token, so the RPC has to run
 * before the login is removed; and if the login removal fails after the RPC
 * succeeded, the member has to be told that their data is gone rather than that
 * "something went wrong". Each of those is a case below.
 */

/** The calls the flow made, in the order it made them. */
const order: string[] = [];

type RpcResult = { data: null; error: null | { code: string; message: string } };

const rpc = vi.fn((): Promise<RpcResult> => {
  order.push('db.delete_my_account');
  return Promise.resolve({ data: null, error: null });
});
const deleteUser = vi.fn((): Promise<void> => {
  order.push('firebase.deleteUser');
  return Promise.resolve();
});
const signOut = vi.fn((): Promise<void> => {
  order.push('firebase.signOut');
  return Promise.resolve();
});

const currentUser = {
  uid: 'uid-1',
  email: 'a@example.com',
  providerData: [] as { providerId: string }[],
  delete: () => deleteUser(),
};

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: (user: { delete: () => Promise<void> }) => user.delete(),
  EmailAuthProvider: { credential: vi.fn() },
  GithubAuthProvider: class {
    addScope() {}
  },
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  OAuthProvider: class {},
  reauthenticateWithCredential: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: () => signOut(),
  updatePassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  applyPersistence: () => Promise.resolve(),
  getFirebaseAuth: () => ({ currentUser }),
}));

vi.mock('@/lib/query-client', () => ({ clearQueryCache: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ rpc }),
  resetSupabase: vi.fn(),
}));

const { deleteMyAccount } = await import('@/lib/auth/auth-service');

describe('deleteMyAccount', () => {
  beforeEach(() => {
    order.length = 0;
    rpc.mockClear();
    deleteUser.mockClear();
    signOut.mockClear();
  });

  it('deletes the data before the login', async () => {
    // The token that authorises the RPC belongs to the Firebase user. Reversing
    // this order means the RPC arrives unauthenticated, is refused with 42501,
    // and the member's data is never deleted — while the login disappears.
    await deleteMyAccount();
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(order).toEqual(['db.delete_my_account', 'firebase.deleteUser', 'firebase.signOut']);
  });

  it('signs out even when the login could not be removed', async () => {
    deleteUser.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('stale'), { code: 'auth/requires-recent-login' })),
    );
    await expect(deleteMyAccount()).rejects.toThrow('auth/delete-pending');
    // The data is already gone; leaving the session open would be worse than
    // signing out and telling the member to finish on a fresh sign-in.
    expect(signOut).toHaveBeenCalled();
  });

  it('does not touch the login when the database refused', async () => {
    // A refusal is the owner account or a dead session. Deleting the Firebase
    // user here would remove the login of an account whose data is still there.
    rpc.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { code: '42501', message: 'owner' } }),
    );
    await expect(deleteMyAccount()).rejects.toThrow('auth/delete-owner-refused');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('reports a plain failure for a refusal that is not about the owner', async () => {
    rpc.mockImplementationOnce(() =>
      Promise.resolve({
        data: null,
        error: { code: '42501', message: 'sign in required to delete an account' },
      }),
    );
    await expect(deleteMyAccount()).rejects.toThrow('auth/delete-failed');
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
