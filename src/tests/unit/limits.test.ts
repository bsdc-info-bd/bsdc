/**
 * BSDC — src/tests/unit/limits.test.ts
 * Purpose : Unit coverage for the platform limit registry and validators (PART 11.03).
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { MEDIA_LIMITS, USERNAME } from '@/core/config/limits';
import {
  isBdPhone,
  isBkashTxnId,
  isEmail,
  isSafeUrl,
  isVideoFile,
  validateUsername,
} from '@/shared/lib/validators';

describe('limits and validators', () => {
  it('defines a media limit for every upload context', () => {
    expect(Object.keys(MEDIA_LIMITS).length).toBeGreaterThanOrEqual(11);
  });

  it('rejects reserved and malformed usernames', () => {
    expect(validateUsername('admin')).toBe('reserved');
    expect(validateUsername('ab')).toBe('too-short');
    expect(validateUsername('bad name')).toBe('invalid');
    expect(validateUsername('rizwan_dev')).toBeNull();
  });

  it('validates Bangladesh phone numbers', () => {
    expect(isBdPhone('01712345678')).toBe(true);
    expect(isBdPhone('+8801712345678')).toBe(true);
    expect(isBdPhone('12345')).toBe(false);
  });

  it('validates bKash transaction ids', () => {
    expect(isBkashTxnId('8F7K2M9Q')).toBe(true);
    expect(isBkashTxnId('short')).toBe(false);
  });

  it('rejects unsafe URL schemes', () => {
    expect(isSafeUrl('https://bsdc.info.bd')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('refuses video uploads, which BSDC never hosts', () => {
    expect(isVideoFile({ type: 'video/mp4', name: 'clip.mp4' })).toBe(true);
    expect(isVideoFile({ type: 'image/png', name: 'shot.png' })).toBe(false);
    expect(USERNAME.maxLength).toBeGreaterThanOrEqual(20);
  });

  it('validates e-mail addresses', () => {
    expect(isEmail('hello@bsdc.info.bd')).toBe(true);
    expect(isEmail('hello@bsdc')).toBe(false);
  });
});
