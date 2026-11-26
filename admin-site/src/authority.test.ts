import { describe, expect, it } from 'vitest';
import {
  EXPIRING_SOON_DAYS,
  authorityTone,
  canGrantFrom,
  countAuthority,
  countryNote,
  daysUntil,
  describeRoute,
  emptyTimelineNote,
  endAction,
  expiryNote,
  flagSummary,
  idleNote,
  orderAuthority,
  orderSessions,
  routeLabel,
  type AuthorityRow,
  type StaffSessionRow,
} from './authority';

function row(over: Partial<AuthorityRow> = {}): AuthorityRow {
  return {
    permission: 'people.read',
    label: 'Read people',
    subject_kind: 'platform',
    is_destructive: false,
    effective: true,
    via: 'role',
    deny_scope: null,
    deny_reason: null,
    grant_scope: null,
    grant_expires_at: null,
    grant_reason: null,
    grant_by: null,
    role_rank: 50,
    grant_rank: 40,
    ...over,
  };
}

function session(over: Partial<StaffSessionRow> = {}): StaffSessionRow {
  return {
    id: 's1',
    uid: 'u1',
    display_name: 'Somebody',
    role_now: 'manager',
    role_at_start: 'manager',
    device_label: 'Firefox',
    country: 'BD',
    started_at: '2026-05-01T09:00:00Z',
    last_seen_at: '2026-05-01T12:00:00Z',
    idle_minutes: 2,
    is_flagged: false,
    flag_reason: null,
    ...over,
  };
}

describe('describeRoute', () => {
  it('distinguishes a role baseline from a personal grant', () => {
    // The distinction a person needs: the first changes with the role, the second
    // has a name and a date attached.
    expect(describeRoute('role')).toContain('role');
    expect(describeRoute('grant')).toContain('specifically');
    expect(describeRoute('role')).not.toBe(describeRoute('grant'));
  });

  it('distinguishes a denial from never having been granted', () => {
    expect(describeRoute('denied')).toContain('withheld');
    expect(describeRoute('none')).toContain('Not held');
  });

  it('says the owner wildcard covers uncatalogued permissions', () => {
    expect(describeRoute('owner')).toContain('catalogued');
  });
});

describe('authorityTone', () => {
  it('leads with a denial', () => {
    expect(authorityTone(row({ via: 'denied', effective: false }))).toBe('bad');
  });

  it('treats a held destructive permission as worth watching', () => {
    expect(authorityTone(row({ is_destructive: true, effective: true }))).toBe('warn');
  });

  it('is neutral for something not held', () => {
    expect(authorityTone(row({ via: 'none', effective: false }))).toBe('neutral');
  });
});

describe('daysUntil and expiryNote', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('counts whole days ahead', () => {
    expect(daysUntil('2026-05-08T12:00:00Z', now)).toBe(7);
  });

  it('returns null when there is no expiry', () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(expiryNote(row())).toBe('');
  });

  it('says "expired" for a past date rather than a negative count', () => {
    expect(expiryNote(row({ grant_expires_at: '2026-04-01T00:00:00Z' }), now)).toBe('expired');
  });

  it('states a sub-day expiry in hours, because "tomorrow" would understate it', () => {
    // Eight hours left must not read as a whole day of slack.
    expect(expiryNote(row({ grant_expires_at: '2026-05-01T20:00:00Z' }), now)).toBe(
      'expires in 8h',
    );
    expect(expiryNote(row({ grant_expires_at: '2026-05-01T12:30:00Z' }), now)).toBe(
      'expires within the hour',
    );
  });

  it('says tomorrow only when a whole day remains', () => {
    expect(expiryNote(row({ grant_expires_at: '2026-05-02T18:00:00Z' }), now)).toBe(
      'expires tomorrow',
    );
  });

  it('counts whole days beyond that', () => {
    expect(expiryNote(row({ grant_expires_at: '2026-05-20T12:00:00Z' }), now)).toBe(
      'expires in 19 days',
    );
    // 7 days minus a second is not 7 days, and must not round up to it.
    expect(expiryNote(row({ grant_expires_at: '2026-05-08T11:59:00Z' }), now)).toBe(
      'expires in 6 days',
    );
  });

  it('has a named threshold the UI can use', () => {
    expect(EXPIRING_SOON_DAYS).toBe(7);
  });
});

describe('orderAuthority', () => {
  it('puts denials first, then destructive, then held, then the rest', () => {
    const rows = [
      row({ permission: 'z.none', via: 'none', effective: false }),
      row({ permission: 'b.held' }),
      row({ permission: 'c.destructive', is_destructive: true }),
      row({ permission: 'a.denied', via: 'denied', effective: false }),
    ];
    expect(orderAuthority(rows).map((r) => r.permission)).toEqual([
      'a.denied',
      'c.destructive',
      'b.held',
      'z.none',
    ]);
  });

  it('does not reorder within a group as unrelated state changes', () => {
    const a = orderAuthority([row({ permission: 'b' }), row({ permission: 'a' })]);
    const b = orderAuthority([row({ permission: 'a' }), row({ permission: 'b' })]);
    expect(a.map((r) => r.permission)).toEqual(b.map((r) => r.permission));
  });
});

