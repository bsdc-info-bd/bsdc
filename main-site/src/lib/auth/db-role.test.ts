import { describe, expect, it } from 'vitest';
import { asRole, claimsDiffer, reconcileClaims, ROLE_RANK, type DatabaseRole } from './db-role';
import { DEFAULT_CLAIMS } from '@/store/auth-store';

const member: DatabaseRole = { role: 'member', staff: false, bootstrap: false };
const ownerByBirth: DatabaseRole = { role: 'owner', staff: true, bootstrap: true };
const moderator: DatabaseRole = { role: 'moderator', staff: true, bootstrap: false };

describe('asRole', () => {
  it('accepts the seven ranks and nothing else', () => {
    expect(asRole('owner')).toBe('owner');
    expect(asRole('member')).toBe('member');
    expect(asRole('superuser')).toBeNull();
    expect(asRole('authenticated')).toBeNull();
    expect(asRole(null)).toBeNull();
    expect(asRole(7)).toBeNull();
  });

  it('never confuses the PostgREST role with an application rank', () => {
    // `role: "authenticated"` is what PostgREST consumes; it is not a rank.
    expect(asRole('authenticated')).toBeNull();
    expect(asRole('anon')).toBeNull();
  });
});

describe('reconcileClaims', () => {
  it('takes the rank from the database, not from the token', () => {
    expect(reconcileClaims(DEFAULT_CLAIMS, ownerByBirth).role).toBe('owner');
    expect(reconcileClaims({ ...DEFAULT_CLAIMS, role: 'admin' }, moderator).role).toBe('moderator');
  });

  it('makes staff follow the rank, so a promoted member sees the consoles', () => {
    expect(reconcileClaims(DEFAULT_CLAIMS, ownerByBirth).staff).toBe(true);
    expect(reconcileClaims(DEFAULT_CLAIMS, moderator).staff).toBe(true);
  });

  it('drops a staff flag the rank no longer earns', () => {
    // A token minted before a demotion still says staff: true.
    expect(reconcileClaims({ ...DEFAULT_CLAIMS, staff: true }, member).staff).toBe(false);
  });

  it('keeps a vendor flag the token carries, and adds one the rank implies', () => {
    expect(reconcileClaims({ ...DEFAULT_CLAIMS, vendor: true }, member).vendor).toBe(true);
    expect(
      reconcileClaims(DEFAULT_CLAIMS, { role: 'vendor', staff: false, bootstrap: false }).vendor,
    ).toBe(true);
    expect(reconcileClaims(DEFAULT_CLAIMS, member).vendor).toBe(false);
  });
});

describe('claimsDiffer', () => {
  it('is quiet when the token already agrees with the database', () => {
    expect(claimsDiffer(DEFAULT_CLAIMS, member)).toBe(false);
    expect(claimsDiffer({ role: 'owner', staff: true, vendor: false }, ownerByBirth)).toBe(false);
  });

  it('speaks up when any one of the three is wrong', () => {
    expect(claimsDiffer(DEFAULT_CLAIMS, ownerByBirth)).toBe(true);
    expect(claimsDiffer({ ...DEFAULT_CLAIMS, staff: true }, member)).toBe(true);
    expect(claimsDiffer(DEFAULT_CLAIMS, { role: 'vendor', staff: false, bootstrap: false })).toBe(
      true,
    );
  });
});

describe('ROLE_RANK', () => {
  it('orders the ranks the way the database does', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.manager);
    expect(ROLE_RANK.manager).toBeGreaterThan(ROLE_RANK.moderator);
    expect(ROLE_RANK.moderator).toBeGreaterThan(ROLE_RANK.vendor);
    expect(ROLE_RANK.vendor).toBeGreaterThan(ROLE_RANK.creator);
    expect(ROLE_RANK.creator).toBeGreaterThan(ROLE_RANK.member);
  });

  it('puts the staff line between moderator and vendor', () => {
    expect(ROLE_RANK.moderator).toBeGreaterThanOrEqual(ROLE_RANK.moderator);
    expect(ROLE_RANK.vendor).toBeLessThan(ROLE_RANK.moderator);
  });
});
