import { describe, expect, it } from 'vitest';
import {
  afterRoleChange,
  assignableRoles,
  canActOn,
  canChangeStatus,
  rankPeople,
  searchTerm,
  statusProblems,
  type PersonRow,
} from './people';

/**
 * Who may change whose role, pinned against the migration.
 *
 * `set_user_role()` refuses four things, and each of them is a case below. The
 * console draws a disabled control with the reason instead of letting an operator
 * discover the rule by being refused, which is the difference between a console
 * that explains itself and one that has to be learned. The database refuses
 * regardless; these tests make sure the promise on the screen matches it.
 */

const person = (overrides: Partial<PersonRow> = {}): PersonRow => ({
  uid: 'user-1',
  username: 'ada',
  display_name: 'Ada Lovelace',
  role: 'moderator',
  status: 'active',
  created_at: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

const ACTOR = 'actor-1';

describe('who may act', () => {
  it('lets a higher rank act on a lower one', () => {
    expect(canActOn('admin', ACTOR, person({ role: 'moderator' })).allowed).toBe(true);
  });

  it('refuses acting on yourself, which is how an owner locks themselves out', () => {
    const self = person({ uid: ACTOR, role: 'member' });
    const refusal = canActOn('owner', ACTOR, self);
    expect(refusal.allowed).toBe(false);
    expect(refusal.allowed === false ? refusal.reason : '').toContain('your own');
  });

  it('refuses acting on an equal rank', () => {
    expect(canActOn('admin', ACTOR, person({ role: 'admin' })).allowed).toBe(false);
  });

  it('refuses acting on somebody above you', () => {
    const refusal = canActOn('moderator', ACTOR, person({ role: 'owner' }));
    expect(refusal.allowed).toBe(false);
    expect(refusal.allowed === false ? refusal.reason : '').toContain('owner');
  });

  it('refuses a caller who holds no staff rank at all', () => {
    expect(canActOn('member', ACTOR, person({ role: 'member' })).allowed).toBe(false);
    expect(canActOn('', ACTOR, person()).allowed).toBe(false);
  });
});

describe('the roles on offer', () => {
  it('never offers the role somebody already holds', () => {
    const roles = assignableRoles('owner', ACTOR, person({ role: 'moderator' }));
    expect(roles).not.toContain('moderator');
  });

  it('never offers a role at or above the actor’s own', () => {
    const roles = assignableRoles('manager', ACTOR, person({ role: 'member' }));
    expect(roles).toEqual(['moderator', 'vendor', 'creator']);
    expect(roles).not.toContain('manager');
    expect(roles).not.toContain('admin');
    expect(roles).not.toContain('owner');
  });

  it('offers nothing at all when the actor may not act', () => {
    expect(assignableRoles('moderator', ACTOR, person({ role: 'admin' }))).toEqual([]);
    expect(assignableRoles('admin', ACTOR, person({ uid: ACTOR }))).toEqual([]);
  });
});

describe('standing', () => {
  it('needs a manager to suspend anybody', () => {
    expect(canChangeStatus('manager', ACTOR, person({ role: 'moderator' })).allowed).toBe(true);
    const refusal = canChangeStatus('moderator', ACTOR, person({ role: 'member' }));
    expect(refusal.allowed).toBe(false);
    expect(refusal.allowed === false ? refusal.reason : '').toContain('manager');
  });

  it('still refuses a suspension of somebody who outranks you', () => {
    expect(canChangeStatus('manager', ACTOR, person({ role: 'admin' })).allowed).toBe(false);
  });

  it('demands a reason for anything other than restoring an account', () => {
    expect(statusProblems('active', '')).toEqual([]);
    expect(statusProblems('suspended', '')).toHaveLength(1);
    expect(statusProblems('suspended', 'spam')).toHaveLength(1);
    expect(statusProblems('suspended', 'Repeated spam in the jobs board.')).toEqual([]);
    expect(statusProblems('deactivated', 'asked us to close it')).toEqual([]);
  });
});

describe('what the operator is told afterwards', () => {
  it('says the token has not changed yet, because that is the surprise', () => {
    const message = afterRoleChange(person({ role: 'moderator' }), 'manager');
    expect(message).toContain('manager');
    expect(message).toContain('moderator');
    expect(message).toContain('sign in again');
  });
});

describe('finding a person', () => {
  const rows = [
    person({
      uid: '1',
      username: 'adam',
      display_name: 'Adam Smith',
      created_at: '2026-10-02T00:00:00Z',
    }),
    person({
      uid: '2',
      username: 'ada',
      display_name: 'Ada Lovelace',
      created_at: '2026-10-01T00:00:00Z',
    }),
    person({
      uid: '3',
      username: null,
      display_name: 'Grace Hopper',
      created_at: '2026-10-03T00:00:00Z',
    }),
    person({
      uid: '4',
      username: 'nadia',
      display_name: 'Nadia Rahman',
      created_at: '2026-10-04T00:00:00Z',
    }),
  ];

  it('puts an exact handle first, not the newest account', () => {
    // `admin_people` does the filtering in SQL; this decides the order of what
    // came back, and an exact handle has to beat a prefix on a longer one.
    const ranked = rankPeople(rows, 'ada');
    expect(ranked[0]?.uid).toBe('2');
    expect(ranked[1]?.uid).toBe('1');
  });

  it('accepts a leading @, which is how a handle is written everywhere else', () => {
    expect(rankPeople(rows, '@ada')[0]?.uid).toBe('2');
  });

  it('matches a display name when there is no handle', () => {
    expect(rankPeople(rows, 'grace')[0]?.uid).toBe('3');
  });

  it('leaves the list alone when nothing was typed', () => {
    expect(rankPeople(rows, '')['0']?.uid).toBe('1');
    expect(rankPeople(rows, '')).toHaveLength(4);
  });

  it('does not mutate the rows it was given', () => {
    const before = rows.map((row) => row.uid);
    rankPeople(rows, 'a');
    expect(rows.map((row) => row.uid)).toEqual(before);
  });

  it('bounds what can be typed into a search', () => {
    expect(searchTerm('   ada   ')).toBe('ada');
    expect(searchTerm('x'.repeat(200))).toHaveLength(60);
  });
});
