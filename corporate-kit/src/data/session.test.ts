import { describe, expect, it } from 'vitest';
import { meetsRole, signInMessage, type StaffProfile } from './session';
import { roleRank } from '../domain/staff';

/**
 * The console gate's arithmetic and its words.
 *
 * The gate is the difference between a console and a page that looks like one.
 * Its rank table has to agree with `bsdc.role_rank` in Postgres — the database
 * decides who may act, this decides what is drawn, and a disagreement shows up as
 * a console that renders controls the write then refuses.
 *
 * The messages matter as much as the ranks. The reported failure was a correct
 * password producing "This account has no profile in the community database",
 * which is true, unhelpful and unfixable by the person reading it. These tests pin
 * that every failure now says which of the four things went wrong and what to do.
 */

const profile = (role: string): StaffProfile => ({
  uid: 'uid-1',
  displayName: 'Operator',
  role,
  avatarUrl: '',
  rank: roleRank(role),
});

describe('the rank a role carries', () => {
  it('agrees with the migration that ranks it in the database', () => {
    expect(roleRank('owner')).toBe(7);
    expect(roleRank('admin')).toBe(6);
    expect(roleRank('manager')).toBe(5);
    expect(roleRank('moderator')).toBe(4);
    expect(roleRank('vendor')).toBe(3);
    expect(roleRank('creator')).toBe(2);
    expect(roleRank('member')).toBe(1);
  });

  it('ranks anything it does not recognise below a member, never above', () => {
    expect(roleRank('')).toBe(0);
    expect(roleRank('superuser')).toBe(0);
    expect(roleRank('OWNER')).toBe(0);
  });
});

describe('who may open a console', () => {
  it('lets an equal or higher rank in', () => {
    expect(meetsRole(profile('owner'), 'owner')).toBe(true);
    expect(meetsRole(profile('owner'), 'moderator')).toBe(true);
    expect(meetsRole(profile('moderator'), 'moderator')).toBe(true);
  });

  it('keeps a lower rank out', () => {
    expect(meetsRole(profile('manager'), 'admin')).toBe(false);
    expect(meetsRole(profile('member'), 'moderator')).toBe(false);
  });

  it('keeps a signed-out caller out of every console', () => {
    expect(meetsRole(null, 'member')).toBe(false);
    expect(meetsRole(null, 'moderator')).toBe(false);
  });
});

describe('what a failed sign-in says', () => {
  it('separates a wrong password from a wrong database', () => {
    const wrongPassword = signInMessage('auth/wrong-password');
    const noRow = signInMessage('no-profile');
    expect(wrongPassword).not.toBe(noRow);
    expect(wrongPassword.toLowerCase()).toContain('password');
  });

  it('names the deployment when the account is not in this project', () => {
    // `auth/user-not-found` on the corporate project is the symptom of signing in
    // against the community project, and saying so is the whole fix.
    expect(signInMessage('auth/user-not-found').toLowerCase()).toContain('account');
  });

  it('has something to say about every failure, and never says nothing', () => {
    for (const code of [
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/invalid-email',
      'auth/too-many-requests',
      'auth/network-request-failed',
      'auth/user-disabled',
      'not-staff',
      'no-profile',
      'suspended',
      '',
      'something-new',
    ]) {
      expect(signInMessage(code).length).toBeGreaterThan(10);
    }
  });

  it('does not leak which of two accounts exists', () => {
    // The wrong-password and no-such-user answers are deliberately the same
    // sentence: this screen is public, and a difference between them is a way to
    // enumerate corporate addresses.
    expect(signInMessage('auth/wrong-password')).toBe(signInMessage('auth/invalid-credential'));
  });
});
