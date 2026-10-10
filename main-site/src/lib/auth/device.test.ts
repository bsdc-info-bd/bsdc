import { describe, expect, it } from 'vitest';
import { FirebaseError } from 'firebase/app';
import {
  canPersistSession,
  isInAppBrowser,
  isPhoneSized,
  POPUP_MIN_WIDTH,
  prefersRedirectFlow,
  readDeviceSignals,
  type DeviceSignals,
} from './device';
import { authErrorKey, isStorageFailure, shouldFallbackToRedirect } from './errors';

function signals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    width: 1280,
    touch: false,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    inApp: false,
    standalone: false,
    ...overrides,
  };
}

const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('in-app browsers', () => {
  it.each([
    ['Facebook', 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 FBAV/417.0.0.0.72'],
    ['Instagram', 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Instagram 289.0.0.0.0'],
    ['Messenger', 'Mozilla/5.0 (Linux; Android 12) Messenger/1.0 FBAN/MessengerLite'],
    ['TikTok', 'Mozilla/5.0 (Linux; Android 13) musically 2021001030 TIKTOK'],
    ['Telegram', 'Mozilla/5.0 (Linux; Android 13) Telegram/8.0'],
    ['Discord', 'Mozilla/5.0 (Linux; Android 13) Discord/1.0'],
    ['WeChat', 'Mozilla/5.0 (iPhone) MicroMessenger/8.0'],
    ['Google app', 'Mozilla/5.0 (iPhone) GSA/123.0 Mobile/15E148 Safari/604.1'],
    ['generic webview', 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36'],
  ])('recognises %s', (_label, userAgent) => {
    expect(isInAppBrowser(userAgent)).toBe(true);
  });

  it.each([
    ['desktop Chrome', signals().userAgent],
    ['iPhone Safari', PHONE],
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 13) Chrome/126.0 Mobile Safari/537.36'],
  ])('leaves %s alone', (_label, userAgent) => {
    expect(isInAppBrowser(userAgent)).toBe(false);
  });
});

describe('screen shape', () => {
  it('calls a touch handset phone-sized', () => {
    expect(isPhoneSized({ width: 390, touch: true })).toBe(true);
    expect(isPhoneSized({ width: POPUP_MIN_WIDTH - 1, touch: true })).toBe(true);
  });

  it('does not call a tablet, a laptop or a narrow desktop window a phone', () => {
    expect(isPhoneSized({ width: 1024, touch: true })).toBe(false);
    expect(isPhoneSized({ width: 390, touch: false })).toBe(false);
    expect(isPhoneSized({ width: POPUP_MIN_WIDTH, touch: true })).toBe(false);
  });

  it('treats an unknown width as not a phone rather than guessing', () => {
    expect(isPhoneSized({ width: 0, touch: true })).toBe(false);
  });
});

describe('which OAuth flow a device gets', () => {
  it('redirects a phone', () => {
    expect(prefersRedirectFlow(signals({ width: 390, touch: true, userAgent: PHONE }))).toBe(true);
  });

  it('redirects an in-app browser even on a wide screen', () => {
    expect(prefersRedirectFlow(signals({ width: 1280, touch: false, inApp: true }))).toBe(true);
  });

  it('keeps the popup on a desktop browser', () => {
    expect(prefersRedirectFlow(signals())).toBe(false);
  });

  it('keeps the popup in an installed app, which has nowhere to redirect back to', () => {
    expect(prefersRedirectFlow(signals({ width: 390, touch: true, standalone: true }))).toBe(false);
    expect(prefersRedirectFlow(signals({ inApp: true, standalone: true }))).toBe(false);
  });
});

describe('readDeviceSignals', () => {
  it('describes the browser it is running in', () => {
    const read = readDeviceSignals();
    expect(read).not.toBeNull();
    expect(typeof read?.width).toBe('number');
    expect(typeof read?.touch).toBe('boolean');
    expect(read?.inApp).toBe(false);
  });
});

describe('canPersistSession', () => {
  it('probes storage rather than trusting a user agent', () => {
    expect(canPersistSession()).toBe(true);
  });
});

describe('errors a phone actually produces', () => {
  it('names a blocked-storage failure instead of shrugging', () => {
    expect(isStorageFailure(new DOMException('denied', 'SecurityError'))).toBe(true);
    expect(isStorageFailure(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(authErrorKey(new DOMException('denied', 'SecurityError'))).toBe(
      'auth.errors.storageBlocked',
    );
  });

  it('does not call every object a storage failure', () => {
    expect(isStorageFailure(new Error('boom'))).toBe(false);
    expect(isStorageFailure({ name: 'TypeError' })).toBe(false);
    expect(isStorageFailure(null)).toBe(false);
  });

  it('falls back to a redirect when the platform cannot open the window', () => {
    for (const code of [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/missing-iframe-start',
    ]) {
      expect(shouldFallbackToRedirect(new FirebaseError(code, 'x'))).toBe(true);
    }
    // A member who closed the window on purpose is not a blocked popup.
    expect(shouldFallbackToRedirect(new FirebaseError('auth/popup-closed-by-user', 'x'))).toBe(
      false,
    );
  });

  it('maps the mobile codes onto copy that says what to do', () => {
    expect(
      authErrorKey(new FirebaseError('auth/operation-not-supported-in-this-environment', 'x')),
    ).toBe('auth.errors.browserUnsupported');
    expect(authErrorKey(new FirebaseError('auth/web-storage-unsupported', 'x'))).toBe(
      'auth.errors.storageUnsupported',
    );
    expect(authErrorKey(new FirebaseError('auth/invalid-continue-uri', 'x'))).toBe(
      'auth.errors.unauthorizedDomain',
    );
  });
});
