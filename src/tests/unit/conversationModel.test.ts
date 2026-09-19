/**
 * BSDC — src/tests/unit/conversationModel.test.ts
 * Purpose : Proves conversation identity, message construction and read-receipt maths.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A direct conversation id must be derivable offline from the two participant ids.
 *   If it is not, two people opening the same chat on a train create two threads and lose the
 *   earlier half of their conversation.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { TEXT_LIMITS } from '@/core/config/limits';
import {
  conversationTitle,
  directConversationId,
  isFullyRead,
  messagePreview,
  newConversation,
  newMessage,
} from '@/entities/conversation/model';

describe('direct conversation identity', () => {
  it('is the same id whichever side opens it', () => {
    expect(directConversationId('u1', 'u2')).toBe(directConversationId('u2', 'u1'));
  });

  it('differs for different pairs', () => {
    expect(directConversationId('u1', 'u2')).not.toBe(directConversationId('u1', 'u3'));
  });
});

describe('conversation construction', () => {
  it('starts every participant at zero unread', () => {
    const conversation = newConversation('c1', 'direct', ['u1', 'u2'], 'Team');
    expect(conversation.unread.u1).toBe(0);
    expect(conversation.unread.u2).toBe(0);
    expect(conversation.participantUids).toEqual(['u1', 'u2']);
  });

  it('prefers the title, then the other person, then the fallback', () => {
    const titled = newConversation('c1', 'direct', ['u1', 'u2'], 'Team');
    expect(conversationTitle(titled, 'u1', 'BSDC')).toBe('Team');

    const untitled = newConversation('c2', 'direct', ['u1', 'u2'], '');
    const withNames = { ...untitled, participantNames: ['Me', 'Rizwan'] };
    expect(conversationTitle(withNames, 'u1', 'BSDC')).toBe('Rizwan');

    expect(conversationTitle(untitled, 'u1', 'BSDC')).toBe('BSDC');
  });
});

describe('messages', () => {
  it('clamps the body to the chat ceiling', () => {
    const message = newMessage({
      conversationId: 'c1',
      senderUid: 'u1',
      body: 'z'.repeat(TEXT_LIMITS.chatMessage + 50),
    });
    expect(message.body).toHaveLength(TEXT_LIMITS.chatMessage);
  });

  it('carries a client id so the optimistic echo collapses into one bubble', () => {
    const message = newMessage({
      conversationId: 'c1',
      senderUid: 'u1',
      body: 'hi',
      clientId: 'client-1',
    });
    expect(message.clientId).toBe('client-1');
    expect(message.id).not.toBe('client-1');
    expect(message.deliveredTo).toEqual(['u1']);
    expect(message.readBy).toEqual([]);
  });

  it('previews by kind and truncates long text', () => {
    expect(messagePreview(newMessage({ conversationId: 'c1', senderUid: 'u1', body: 'hi' }))).toBe(
      'hi',
    );
    const long = newMessage({
      conversationId: 'c1',
      senderUid: 'u1',
      body: 'a'.repeat(200),
    });
    expect(messagePreview(long).length).toBe(60);
    const voice = newMessage({ conversationId: 'c1', senderUid: 'u1', body: '', kind: 'voice' });
    expect(messagePreview(voice)).toBe('Voice note');
  });

  it('counts a message as fully read only when every recipient has read it', () => {
    const message = newMessage({ conversationId: 'c1', senderUid: 'u1', body: 'hi' });
    expect(isFullyRead(message, ['u1', 'u2'])).toBe(false);
    expect(isFullyRead({ ...message, readBy: ['u2'] }, ['u1', 'u2'])).toBe(true);
    expect(isFullyRead({ ...message, readBy: ['u2'] }, ['u1', 'u2', 'u3'])).toBe(false);
  });
});
