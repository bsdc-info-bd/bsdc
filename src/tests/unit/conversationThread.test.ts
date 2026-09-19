/**
 * BSDC — src/tests/unit/conversationThread.test.ts
 * Purpose : Proves message reactions, edit windows, delivery state and reply threading.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A chat is where a community's private disagreements live, so the rules that decide what
 *   a message means are tested as rules: a reaction belongs to one person and can be taken back,
 *   an edit closes after two minutes and not a second later, a read implies a delivery, and a
 *   reply that points at a message that has been unsent still renders the thread rather than a
 *   hole in it. Fixtures are built here at runtime; nothing in this file is committed data.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { VOICE_NOTE_MAX_BYTES, VOICE_NOTE_MAX_SECONDS } from '@/core/config/limits';
import type { ChatAttachment, ChatMessage } from '@/entities/conversation/model';
import { newMessage } from '@/entities/conversation/model';
import {
  EDIT_WINDOW_SECONDS,
  cleanReactions,
  deliveryState,
  editMessage,
  foldReactions,
  groupThreads,
  isEditableAt,
  kindCarriesAttachment,
  kindCarriesBody,
  markRead,
  myReaction,
  newReaction,
  summariseReactions,
  toThreadMessage,
  toggleReaction,
  totalReactions,
  validateAttachment,
} from '@/entities/conversation/thread';

const T0 = new Date('2026-03-01T10:00:00.000Z');

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    ...newMessage({
      conversationId: 'c1',
      senderUid: 'u1',
      body: 'Assalamu alaikum, are we still meeting at six?',
      now: T0,
    }),
    ...overrides,
  };
}

function attachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    url: 'https://res.cloudinary.com/demo/image/upload/bsdc/chat/photo.jpg',
    provider: 'imgbb',
    remoteId: 'chat-photo-1',
    width: 1200,
    height: 800,
    bytes: 240_000,
    alt: 'A whiteboard with the release plan on it',
    blurPreview: 'data:image/svg+xml;base64,PHN2Zy8+',
    durationSeconds: 0,
    ...overrides,
  };
}

describe('message reactions', () => {
  it('adds a reaction and finds it again', () => {
    const reactions = toggleReaction({}, 'u2', 'like');
    expect(myReaction(reactions, 'u2')).toBe('like');
    expect(totalReactions(reactions)).toBe(1);
  });

  it('holds one reaction per person, so choosing again replaces the first', () => {
    const first = toggleReaction({}, 'u2', 'like');
    const second = toggleReaction(first, 'u2', 'love');
    expect(myReaction(second, 'u2')).toBe('love');
    expect(totalReactions(second)).toBe(1);
  });

  it('removes the reaction when the same one is chosen twice', () => {
    const first = toggleReaction({}, 'u2', 'fire');
    const second = toggleReaction(first, 'u2', 'fire');
    expect(myReaction(second, 'u2')).toBeNull();
    expect(totalReactions(second)).toBe(0);
  });

  it('keeps two people reacting to the same message apart', () => {
    const both = toggleReaction(toggleReaction({}, 'u2', 'clap'), 'u3', 'clap');
    expect(totalReactions(both)).toBe(2);
    const removed = toggleReaction(both, 'u2', 'clap');
    expect(totalReactions(removed)).toBe(1);
    expect(myReaction(removed, 'u3')).toBe('clap');
  });

  it('drops the key entirely when the last holder removes theirs', () => {
    const removed = toggleReaction(toggleReaction({}, 'u2', 'wow'), 'u2', 'wow');
    expect(Object.keys(removed)).toHaveLength(0);
  });

  it('orders the summary by count, and by the canonical order when counts tie', () => {
    const reactions = toggleReaction(
      toggleReaction(toggleReaction({}, 'u2', 'mindblown'), 'u3', 'like'),
      'u4',
      'love',
    );
    expect(summariseReactions(reactions).map((entry) => entry.type)).toEqual([
      'like',
      'love',
      'mindblown',
    ]);
  });

  it('discards unknown reaction ids and duplicate uids that arrived from the network', () => {
    const cleaned = cleanReactions({
      like: ['u2', 'u2', 7],
      notAReaction: ['u3'],
      love: [],
    });
    expect(cleaned).toEqual({ like: ['u2'] });
  });
});

describe('reaction records', () => {
  it('derives the record id from the message and the account', () => {
    const record = newReaction('m1', 'c1', 'u2', 'fire', T0);
    expect(record.id).toBe('m1:u2');
  });

  it('folds records into one map per message and skips withdrawn ones', () => {
    const kept = newReaction('m1', 'c1', 'u2', 'fire', T0);
    const dropped = { ...newReaction('m1', 'c1', 'u3', 'sad', T0), deletedAt: '2026-03-02' };
    const other = newReaction('m2', 'c1', 'u3', 'clap', T0);
    const folded = foldReactions([kept, dropped, other]);
    expect(myReaction(folded.get('m1') ?? {}, 'u2')).toBe('fire');
    expect(myReaction(folded.get('m1') ?? {}, 'u3')).toBeNull();
    expect(myReaction(folded.get('m2') ?? {}, 'u3')).toBe('clap');
  });

  it('resolves the viewer reaction through the thread view model', () => {
    const root = message();
    const folded = foldReactions([newReaction(root.id, 'c1', 'u2', 'care')]);
    const view = toThreadMessage(root, new Map([[root.id, root]]), folded, 'u2', T0);
    expect(view.mine).toBe('care');
    expect(view.reactionCount).toBe(1);
  });
});

describe('attachments', () => {
  it('accepts an image inside the chat ceiling', () => {
    const verdict = validateAttachment(attachment());
    expect(verdict).toMatchObject({ ok: true, kind: 'image' });
  });

  it('refuses an image with no alt text, because a chat photo nobody can describe is not usable', () => {
    expect(validateAttachment(attachment({ alt: '   ' }))).toEqual({
      ok: false,
      code: 'BSDC-CHAT-002',
    });
  });

  it('refuses an empty url', () => {
    expect(validateAttachment(attachment({ url: '' }))).toEqual({
      ok: false,
      code: 'BSDC-CHAT-001',
    });
  });

  it('refuses a zero-byte file', () => {
    expect(validateAttachment(attachment({ bytes: 0 }))).toEqual({
      ok: false,
      code: 'BSDC-CHAT-003',
    });
  });

  it('refuses an oversized image', () => {
    expect(validateAttachment(attachment({ bytes: 9 * 1024 * 1024 }))).toEqual({
      ok: false,
      code: 'BSDC-CHAT-005',
    });
  });

  it('accepts a voice note inside both ceilings', () => {
    const verdict = validateAttachment(
      attachment({ durationSeconds: 12, bytes: 90_000, width: 0, height: 0 }),
    );
    expect(verdict).toMatchObject({ ok: true, kind: 'voice' });
  });

  it('refuses a voice note longer than twenty seconds', () => {
    expect(
      validateAttachment(
        attachment({
          durationSeconds: VOICE_NOTE_MAX_SECONDS + 1,
          bytes: 1_000,
          width: 0,
          height: 0,
        }),
      ),
    ).toEqual({ ok: false, code: 'BSDC-CHAT-004' });
  });

  it('refuses a voice note larger than the byte ceiling', () => {
    expect(
      validateAttachment(
        attachment({ durationSeconds: 3, bytes: VOICE_NOTE_MAX_BYTES + 1, width: 0, height: 0 }),
      ),
    ).toEqual({ ok: false, code: 'BSDC-CHAT-005' });
  });

  it('treats a file with no dimensions as a document', () => {
    expect(validateAttachment(attachment({ width: 0, height: 0, bytes: 450_000 }))).toMatchObject({
      ok: true,
      kind: 'document',
    });
  });

  it('matches the kind to what it may carry', () => {
    expect(kindCarriesBody('text')).toBe(true);
    expect(kindCarriesBody('system')).toBe(false);
    expect(kindCarriesAttachment('voice')).toBe(true);
    expect(kindCarriesAttachment('text')).toBe(false);
  });
});

describe('editing', () => {
  it('allows an edit inside the window', () => {
    const sent = message({ createdAt: T0.toISOString() });
    const edited = editMessage(
      sent,
      'Are we still meeting at seven?',
      new Date(T0.getTime() + 30_000),
    );
    expect(edited?.body).toBe('Are we still meeting at seven?');
    expect(edited?.editedAt).not.toBeNull();
  });

  it('refuses an edit one second after the window closes', () => {
    const sent = message({ createdAt: T0.toISOString() });
    const tooLate = new Date(T0.getTime() + (EDIT_WINDOW_SECONDS + 1) * 1000);
    expect(isEditableAt(sent, tooLate)).toBe(false);
    expect(editMessage(sent, 'Changed my mind', tooLate)).toBeNull();
  });

  it('refuses an empty replacement', () => {
    const sent = message({ createdAt: T0.toISOString() });
    expect(editMessage(sent, '   ', T0)).toBeNull();
  });

  it('never lets a system line be edited', () => {
    const line = message({ kind: 'system', body: 'u2 joined the group' });
    expect(isEditableAt(line, T0)).toBe(false);
  });
});

describe('delivery state', () => {
  it('reports sent, then delivered, then read', () => {
    const sent = message();
    expect(deliveryState(sent, ['u1', 'u2'])).toBe('sent');
    const delivered = { ...sent, deliveredTo: ['u1', 'u2'] };
    expect(deliveryState(delivered, ['u1', 'u2'])).toBe('delivered');
    expect(deliveryState(markRead(sent, 'u2'), ['u1', 'u2'])).toBe('read');
  });

  it('treats a read as a delivery, so the two can never disagree', () => {
    const read = markRead(message(), 'u2');
    expect(read.deliveredTo).toContain('u2');
    expect(deliveryState(read, ['u1', 'u2'])).toBe('read');
  });

  it('is idempotent, because receipts arrive out of order', () => {
    const once = markRead(message(), 'u2');
    const twice = markRead(once, 'u2');
    expect(twice.readBy).toEqual(['u2']);
  });

  it('does not count the sender as a recipient', () => {
    expect(deliveryState(message(), ['u1'])).toBe('read');
  });
});

describe('reply threads', () => {
  it('groups replies under their root and orders threads by last activity', () => {
    const root = message({ id: 'm1', createdAt: '2026-03-01T10:00:00.000Z' });
    const reply = message({
      id: 'm2',
      replyToId: 'm1',
      senderUid: 'u2',
      createdAt: '2026-03-01T10:01:00.000Z',
    });
    const solo = message({ id: 'm3', createdAt: '2026-03-01T10:05:00.000Z' });
    const threads = groupThreads([solo, reply, root]);
    expect(threads).toHaveLength(2);
    expect(threads[0]?.root.id).toBe('m3');
    expect(threads[1]?.replies.map((entry) => entry.id)).toEqual(['m2']);
    expect(threads[1]?.participants).toEqual(['u1', 'u2']);
  });

  it('treats a reply to a missing message as a root rather than dropping it', () => {
    const orphan = message({ id: 'm9', replyToId: 'gone' });
    const threads = groupThreads([orphan]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.root.id).toBe('m9');
  });

  it('resolves the reply target for the bubble and marks an unsent message', () => {
    const root = message({ id: 'm1' });
    const reply = message({ id: 'm2', replyToId: 'm1' });
    const byId = new Map([
      ['m1', root],
      ['m2', reply],
    ]);
    const view = toThreadMessage(reply, byId, new Map(), 'u2', T0);
    expect(view.replyTo?.id).toBe('m1');
    expect(view.removed).toBe(false);

    const unsent = { ...root, deletedAt: '2026-03-01T11:00:00.000Z' };
    expect(toThreadMessage(unsent, byId, new Map(), 'u1', T0).removed).toBe(true);
  });

  it('offers the edit action only to the sender, and only inside the window', () => {
    const sent = message({ senderUid: 'u1', createdAt: T0.toISOString() });
    const view = toThreadMessage(sent, new Map(), new Map(), 'u1', T0);
    expect(view.editable).toBe(true);
    const other = toThreadMessage(sent, new Map(), new Map(), 'u2', T0);
    expect(other.editable).toBe(false);
  });
});
