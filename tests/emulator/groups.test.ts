/**
 * BSDC — tests/emulator/groups.test.ts
 * Purpose : The group rules, exercised rather than merely written.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These are the promises a closed group and a secret group make to the people in them, so
 *   they are asserted here against a real rule engine. The static gate can prove a rule exists; it
 *   cannot prove that a secret group is still invisible to somebody who is not in it, or that a
 *   person cannot walk in as a manager.
 *   Requires a Firestore emulator. See tests/emulator/helpers.ts for how to run it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { asAdmin, asRoot, asSuspended, asUser, seed, shutdown } from './helpers';

const GROUP = 'groups/g1';
const MEMBER = 'groups/g1/members/u2';
const REQUEST = 'groups/g1/joinRequests/u3';

/**
 * Builds a membership document.
 * @param uid the account id
 * @param role the role being claimed
 * @returns the document
 */
function membership(uid: string, role: string): Record<string, unknown> {
  return {
    uid,
    role,
    joinedAt: '2026-02-01T00:00:00.000Z',
    notifications: true,
    updatedAt: '2026-02-01T00:00:00.000Z',
    deletedAt: null,
  };
}

/**
 * Builds a join request document.
 * @param uid the applicant
 * @param state the state being claimed
 * @param decidedBy who decided, when there is a decision
 * @returns the document
 */
function request(uid: string, state: string, decidedBy = ''): Record<string, unknown> {
  return {
    uid,
    groupId: 'g1',
    message: 'I maintain a few packages and would like to help.',
    state,
    decidedByUid: decidedBy,
    decidedAt: decidedBy === '' ? null : '2026-02-03T00:00:00.000Z',
    decisionNote: '',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-03T00:00:00.000Z',
    deletedAt: null,
  };
}

beforeAll(async () => {
  await seed(GROUP, {
    name: 'Sylhet JavaScript Meetup',
    privacy: 'secret',
    ownerUid: 'u1',
    memberCount: 2,
    requiresApproval: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  });
  await seed('groups/g1/members/u1', membership('u1', 'manager'));
  await seed(MEMBER, membership('u2', 'member'));
});

afterAll(shutdown);

describe('a secret group', () => {
  it('is invisible to somebody who is not in it', async () => {
    const stranger = await asUser('u9');
    await assertFails(getDoc(doc(stranger.firestore(), GROUP)));
  });

  it('is visible to a member', async () => {
    const member = await asUser('u2');
    await assertSucceeds(getDoc(doc(member.firestore(), GROUP)));
  });

  it('is visible to staff, because a group is not above the rules', async () => {
    const staff = await asAdmin('staff');
    await assertSucceeds(getDoc(doc(staff.firestore(), GROUP)));
  });
});

describe('joining a group', () => {
  it('lets a person join as a member', async () => {
    const joiner = await asUser('u3');
    await assertSucceeds(
      setDoc(doc(joiner.firestore(), MEMBER.replace('u2', 'u3')), membership('u3', 'member')),
    );
  });

  it('refuses a person who grants themselves the manager role on the way in', async () => {
    const joiner = await asUser('u4');
    await assertFails(
      setDoc(doc(joiner.firestore(), 'groups/g1/members/u4'), membership('u4', 'manager')),
    );
  });

  it('lets the owner create a manager row', async () => {
    const owner = await asUser('u1');
    await assertSucceeds(
      setDoc(doc(owner.firestore(), 'groups/g1/members/u5'), membership('u5', 'manager')),
    );
  });

  it('refuses a suspended account any way in at all', async () => {
    const suspended = await asSuspended('u6');
    await assertFails(
      setDoc(doc(suspended.firestore(), 'groups/g1/members/u6'), membership('u6', 'member')),
    );
  });

  it('lets a member change their own notification setting', async () => {
    const member = await asUser('u2');
    await assertSucceeds(
      updateDoc(doc(member.firestore(), MEMBER), {
        notifications: false,
        updatedAt: '2026-02-02T00:00:00.000Z',
      }),
    );
  });

  it('refuses a member the power to change their own role', async () => {
    const member = await asUser('u2');
    await assertFails(updateDoc(doc(member.firestore(), MEMBER), { role: 'manager' }));
  });
});

describe('requests to join', () => {
  it('lets a person ask, and only as pending', async () => {
    const applicant = await asUser('u7');
    await assertSucceeds(
      setDoc(doc(applicant.firestore(), 'groups/g1/joinRequests/u7'), request('u7', 'pending')),
    );
    await assertFails(
      setDoc(
        doc(applicant.firestore(), 'groups/g1/joinRequests/u8'),
        request('u8', 'approved', 'u8'),
      ),
    );
  });

  it('lets the applicant withdraw and nobody else do it for them', async () => {
    await seed(REQUEST, request('u3', 'pending'));
    const applicant = await asUser('u3');
    await assertSucceeds(updateDoc(doc(applicant.firestore(), REQUEST), { state: 'withdrawn' }));

    await seed(REQUEST, request('u3', 'pending'));
    const manager = await asUser('u1');
    await assertFails(updateDoc(doc(manager.firestore(), REQUEST), { state: 'withdrawn' }));
  });

  it('lets a manager decide, and records who decided', async () => {
    await seed(REQUEST, request('u3', 'pending'));
    const manager = await asUser('u1');
    await assertSucceeds(
      updateDoc(doc(manager.firestore(), REQUEST), {
        state: 'approved',
        decidedByUid: 'u1',
        decidedAt: '2026-02-03T00:00:00.000Z',
        decisionNote: 'Welcome.',
        updatedAt: '2026-02-03T00:00:00.000Z',
      }),
    );
  });

  it('refuses a plain member the power to decide', async () => {
    await seed(REQUEST, request('u3', 'pending'));
    const member = await asUser('u2');
    await assertFails(
      updateDoc(doc(member.firestore(), REQUEST), { state: 'approved', decidedByUid: 'u2' }),
    );
  });

  it('lets root decide where a manager could not', async () => {
    await seed(REQUEST, request('u3', 'pending'));
    const root = await asRoot('root');
    await assertSucceeds(
      updateDoc(doc(root.firestore(), REQUEST), {
        state: 'declined',
        decidedByUid: 'root',
        decisionNote: 'Not this time.',
        updatedAt: '2026-02-04T00:00:00.000Z',
      }),
    );
  });

  it('refuses to decide the same request twice', async () => {
    await seed(REQUEST, request('u3', 'approved', 'u1'));
    const manager = await asUser('u1');
    await assertFails(
      updateDoc(doc(manager.firestore(), REQUEST), { state: 'declined', decidedByUid: 'u1' }),
    );
  });
});

describe('deleting a group', () => {
  it('is not something a member can do', async () => {
    const member = await asUser('u2');
    await assertFails(deleteDoc(doc(member.firestore(), GROUP)));
  });
});
