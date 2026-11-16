import type * as FirebaseAuth from 'firebase/auth';
import type * as FirebaseModule from '@/lib/firebase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { GithubAuthProvider, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { oauthFlowFor, signInWithProvider } from '@/lib/auth/auth-service';
import { clearPendingOAuthRedirect, hasPendingOAuthRedirect } from '@/lib/auth/oauth-state';
import { authErrorKey, shouldFallbackToRedirect } from '@/lib/auth/errors';

const mocks = vi.hoisted(() => ({
  auth: {},
  popup: vi.fn(),
  redirect: vi.fn(),
  persistence: vi.fn(),
}));
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof FirebaseAuth>()),
  signInWithPopup: mocks.popup,
  signInWithRedirect: mocks.redirect,
}));
vi.mock('@/lib/firebase', async (original) => ({
  ...(await original<typeof FirebaseModule>()),
  getFirebaseAuth: () => mocks.auth,
  applyPersistence: mocks.persistence,
}));
beforeEach(() => {
  vi.clearAllMocks();
  clearPendingOAuthRedirect();
  mocks.persistence.mockResolvedValue(undefined);
  mocks.popup.mockResolvedValue({ user: { uid: 'member' } });
  mocks.redirect.mockResolvedValue(undefined);
});

describe('OAuth providers', () => {
  it.each(['google', 'github', 'yahoo'] as const)(
    'starts %s with the selected persistence',
    async (id) => {
      await expect(signInWithProvider(id, false)).resolves.toMatchObject({
        user: { uid: 'member' },
      });
      expect(mocks.persistence).toHaveBeenCalledWith(false);
      expect(mocks.popup).toHaveBeenCalledOnce();
      const provider: unknown = mocks.popup.mock.calls[0]?.[1];
      if (id === 'google') expect(provider).toBeInstanceOf(GoogleAuthProvider);
      if (id === 'github') {
        expect(provider).toBeInstanceOf(GithubAuthProvider);
        expect((provider as GithubAuthProvider).getScopes()).toContain('user:email');
      }
      if (id === 'yahoo') {
        expect(provider).toBeInstanceOf(OAuthProvider);
        expect((provider as OAuthProvider).providerId).toBe('yahoo.com');
      }
    },
  );

  it('uses redirect only when the popup cannot be opened', async () => {
    mocks.popup.mockRejectedValue(new FirebaseError('auth/popup-blocked', 'blocked'));
    await expect(signInWithProvider('google')).resolves.toBeNull();
    expect(mocks.redirect).toHaveBeenCalledOnce();
  });

  it.each([
    'auth/popup-closed-by-user',
    'auth/unauthorized-domain',
    'auth/operation-not-allowed',
    'auth/web-storage-unsupported',
  ])('does not hide %s in another redirect attempt', async (code) => {
    const error = new FirebaseError(code, code);
    mocks.popup.mockRejectedValue(error);
    await expect(signInWithProvider('yahoo')).rejects.toBe(error);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(shouldFallbackToRedirect(error)).toBe(false);
  });

  it('surfaces redirect start failures', async () => {
    mocks.popup.mockRejectedValue(new FirebaseError('auth/popup-blocked', 'blocked'));
    mocks.redirect.mockRejectedValue(new FirebaseError('auth/unauthorized-domain', 'domain'));
    await expect(signInWithProvider('github')).rejects.toMatchObject({
      code: 'auth/unauthorized-domain',
    });
  });

  it('marks a pending redirect marker on redirect fallback and skips pre-popup persistence await when remember=true', async () => {
    mocks.popup.mockRejectedValue(new FirebaseError('auth/popup-blocked', 'blocked'));
    await expect(signInWithProvider('google', true)).resolves.toBeNull();
    expect(hasPendingOAuthRedirect()).toBe(true);
    expect(mocks.redirect).toHaveBeenCalledOnce();
    clearPendingOAuthRedirect();
  });

  it('uses redirect on mobile only when authDomain is same-origin or inside an in-app webview', () => {
    const phone = {
      width: 390,
      touch: true,
      userAgent: 'Mozilla/5.0 (iPhone)',
      inApp: false,
      standalone: false,
    };
    expect(oauthFlowFor(phone, 'bsdc-bd.firebaseapp.com', 'www.bsdc.info.bd')).toBe('popup');
    expect(oauthFlowFor(phone, 'www.bsdc.info.bd', 'www.bsdc.info.bd')).toBe('redirect');
    expect(
      oauthFlowFor({ ...phone, inApp: true }, 'bsdc-bd.firebaseapp.com', 'www.bsdc.info.bd'),
    ).toBe('redirect');
  });

  it.each([
    'auth/invalid-oauth-client-id',
    'auth/invalid-oauth-provider',
    'auth/missing-or-invalid-nonce',
  ])('explains provider configuration error %s', (code) => {
    expect(authErrorKey(new FirebaseError(code, code))).toBe('auth.errors.providerMisconfigured');
  });
});
