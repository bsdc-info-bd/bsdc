/**
 * BSDC — src/tests/unit/permissions.test.ts
 * Purpose : Proves the entitlement matrix behaves as documented (PART 05.02, LAW-03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The matrix is the single place privilege is decided client-side. If it drifts, a button
 *           appears for someone the server will refuse, which is both a UX bug and a trust bug.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_MIN_ROLE,
  ROLES,
  ROLE_LABELS,
  ROLE_RANK,
  can,
  canAll,
  canAny,
  isAdmin,
  isModerator,
  isStaff,
  rankOf,
  roleFromClaim,
} from '@/core/config/permissions';

describe('role ladder', () => {
  it('orders every role from guest to root without gaps', () => {
    expect(ROLES[0]).toBe('guest');
    expect(ROLES[ROLES.length - 1]).toBe('root');
    ROLES.forEach((role, index) => {
      expect(ROLE_RANK[role]).toBe(index);
    });
  });

  it('labels every role in both languages', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role].bn.length).toBeGreaterThan(0);
      expect(ROLE_LABELS[role].en.length).toBeGreaterThan(0);
    }
  });

  it('falls back to member for an unknown claim string', () => {
    expect(roleFromClaim('wizard')).toBe('member');
    expect(roleFromClaim(undefined)).toBe('member');
    expect(roleFromClaim('admin')).toBe('admin');
  });
});

describe('permission matrix', () => {
  it('declares a minimum role for every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_MIN_ROLE[permission]).toBeDefined();
      expect(ROLES).toContain(PERMISSION_MIN_ROLE[permission]);
    }
  });

  it('lets a higher role do everything a lower role may do', () => {
    for (const permission of PERMISSIONS) {
      const threshold = rankOf(PERMISSION_MIN_ROLE[permission]);
      for (const role of ROLES) {
        expect(can(role, permission)).toBe(rankOf(role) >= threshold);
      }
    }
  });

  it('keeps the platform-critical permissions out of member hands', () => {
    expect(can('member', 'role.assign')).toBe(false);
    expect(can('admin', 'role.assign')).toBe(false);
    expect(can('root', 'role.assign')).toBe(true);
    expect(can('member', 'platform.rotateKeys')).toBe(false);
    expect(can('root', 'platform.rotateKeys')).toBe(true);
    expect(can('member', 'content.purge')).toBe(false);
    expect(can('admin', 'content.purge')).toBe(true);
  });

  it('lets a guest read the feed but never write to it', () => {
    expect(can('guest', 'feed.read')).toBe(true);
    expect(can('guest', 'feed.create')).toBe(false);
    expect(can('guest', 'comment.create')).toBe(false);
    expect(can('guest', 'message.send')).toBe(false);
  });

  it('separates moderation from administration', () => {
    expect(can('moderator', 'moderation.act')).toBe(true);
    expect(can('moderator', 'user.suspend')).toBe(true);
    expect(can('moderator', 'audit.read')).toBe(false);
    expect(can('admin', 'audit.read')).toBe(true);
  });

  it('combines checks with every and any', () => {
    expect(canAll('moderator', ['moderation.act', 'user.suspend'])).toBe(true);
    expect(canAll('moderator', ['moderation.act', 'audit.read'])).toBe(false);
    expect(canAny('member', ['audit.read', 'feed.create'])).toBe(true);
    expect(canAny('guest', ['audit.read', 'feed.create'])).toBe(false);
  });
});

describe('role predicates', () => {
  it('classifies staff, moderators and administrators', () => {
    expect(isStaff('support')).toBe(true);
    expect(isStaff('member')).toBe(false);
    expect(isModerator('support')).toBe(false);
    expect(isModerator('moderator')).toBe(true);
    expect(isAdmin('moderator')).toBe(false);
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('root')).toBe(true);
  });
});
