import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { scorePassword } from '@/lib/auth/password-strength';
import { authErrorKey } from '@/lib/auth/errors';
import { sanitizeRedirect } from '@/lib/auth/redirect';
import { usernameSchema } from '@/lib/profile/profile-service';

describe('scorePassword', () => {
  it('rates short passwords as very weak', () => {
    expect(scorePassword('abc')).toBe(0);
  });

  it('rewards length, mixed case and symbols', () => {
    expect(scorePassword('bsdcmember1')).toBeGreaterThanOrEqual(1);
    expect(scorePassword('Dhaka#Dev2026x')).toBe(4);
  });

  it('never rewards a repeated character', () => {
    expect(scorePassword('aaaaaaaaaaaa')).toBeLessThanOrEqual(1);
  });
});

describe('usernameSchema', () => {
  it('accepts a normal handle', () => {
    expect(usernameSchema.parse('Rafi_Dev')).toBe('rafi_dev');
  });

  it.each(['ab', 'a'.repeat(25), '_rafi', 'rafi_', 'rafi dev', 'rafi-dev', 'admin'])(
    'rejects %s',
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('authErrorKey', () => {
  it('maps unknown email and wrong password to one message', () => {
    expect(authErrorKey(new FirebaseError('auth/user-not-found', 'x'))).toBe(
      'auth.errors.invalidCredentials',
    );
    expect(authErrorKey(new FirebaseError('auth/wrong-password', 'x'))).toBe(
      'auth.errors.invalidCredentials',
    );
  });

  it('falls back to a generic key', () => {
    expect(authErrorKey(new Error('boom'))).toBe('auth.errors.generic');
    expect(authErrorKey(new FirebaseError('auth/does-not-exist', 'x'))).toBe('auth.errors.generic');
  });
});

describe('sanitizeRedirect', () => {
  it('keeps same-origin paths', () => {
    expect(sanitizeRedirect('/settings')).toBe('/settings');
    expect(sanitizeRedirect('%2Fsettings%3Ftab%3Dprivacy')).toBe('/settings?tab=privacy');
  });

  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', '/auth/login', null])(
    'rejects %s',
    (value) => {
      expect(sanitizeRedirect(value)).toBe('/');
    },
  );
});

describe('post-login redirect safety', () => {
  it.each(['/x/../auth/login', '/AUTH/login', '/%09/evil.example', '/%0d/evil.example', '/auth'])(
    'rejects %s',
    (next) => {
      expect(sanitizeRedirect(next)).toBe('/');
    },
  );
});
