/**
 * BSDC — src/tests/unit/groupRequests.test.ts
 * Purpose : Proves join requests, group roles and the secret-group visibility rule.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The promises a group makes are the ones worth testing: a secret group stays invisible,
 *   a request can be decided once and only once, a manager cannot manufacture a peer or demote the
 *   owner, and the button a visitor sees matches the state they are actually in. The client-side
 *   checks mirror firestore.rules; where the two could disagree, the rule is the stricter one.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { newGroup, type Group, type GroupPrivacy } from '@/entities/group/model';
import {
  JOIN_REQUEST_STATES,
  countPendingRequests,
  decideJoinRequest,
  groupContentVisible,
  groupVisibleTo,
  joinAction,
  mayAssignRole,
  mayRemoveMember,
  mayReviewRequests,
  myJoinRequest,
  newJoinRequest,
  outranks,
  requiresJoinRequest,
  sortJoinRequests,
  withdrawJoinRequest,
  type GroupJoinRequest,
} from '@/entities/group/requests';

const T0 = new Date('2026-03-01T10:00:00.000Z');

function group(privacy: GroupPrivacy, overrides: Partial<Group> = {}): Group {
  return {
    ...newGroup({
      name: 'Sylhet JavaScript Meetup',
      description: 'A group for people who write JavaScript in and around Sylhet.',
      privacy,
      ownerUid: 'owner',
      now: T0,
    }),
    ...overrides,
  };
}

function request(overrides: Partial<GroupJoinRequest> = {}): GroupJoinRequest {
  return {
    ...newJoinRequest({
      groupId: 'g1',
      uid: 'applicant',
      message: 'I maintain a few Laravel packages and would like to help.',
      now: T0,
    }),
    ...overrides,
  };
}

describe('group visibility', () => {
  it('shows a public group to a signed-out visitor', () => {
    expect(groupVisibleTo(group('public'), null, false)).toBe(true);
  });

  it('shows a closed group but not its posts', () => {
    expect(groupVisibleTo(group('closed'), null, false)).toBe(true);
    expect(groupContentVisible(group('closed'), false)).toBe(false);
  });

  it('hides a secret group from somebody who is not in it', () => {
    const secret = group('secret');
    expect(groupVisibleTo(secret, 'stranger', false)).toBe(false);
    expect(groupVisibleTo(secret, null, false)).toBe(false);
  });

  it('shows a secret group to its members and its owner', () => {
    const secret = group('secret');
    expect(groupVisibleTo(secret, 'member', true)).toBe(true);
    expect(groupVisibleTo(secret, 'owner', false)).toBe(true);
  });

  it('shows a secret group to staff, because a group is not above the rules', () => {
    expect(groupVisibleTo(group('secret'), 'anyone', false, true)).toBe(true);
  });
});

describe('join requests', () => {
  it('derives the id from the group and the person, so asking twice updates one request', () => {
    expect(request().id).toBe('g1:applicant');
  });

  it('starts pending with no decision', () => {
    const pending = request();
    expect(pending.state).toBe('pending');
    expect(pending.decidedByUid).toBe('');
    expect(pending.decidedAt).toBeNull();
  });

  it('requires a request for a closed or secret group, and not for a public one', () => {
    expect(requiresJoinRequest(group('closed'))).toBe(true);
    expect(requiresJoinRequest(group('secret'))).toBe(true);
    expect(requiresJoinRequest(group('public'))).toBe(false);
  });

  it('still requires a request when a public group asks for approval', () => {
    expect(requiresJoinRequest(group('public', { requiresApproval: true }))).toBe(true);
  });

  it('records who decided and when', () => {
    const decided = decideJoinRequest(request(), 'approved', 'manager-1', '', T0);
    expect(decided?.state).toBe('approved');
    expect(decided?.decidedByUid).toBe('manager-1');
    expect(decided?.decidedAt).toBe(T0.toISOString());
  });

  it('refuses to decide a request twice', () => {
    const once = decideJoinRequest(request(), 'approved', 'manager-1');
    expect(once).not.toBeNull();
    if (once === null) return;
    expect(decideJoinRequest(once, 'declined', 'manager-2')).toBeNull();
  });

  it('lets only the applicant withdraw, and only while pending', () => {
    const pending = request();
    expect(withdrawJoinRequest(pending, 'somebody-else')).toBeNull();
    const withdrawn = withdrawJoinRequest(pending, 'applicant');
    expect(withdrawn?.state).toBe('withdrawn');
    if (withdrawn === null) return;
    expect(withdrawJoinRequest(withdrawn, 'applicant')).toBeNull();
  });

  it('counts what is still waiting and ignores what is settled', () => {
    const requests = [
      request({ id: 'a', uid: 'a' }),
      request({ id: 'b', uid: 'b', state: 'approved' }),
      request({ id: 'c', uid: 'c', state: 'withdrawn', deletedAt: '2026-03-02' }),
    ];
    expect(countPendingRequests(requests)).toBe(1);
  });

  it('puts waiting requests first for a reviewer', () => {
    const requests = [
      request({ id: 'old', uid: 'old', state: 'declined', createdAt: '2026-02-01T10:00:00.000Z' }),
      request({ id: 'new', uid: 'new', createdAt: '2026-03-01T10:00:00.000Z' }),
    ];
    expect(sortJoinRequests(requests).map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('finds the viewer own request so the button can say so', () => {
    const requests = [request({ id: 'g1:other', uid: 'other' }), request()];
    expect(myJoinRequest(requests, 'applicant')?.id).toBe('g1:applicant');
    expect(myJoinRequest(requests, 'nobody')).toBeUndefined();
  });

  it('offers the right action for every state a visitor can be in', () => {
    expect(joinAction(group('public'), true, undefined)).toBe('leave');
    expect(joinAction(group('public'), false, undefined)).toBe('join');
    expect(joinAction(group('closed'), false, undefined)).toBe('request');
    expect(joinAction(group('closed'), false, request())).toBe('pending');
    expect(joinAction(group('closed'), false, request({ state: 'declined' }))).toBe('request');
    expect(joinAction(group('public'), false, request({ state: 'withdrawn' }))).toBe('join');
  });
});

describe('group roles', () => {
  it('ranks a manager above a member', () => {
    expect(outranks('manager', 'member')).toBe(true);
    expect(outranks('member', 'manager')).toBe(false);
    expect(outranks('member', 'member')).toBe(false);
  });

  it('lets the owner and managers review requests, and nobody else', () => {
    const owned = group('closed');
    expect(mayReviewRequests(owned, 'owner', null)).toBe(true);
    expect(mayReviewRequests(owned, 'manager-1', 'manager')).toBe(true);
    expect(mayReviewRequests(owned, 'plain', 'member')).toBe(false);
    expect(mayReviewRequests(owned, 'outsider', null)).toBe(false);
    expect(mayReviewRequests(owned, 'plain', 'member', true)).toBe(true);
  });

  it('does not let a manager mint another manager, which is the owner alone to grant', () => {
    expect(
      mayAssignRole(group('closed'), 'manager-1', 'manager', 'plain', 'member', 'manager'),
    ).toBe(false);
  });

  it('lets the owner make a member a manager', () => {
    expect(mayAssignRole(group('closed'), 'owner', 'manager', 'plain', 'member', 'manager')).toBe(
      true,
    );
  });

  it('refuses to let anybody change their own role', () => {
    expect(mayAssignRole(group('closed'), 'owner', 'manager', 'owner', 'manager', 'member')).toBe(
      false,
    );
  });

  it('refuses to let a manager demote the owner', () => {
    expect(
      mayAssignRole(group('closed'), 'manager-1', 'manager', 'owner', 'manager', 'member'),
    ).toBe(false);
  });

  it('lets the owner act on a manager', () => {
    expect(
      mayAssignRole(group('closed'), 'owner', 'manager', 'manager-1', 'manager', 'member'),
    ).toBe(true);
  });

  it('refuses an assignment that changes nothing', () => {
    expect(
      mayAssignRole(group('closed'), 'manager-1', 'manager', 'plain', 'member', 'member'),
    ).toBe(false);
  });

  it('lets staff act where a manager cannot', () => {
    expect(
      mayAssignRole(group('closed'), 'staff', null, 'manager-1', 'manager', 'member', true),
    ).toBe(true);
  });

  it('lets anybody leave, and a manager remove a member, but never the owner', () => {
    const owned = group('closed');
    expect(mayRemoveMember(owned, 'plain', 'member', 'plain')).toBe(true);
    expect(mayRemoveMember(owned, 'manager-1', 'manager', 'plain')).toBe(true);
    expect(mayRemoveMember(owned, 'manager-1', 'manager', 'other-manager', false)).toBe(true);
    expect(mayRemoveMember(owned, 'manager-1', 'manager', 'owner')).toBe(false);
  });

  it('exposes every state the machine allows', () => {
    expect(JOIN_REQUEST_STATES).toEqual(['pending', 'approved', 'declined', 'withdrawn']);
  });
});
