/**
 * BSDC — tests/emulator/messages.test.ts
 * Purpose : The conversation and realtime rules, exercised rather than merely written.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A chat is the most private thing on the platform that is not a secret, so these are the
 *   rules most worth running against a real engine: a stranger cannot read a thread they are not in,
 *   a participant cannot rewrite what somebody else said, and a reaction belongs to the person who
 *   gave it. The Realtime Database half covers the ephemeral plane — presence and receipts — where a
 *   wrong rule does not leak a message so much as leak who is awake and who has read what.
 *   Requires the Firestore and Realtime Database emulators.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { get, ref, set, remove } from 'firebase/database';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { PROJECT_ID, asSuspended, asUser, seed, seedRtdb, shutdown } from './helpers';

const CONVERSATION = 'conversations/c1';
const MESSAGE = 'conversations/c1/messages/m1';
const REACTION = 'conversations/c1/messages/m1/reactions/u2';

/**
 * Builds a message document.
 * @param senderUid who wrote it
 * @returns the document
 */
function message(senderUid: string): Record<string, unknown> {
  return {
    clientId: 'client-1',
    conversationId: 'c1',
    senderUid,
    senderName: 'Test member',
    senderPhotoUrl: '',
    kind: 'text',
    body: 'Are we still meeting at six?',
    attachment: null,
    replyToId: '',
    deliveredTo: [senderUid],
    readBy: [],
    editedAt: null,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    deletedAt: null,
  };
}

beforeAll(async () => {
  await seed(CONVERSATION, {
    kind: 'direct',
    title: '',
    participantUids: ['u1', 'u2'],
    participantNames: ['One', 'Two'],
    participantPhotos: ['', ''],
    avatarUrl: '',
    lastMessagePreview: '',
    lastMessageAt: '2026-02-01T10:00:00.000Z',
    lastMessageSenderUid: 'u1',
    unread: { u1: 0, u2: 1 },
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    deletedAt: null,
  });
  await seed(MESSAGE, message('u1'));
  await seedRtdb('conversationMembers/c1/u1', true);
  await seedRtdb('conversationMembers/c1/u2', true);
});

afterAll(shutdown);

describe('a conversation', () => {
  it('is readable by a participant and by nobody else', async () => {
    const participant = await asUser('u2');
    await assertSucceeds(getDoc(doc(participant.firestore(), CONVERSATION)));

    const stranger = await asUser('u9');
    await assertFails(getDoc(doc(stranger.firestore(), CONVERSATION)));
  });

  it('cannot be created with somebody else as the only participant', async () => {
    const member = await asUser('u1');
    await assertFails(
      setDoc(doc(member.firestore(), 'conversations/c2'), {
        kind: 'direct',
        participantUids: ['u7', 'u8'],
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z',
        deletedAt: null,
      }),
    );
  });

  it('cannot be deleted, because a conversation is a record, not a draft', async () => {
    const participant = await asUser('u1');
    await assertFails(deleteDoc(doc(participant.firestore(), CONVERSATION)));
  });
});

describe('a message', () => {
  it('can be sent by a participant, and only as themselves', async () => {
    const sender = await asUser('u1');
    await assertSucceeds(
      setDoc(doc(sender.firestore(), 'conversations/c1/messages/m2'), message('u1')),
    );
    await assertFails(
      setDoc(doc(sender.firestore(), 'conversations/c1/messages/m3'), message('u2')),
    );
  });

  it('cannot be sent by somebody outside the conversation', async () => {
    const stranger = await asUser('u9');
    await assertFails(
      setDoc(doc(stranger.firestore(), 'conversations/c1/messages/m4'), message('u9')),
    );
  });

  it('lets a participant mark it delivered and read', async () => {
    const reader = await asUser('u2');
    await assertSucceeds(
      updateDoc(doc(reader.firestore(), MESSAGE), {
        deliveredTo: ['u1', 'u2'],
        readBy: ['u2'],
        updatedAt: '2026-02-01T10:05:00.000Z',
      }),
    );
  });

  it('lets the sender edit the body and unsend, and not change who wrote it', async () => {
    const sender = await asUser('u1');
    await assertSucceeds(
      updateDoc(doc(sender.firestore(), MESSAGE), {
        body: 'Are we still meeting at seven?',
        editedAt: '2026-02-01T10:01:00.000Z',
        updatedAt: '2026-02-01T10:01:00.000Z',
      }),
    );
    await assertFails(updateDoc(doc(sender.firestore(), MESSAGE), { senderUid: 'u2' }));
  });

  it('refuses an out-of-window edit by a non-participant', async () => {
    const stranger = await asUser('u9');
    await assertFails(updateDoc(doc(stranger.firestore(), MESSAGE), { body: 'Rewritten.' }));
  });

  it('refuses a hard delete while the message has not been unsent', async () => {
    const sender = await asUser('u1');
    await assertFails(deleteDoc(doc(sender.firestore(), MESSAGE)));
  });
});

