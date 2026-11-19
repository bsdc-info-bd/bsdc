import { describe, expect, it } from 'vitest';
import { pushRegistrationErrorKey } from './push-registration-error';

describe('push registration errors', () => {
  it('replaces an unknown database fallback with the push recovery message', () => {
    expect(
      pushRegistrationErrorKey({
        message: 'an unclassified PostgREST failure',
        code: 'XX000',
      }),
    ).toBe('push.errors.failed');
  });

  it('preserves actionable database errors rather than hiding them', () => {
    expect(pushRegistrationErrorKey({ message: 'authentication required', code: '42501' })).toBe(
      'data.errors.signInRequired',
    );
    expect(
      pushRegistrationErrorKey({ message: 'a push endpoint is required', code: '22023' }),
    ).toBe('data.errors.invalid');
  });

  it('shows browser permission failures as permission failures', () => {
    expect(
      pushRegistrationErrorKey(
        Object.assign(new Error('permission denied'), { name: 'NotAllowedError' }),
      ),
    ).toBe('push.errors.permissionDenied');
  });
});
