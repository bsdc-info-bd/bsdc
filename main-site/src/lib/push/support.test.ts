import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PUSH_BLOCK_KEYS,
  describePushEnvironment,
  describeUserAgent,
  deviceCountLabel,
  readPushEnvironment,
  runningStandalone,
  type PushEnvironment,
} from './support';

/** A base64url P-256 point is 65 bytes, which is 87 characters unpadded. */
const KEY =
  'BFy1mZ0Z8QkPj9pKq0d0mN7vX3sL5tR1wY6uI4oP2aS9dF8gH7jK0lZ3xV6bN1mQ4rT9wY2uI5oP8aS1dF4gH7jK0l';

function environment(partial: Partial<PushEnvironment>): PushEnvironment {
  return {
    secureContext: true,
    serviceWorker: true,
    pushManager: true,
    notification: true,
    vapidPublicKey: KEY,
    ios: false,
    standalone: false,
    ...partial,
  };
}

describe('what a browser can be asked for', () => {
  it('is ready when all four line up', () => {
    expect(describePushEnvironment(environment({}))).toEqual({
      block: 'ok',
      supported: true,
      blockKey: 'push.ready',
    });
  });

  it('says which of the four is missing, in the order that matters', () => {
    expect(describePushEnvironment(environment({ secureContext: false })).block).toBe('insecure');
    expect(describePushEnvironment(environment({ serviceWorker: false })).block).toBe('no-worker');
    expect(describePushEnvironment(environment({ pushManager: false })).block).toBe('no-push');
    expect(describePushEnvironment(environment({ notification: false })).block).toBe(
      'no-notification',
    );
  });

  it('reports a deployment with no key rather than failing on subscribe', () => {
    expect(describePushEnvironment(environment({ vapidPublicKey: '' })).block).toBe('unconfigured');
    // A Firebase key is a key, but not one of the shape this site signs with,
    // and neither is something a member pasted into the wrong field.
    expect(describePushEnvironment(environment({ vapidPublicKey: 'short' })).block).toBe(
      'unconfigured',
    );
  });

  it('has a sentence for every reason, including the good one', () => {
    for (const key of Object.values(PUSH_BLOCK_KEYS)) expect(key.startsWith('push.')).toBe(true);
    // Named rather than counted: a block added to `PushBlock` without a sentence is
    // the bug, and a count would only say that something moved.
    expect(Object.keys(PUSH_BLOCK_KEYS).sort()).toEqual(
      [
        'insecure',
        'ios-install',
        'no-notification',
        'no-push',
        'no-worker',
        'ok',
        'unconfigured',
      ].sort(),
    );
  });
});

describe('the count a member is shown', () => {
  it('says so when there is nothing to turn off', () => {
    expect(deviceCountLabel(0, 'en')).toBe('no devices');
    expect(deviceCountLabel(0, 'bn')).toBe('কোনো ডিভাইস নেই');
  });

  it('counts in the language it is asked in', () => {
    expect(deviceCountLabel(1, 'en')).toBe('1 device');
    expect(deviceCountLabel(3, 'en')).toBe('3 devices');
    expect(deviceCountLabel(3, 'bn')).toBe('৩টি ডিভাইস');
  });
});

describe('naming a device from what a browser says it is', () => {
  it('gets the browser and the system out of a real agent', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome · Android');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      ),
    ).toBe('Safari · macOS');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      ),
    ).toBe('Firefox · Windows');
  });

  it('says Edge before it says Chrome, because Edge says both', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      ),
    ).toBe('Edge · Windows');
  });

  it('admits when it cannot tell', () => {
    expect(describeUserAgent('')).toBe('');
    expect(describeUserAgent('some-crawler/1.0')).toBe('');
  });
});

describe('iOS, which can do push but only from the home screen', () => {
  it('asks for the install instead of offering a switch that would lie', () => {
    // iOS 16.4+ delivers a web push to an installed web app and never to the tab,
    // with no error anywhere: the permission asks fine, the subscription is created
    // fine, and nothing arrives. The one honest answer is the install.
    expect(describePushEnvironment(environment({ ios: true, standalone: false }))).toEqual({
      block: 'ios-install',
      supported: false,
      blockKey: 'push.blocked.iosInstall',
    });
  });

  it('is ready once it is installed, and on every other platform regardless', () => {
    expect(describePushEnvironment(environment({ ios: true, standalone: true })).block).toBe('ok');
    expect(describePushEnvironment(environment({ ios: false, standalone: false })).block).toBe(
      'ok',
    );
  });

  it('comes after the four things a browser may simply not have', () => {
    expect(describePushEnvironment(environment({ ios: true, secureContext: false })).block).toBe(
      'insecure',
    );
    expect(describePushEnvironment(environment({ ios: true, vapidPublicKey: '' })).block).toBe(
      'unconfigured',
    );
  });

  it('reads the platform out of the browser it is running in', () => {
    const install = (userAgent: string, maxTouchPoints = 0, standalone?: boolean) => {
      vi.stubGlobal('navigator', {
        userAgent,
        maxTouchPoints,
        standalone,
        serviceWorker: { register: () => Promise.resolve({}), ready: {} },
      });
      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('Notification', function Notification() {});
      vi.stubGlobal('matchMedia', () => ({ matches: standalone === true }));
      return readPushEnvironment(KEY);
    };

    expect(install('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').ios).toBe(true);
    // An iPad with a desktop user agent is still an iPad, and still needs the install.
    expect(install('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5).ios).toBe(true);
    expect(install('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0).ios).toBe(false);
    expect(install('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/Chrome').ios).toBe(false);
    expect(
      install('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5, true).standalone,
    ).toBe(true);
    expect(install('Mozilla/5.0 (Linux; Android 14)').standalone).toBe(false);

    vi.unstubAllGlobals();
  });

  it('takes either signal for the installed app, because Safari disagrees about the standard one', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(runningStandalone()).toBe(true);

    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('navigator', { standalone: true });
    expect(runningStandalone()).toBe(true);

    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('navigator', {});
    expect(runningStandalone()).toBe(false);

    vi.stubGlobal('matchMedia', () => {
      throw new TypeError('matchMedia is not a function');
    });
    expect(runningStandalone()).toBe(false);
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
