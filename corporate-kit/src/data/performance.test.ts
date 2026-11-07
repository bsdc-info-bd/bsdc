import { describe, expect, it } from 'vitest';
import { corporateVitalPayload, privacyOptOut } from './performance';

describe('anonymous corporate performance beacons', () => {
  it('contains app and metric but no account, query string or document code', () => {
    const payload = corporateVitalPayload(
      'bsdc-cert',
      { name: 'LCP', value: 1234 },
      500,
      true,
      'abc',
    );
    expect(payload).toEqual({
      p_app: 'bsdc-cert',
      p_route: '/',
      p_metric: 'LCP',
      p_value: 1234,
      p_device: 'mobile',
      p_connection: '',
      p_build: 'abc',
    });
    expect(JSON.stringify(payload)).not.toMatch(/uid|token|email|code/i);
  });
  it('drops implausible values rather than inventing measurements', () => {
    expect(corporateVitalPayload('bsdc-cert', { name: 'CLS', value: 11 }, 1000, false)).toBeNull();
    expect(
      corporateVitalPayload('bsdc-cert', { name: 'LCP', value: Number.NaN }, 1000, false),
    ).toBeNull();
  });
  it('respects browser privacy controls', () => {
    expect(privacyOptOut({ doNotTrack: '1' })).toBe(true);
    expect(privacyOptOut({ globalPrivacyControl: true })).toBe(true);
    expect(privacyOptOut({ doNotTrack: '0' })).toBe(false);
  });
});
