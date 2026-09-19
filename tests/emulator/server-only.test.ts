/**
 * BSDC — tests/emulator/server-only.test.ts
 * Purpose : The collections a client must never write, and the ones anybody may read.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Four things are asserted here because they are the load-bearing claims about privilege:
 *   an audit row is created by the server and by nobody else, a passkey record is unreadable, an
 *   issued report is readable by anybody but writable by nobody, and a person cannot hand
 *   themselves a role. Each of those is a sentence the rules make; this file makes the engine say
 *   it back.
 *   Requires a Firestore emulator.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { asAdmin, asRoot, asUser, seed, shutdown } from './helpers';

beforeAll(async () => {
  await seed('users/u1', {
    username: 'member-one',
    displayName: 'Member One',
    role: 'member',
    suspended: false,
    points: 40,
    weeklyPoints: 5,
    monthlyPoints: 12,
    leaderboardOptOut: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  });
  await seed('reportDocuments/BSDC-MOD-20260301-3456789A', {
    reportId: 'BSDC-MOD-20260301-3456789A',
    kind: 'moderation',
    title: 'Moderation summary',
    integrity: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    generatedAt: '2026-03-01T12:00:00.000Z',
    generatedByUid: 'staff-1',
    rowCount: 12,
    verificationUrl: 'https://www.bsdc.info.bd/verify/BSDC-MOD-20260301-3456789A',
  });
  await seed('auditLogs/log-1', {
    action: 'role.assign',
    actorUid: 'root',
    actorRole: 'root',
    targetUid: 'u1',
    targetType: '',
    targetId: '',
    before: 'member',
    after: 'moderator',
    reason: 'Took on the moderation roster.',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
});

afterAll(shutdown);

describe('the audit trail', () => {
  it('is readable by an administrator', async () => {
    const admin = await asAdmin('admin');
    await assertSucceeds(getDoc(doc(admin.firestore(), 'auditLogs/log-1')));
  });

  it('is not readable by a member', async () => {
    const member = await asUser('u1');
    await assertFails(getDoc(doc(member.firestore(), 'auditLogs/log-1')));
  });

  it('cannot be written by anybody, including root', async () => {
    const root = await asRoot('root');
    await assertFails(
      setDoc(doc(root.firestore(), 'auditLogs/log-2'), {
        action: 'role.assign',
        actorUid: 'root',
        actorRole: 'root',
        targetUid: 'u1',
        targetType: '',
        targetId: '',
        before: 'member',
        after: 'admin',
        reason: 'Because I said so.',
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
    );
  });

  it('cannot be edited or removed once written', async () => {
    const admin = await asAdmin('admin');
    await assertFails(
      updateDoc(doc(admin.firestore(), 'auditLogs/log-1'), { reason: 'A better reason.' }),
    );
    await assertFails(deleteDoc(doc(admin.firestore(), 'auditLogs/log-1')));
  });
});

describe('issued reports', () => {
  it('can be checked by anybody at all, with no session and no standing', async () => {
    const anybody = await asUser('u9');
    await assertSucceeds(
      getDoc(doc(anybody.firestore(), 'reportDocuments/BSDC-MOD-20260301-3456789A')),
    );
  });

  it('cannot be written by a client, which is what makes the record worth checking against', async () => {
    const root = await asRoot('root');
    await assertFails(
      setDoc(doc(root.firestore(), 'reportDocuments/BSDC-FAKE-20260301-3456789A'), {
        reportId: 'BSDC-FAKE-20260301-3456789A',
        kind: 'moderation',
        title: 'Something I made up',
        integrity: '0'.repeat(64),
        generatedAt: '2026-03-01T12:00:00.000Z',
        generatedByUid: 'root',
        rowCount: 1,
        verificationUrl: 'https://www.bsdc.info.bd/verify/BSDC-FAKE-20260301-3456789A',
      }),
    );
  });
});

describe('roles and claims', () => {
  it('cannot be granted by the person receiving them', async () => {
    const member = await asUser('u1');
    await assertFails(
      updateDoc(doc(member.firestore(), 'users/u1'), { role: 'admin', updatedAt: '2026-02-01' }),
    );
  });

  it('cannot be granted by another member', async () => {
    const other = await asUser('u2');
    await assertFails(
      updateDoc(doc(other.firestore(), 'users/u1'), { role: 'moderator', updatedAt: '2026-02-01' }),
    );
  });

  it('lets a person edit their own presentation and not their standing', async () => {
    const member = await asUser('u1');
    await assertSucceeds(
      updateDoc(doc(member.firestore(), 'users/u1'), {
        displayName: 'Member One of Sylhet',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await assertFails(
      updateDoc(doc(member.firestore(), 'users/u1'), { suspended: false, role: 'admin' }),
    );
  });
});

describe('passkeys and rate limits', () => {
  it('are unreadable, because a hash is the only copy of a passkey that should exist', async () => {
    const root = await asRoot('root');
    await assertFails(getDoc(doc(root.firestore(), 'passkeys/plugin')));
    await assertFails(getDoc(doc(root.firestore(), 'rateLimits/anything')));
  });
});
