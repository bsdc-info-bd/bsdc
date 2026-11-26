import { beforeEach, describe, expect, it } from 'vitest';
import {
  OfflineError,
  breakerFor,
  isRefusal,
  resetBreakers,
  unknownOutcomeMessage,
} from './mutations';
import { DataError } from './rpc';
import { RefusedError } from './resilience';

describe('isRefusal', () => {
  it('recognises the server saying no', () => {
    expect(isRefusal(new RefusedError('No.'))).toBe(true);
    expect(isRefusal(new DataError('Needs a permission', '42501', ''))).toBe(true);
    expect(isRefusal(new DataError('Already taken', '23505', ''))).toBe(true);
  });

  it('recognises a dropped connection as something else entirely', () => {
    // The distinction the breaker depends on: this one proves nothing about the
    // connection's health, so it must not be counted either way by isRefusal.
    expect(isRefusal(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('does not treat an unknown error as a refusal', () => {
    expect(isRefusal(new Error('something'))).toBe(false);
    expect(isRefusal(null)).toBe(false);
  });
});

describe('breakerFor', () => {
  beforeEach(() => resetBreakers());

  it('returns the same breaker for the same scope', () => {
    // One breaker per console: a shared one would let a broken panel take down
    // a working one.
    expect(breakerFor('bsdc-mod')).toBe(breakerFor('bsdc-mod'));
    expect(breakerFor('bsdc-mod')).not.toBe(breakerFor('bsdc-admin'));
  });

  it('starts closed', () => {
    expect(breakerFor('bsdc-cert').snapshot().state).toBe('closed');
  });

  it('forgets everything when the page does', () => {
    const first = breakerFor('bsdc-mod');
    resetBreakers();
    expect(breakerFor('bsdc-mod')).not.toBe(first);
  });
});

describe('OfflineError', () => {
  it('carries the seconds until a retry is worth trying', () => {
    const error = new OfflineError('down', 12_000);
    expect(error.retryAfterMs).toBe(12_000);
    expect(error.name).toBe('OfflineError');
  });
});

describe('unknownOutcomeMessage', () => {
  it('tells the operator to look before repeating, not to retry', () => {
    // "Failed" for a write that may have succeeded causes duplicates.
    const message = unknownOutcomeMessage('Suspending this member');
    expect(message).toContain('may not have been saved');
    expect(message).toContain('before repeating it');
  });
});
