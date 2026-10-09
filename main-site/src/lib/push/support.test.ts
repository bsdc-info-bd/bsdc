import { describe, expect, it } from 'vitest';

import {
  PUSH_BLOCK_KEYS,
  describePushEnvironment,
  describeUserAgent,
  deviceCountLabel,
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
    expect(Object.keys(PUSH_BLOCK_KEYS)).toHaveLength(6);
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