describe('a reaction', () => {
  it('belongs to the person who gave it', async () => {
    const reactor = await asUser('u2');
    await assertSucceeds(
      setDoc(doc(reactor.firestore(), REACTION), {
        messageId: 'm1',
        conversationId: 'c1',
        uid: 'u2',
        type: 'like',
        createdAt: '2026-02-01T10:06:00.000Z',
        updatedAt: '2026-02-01T10:06:00.000Z',
        deletedAt: null,
      }),
    );
  });

  it('cannot be written under somebody else id', async () => {
    const reactor = await asUser('u2');
    await assertFails(
      setDoc(doc(reactor.firestore(), 'conversations/c1/messages/m1/reactions/u1'), {
        messageId: 'm1',
        conversationId: 'c1',
        uid: 'u1',
        type: 'like',
        createdAt: '2026-02-01T10:06:00.000Z',
        updatedAt: '2026-02-01T10:06:00.000Z',
        deletedAt: null,
      }),
    );
  });

  it('must be one of the reactions the platform knows', async () => {
    const reactor = await asUser('u2');
    await assertFails(
      setDoc(doc(reactor.firestore(), REACTION), {
        messageId: 'm1',
        conversationId: 'c1',
        uid: 'u2',
        type: 'shrug',
        createdAt: '2026-02-01T10:06:00.000Z',
        updatedAt: '2026-02-01T10:06:00.000Z',
        deletedAt: null,
      }),
    );
  });

  it('can be taken back by the person who gave it', async () => {
    const reactor = await asUser('u2');
    await assertSucceeds(deleteDoc(doc(reactor.firestore(), REACTION)));
  });

  it('is refused from a suspended account', async () => {
    const suspended = await asSuspended('u2');
    await assertFails(
      setDoc(doc(suspended.firestore(), REACTION), {
        messageId: 'm1',
        conversationId: 'c1',
        uid: 'u2',
        type: 'fire',
        createdAt: '2026-02-01T10:06:00.000Z',
        updatedAt: '2026-02-01T10:06:00.000Z',
        deletedAt: null,
      }),
    );
  });
});

describe('the realtime plane', () => {
  it('lets a person write their own presence and not somebody else', async () => {
    const member = await asUser('u2');
    await assertSucceeds(
      set(ref(member.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'presence/u2'), {
        state: 'online',
        lastChanged: 1,
        device: 'test',
        locale: 'bn',
      }),
    );
    await assertFails(
      set(ref(member.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'presence/u1'), {
        state: 'online',
        lastChanged: 1,
      }),
    );
  });

  it('refuses a presence write with an unknown state', async () => {
    const member = await asUser('u2');
    await assertFails(
      set(
        ref(member.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'presence/u2/state'),
        'lurking',
      ),
    );
  });

  it('lets a member of a conversation read the typing line and nobody else read it', async () => {
    const member = await asUser('u2');
    await assertSucceeds(
      get(ref(member.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'typing/c1')),
    );

    const stranger = await asUser('u9');
    await assertFails(
      get(ref(stranger.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'typing/c1')),
    );
  });

  it('refuses a client the right to move a live counter', async () => {
    const member = await asUser('u2');
    await assertFails(
      set(
        ref(member.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'liveCounters/p1/views'),
        99,
      ),
    );
  });

  it('lets the buyer put an order on the queue once and never edit it', async () => {
    const buyer = await asUser('u2');
    const queue = ref(buyer.database(`http://127.0.0.1:9000?ns=${PROJECT_ID}`), 'gigQueue/order-1');
    await assertSucceeds(
      set(queue, {
        gigId: 'gig-1',
        packageName: 'Basic',
        buyerUid: 'u2',
        requirement: 'A landing page for a small shop.',
      }),
    );
    await assertFails(
      set(queue, {
        gigId: 'gig-2',
        packageName: 'Basic',
        buyerUid: 'u2',
        requirement: 'Changed my mind about the whole thing.',
      }),
    );
    await assertSucceeds(remove(queue));
  });
});