describe('countAuthority', () => {
  it('counts the four numbers the header shows, and they agree with the rows', () => {
    const rows = [
      row({ via: 'role', effective: true }),
      row({ via: 'grant', effective: true }),
      row({ via: 'denied', effective: false }),
      row({ via: 'none', effective: false }),
      row({ via: 'role', effective: true, is_destructive: true }),
    ];
    expect(countAuthority(rows)).toEqual({ effective: 3, granted: 1, denied: 1, destructive: 1 });
  });
});

describe('canGrantFrom', () => {
  it('refuses when the actor does not hold the permission at all', () => {
    expect(
      canGrantFrom(
        { role_rank: 50, via: 'none', effective: false, grant_rank: 40 },
        { is_destructive: false, grant_rank: 40 },
      ),
    ).toBe(false);
  });

  it('refuses a permission ranked above the actor', () => {
    expect(
      canGrantFrom(
        { role_rank: 50, via: 'role', effective: true, grant_rank: 40 },
        { is_destructive: false, grant_rank: 60 },
      ),
    ).toBe(false);
  });

  it('allows a permission at or below the actor', () => {
    expect(
      canGrantFrom(
        { role_rank: 50, via: 'role', effective: true, grant_rank: 40 },
        { is_destructive: false, grant_rank: 40 },
      ),
    ).toBe(true);
  });

  it('lets only the owner hand out a destructive permission', () => {
    expect(
      canGrantFrom(
        { role_rank: 60, via: 'role', effective: true, grant_rank: 60 },
        { is_destructive: true, grant_rank: 40 },
      ),
    ).toBe(false);
    expect(
      canGrantFrom(
        { role_rank: 70, via: 'owner', effective: true, grant_rank: 70 },
        { is_destructive: true, grant_rank: 40 },
      ),
    ).toBe(true);
  });
});

describe('orderSessions and idleNote', () => {
  it('puts flagged sessions above everything, then the idlest first', () => {
    const rows = [
      session({ id: 'a', idle_minutes: 1 }),
      session({ id: 'b', idle_minutes: 300 }),
      session({ id: 'c', idle_minutes: 5, is_flagged: true }),
    ];
    expect(orderSessions(rows).map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('states idleness in the unit a person thinks in', () => {
    expect(idleNote(0)).toBe('active now');
    expect(idleNote(25)).toBe('idle 25m');
    expect(idleNote(150)).toBe('idle 2h');
    expect(idleNote(3000)).toBe('idle 2d');
  });
});

describe('countryNote', () => {
  it('says the country rather than inventing a location', () => {
    expect(countryNote(session({ country: 'bd' }))).toBe('BD');
  });

  it('says it does not know when it does not know', () => {
    expect(countryNote(session({ country: null }))).toBe('origin unknown');
  });
});

describe('flagSummary', () => {
  it('says nothing about an unflagged session', () => {
    expect(flagSummary(session())).toBe('');
  });

  it('adds the consequence when the role changed since sign-in', () => {
    const summary = flagSummary(
      session({
        is_flagged: true,
        flag_reason: 'role changed since sign-in',
        role_at_start: 'manager',
        role_now: 'moderator',
      }),
    );
    expect(summary).toContain('role changed since sign-in');
    expect(summary).toContain('stale controls');
  });

  it('does not add that consequence to a travel flag', () => {
    const summary = flagSummary(
      session({ is_flagged: true, flag_reason: 'two origins for one account within 90 minutes' }),
    );
    expect(summary).not.toContain('stale controls');
  });

  it('has something to say even when the database gave no reason', () => {
    expect(flagSummary(session({ is_flagged: true, flag_reason: null }))).toBe(
      'flagged for review',
    );
  });
});

describe('endAction', () => {
  it('is a sign-out when it is your own session', () => {
    expect(endAction(session({ uid: 'me' }), 'me')).toBe('sign-out');
  });

  it("is a revocation when it is somebody else's", () => {
    expect(endAction(session({ uid: 'them' }), 'me')).toBe('revoke');
  });
});

describe('emptyTimelineNote', () => {
  it('says a new account is new rather than that it is suspicious', () => {
    expect(emptyTimelineNote(0)).toContain('New account');
  });

  it('says an old account with no history is itself worth a look', () => {
    expect(emptyTimelineNote(400)).toContain('worth a look');
  });

  it('has an answer when the age is unknown', () => {
    expect(emptyTimelineNote(null)).toContain('Nothing has been recorded');
  });
});

describe('routeLabel', () => {
  it('speaks both languages', () => {
    expect(routeLabel('grant', 'en')).toBe('granted');
    expect(routeLabel('grant', 'bn')).toBe('অনুদান');
    expect(routeLabel('denied', 'bn')).toBe('নিষিদ্ধ');
  });
});
