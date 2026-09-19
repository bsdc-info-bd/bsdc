/**
 * BSDC — src/tests/unit/sessionModel.test.ts
 * Purpose : Proves the session model: sources, roles and the publishing rule.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A device session is a real profile on a real device; the difference from a remote
 *   session is provenance, not capability. These tests keep that distinction honest, including the
 *   rule that a suspended account may hold a session but may do nothing with it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  SESSION_UNKNOWN,
  SIGNED_OUT,
  canPublish,
  isActiveSession,
  newDeviceIdentity,
  sessionFromAuth,
  sessionFromDevice,
  sessionRole,
} from '@/features/auth/session';

describe('signed-out and unknown sessions', () => {
  it('carries the guest role and no identity', () => {
    expect(SIGNED_OUT.status).toBe('signed-out');
    expect(SESSION_UNKNOWN.status).toBe('unknown');
    expect(sessionRole(SIGNED_OUT)).toBe('guest');
    expect(sessionRole(SESSION_UNKNOWN)).toBe('guest');
    expect(canPublish(SIGNED_OUT)).toBe(false);
    expect(isActiveSession(SIGNED_OUT)).toBe(false);
  });
});

describe('remote sessions', () => {
  it('takes its role from the token claims', () => {
    const session = sessionFromAuth('u1', 'someone@bsdc.info.bd', 'Someone', true, {
      role: 'moderator',
      root: false,
      suspended: false,
      verifiedCreator: true,
    });
    expect(session.source).toBe('remote');
    expect(sessionRole(session)).toBe('moderator');
    expect(session.claims.verifiedCreator).toBe(true);
    expect(canPublish(session)).toBe(true);
  });

  it('blocks publishing until the email is verified', () => {
    const session = sessionFromAuth('u1', 'someone@bsdc.info.bd', 'Someone', false);
    expect(canPublish(session)).toBe(false);
    expect(isActiveSession(session)).toBe(true);
  });

  it('treats a suspended account as signed in but inert', () => {
    const session = sessionFromAuth('u1', 'someone@bsdc.info.bd', 'Someone', true, {
      role: 'member',
      suspended: true,
      root: false,
      verifiedCreator: false,
    });
    expect(isActiveSession(session)).toBe(false);
    expect(canPublish(session)).toBe(false);
  });

  it('normalises an unknown claim string to member', () => {
    const session = sessionFromAuth('u1', null, 'Someone', true, {
      role: 'wizard' as 'member',
    });
    expect(sessionRole(session)).toBe('member');
  });
});

describe('device sessions', () => {
  it('is active and may publish because the person is physically present', () => {
    const identity = newDeviceIdentity('রিজওয়ান');
    const session = sessionFromDevice(identity);
    expect(session.source).toBe('device');
    expect(session.uid).toBe(identity.uid);
    expect(isActiveSession(session)).toBe(true);
    expect(canPublish(session)).toBe(true);
    expect(sessionRole(session)).toBe('member');
  });

  it('never grants privilege beyond member', () => {
    const session = sessionFromDevice(newDeviceIdentity('Someone'));
    expect(session.claims.root).toBe(false);
    expect(session.claims.verifiedCreator).toBe(false);
  });

  it('generates a distinct identifier for every device identity', () => {
    const first = newDeviceIdentity('A');
    const second = newDeviceIdentity('B');
    expect(first.uid).not.toBe(second.uid);
    expect(newDeviceIdentity('  Padded  ', 'fixed-uid').displayName).toBe('Padded');
  });
});
