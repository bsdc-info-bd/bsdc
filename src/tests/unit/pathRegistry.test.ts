/**
 * BSDC — src/tests/unit/pathRegistry.test.ts
 * Purpose : Proves the Firestore and Realtime Database path builders produce the exact paths the
 *   security rules authorise.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A path is a security boundary. If a builder and a rule disagree, the result is either a
 *   silent denial or, far worse, a path the rules never considered.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS,
  RTDB_PATHS,
  SUBCOLLECTIONS,
  commentPath,
  conversationMemberPath,
  docPath,
  draftPath,
  fanoutPath,
  groupMemberPath,
  messagePath,
  notificationPath,
  postPath,
  presencePath,
  reactionPath,
  receiptPath,
  savedItemPath,
  typingPath,
  userPath,
} from '@/core/config/collections';

describe('firestore paths', () => {
  it('builds a slash-joined path and skips empty segments', () => {
    expect(docPath('a', '', 'b')).toBe('a/b');
    expect(docPath()).toBe('');
  });

  it('matches the collections the rules secure', () => {
    expect(userPath('u1')).toBe(`${COLLECTIONS.users}/u1`);
    expect(postPath('p1')).toBe(`${COLLECTIONS.posts}/p1`);
    expect(commentPath('p1', 'c1')).toBe('posts/p1/comments/c1');
    expect(reactionPath('p1', 'u1')).toBe('posts/p1/reactions/u1');
    expect(groupMemberPath('g1', 'u1')).toBe('groups/g1/members/u1');
    expect(messagePath('cv1', 'm1')).toBe('conversations/cv1/messages/m1');
    expect(notificationPath('u1', 'n1')).toBe('users/u1/notifications/n1');
    expect(savedItemPath('u1', 'post:p1')).toBe('users/u1/saved/post:p1');
    expect(draftPath('u1', 'd1')).toBe('users/u1/drafts/d1');
  });

  it('keys a reaction by the reacting account so one person has one reaction', () => {
    expect(reactionPath('p1', 'u1').split('/').pop()).toBe('u1');
  });

  it('declares every subcollection used by the builders', () => {
    expect(Object.values(SUBCOLLECTIONS)).toContain('comments');
    expect(Object.values(SUBCOLLECTIONS)).toContain('reactions');
    expect(Object.values(SUBCOLLECTIONS)).toContain('members');
    expect(Object.values(SUBCOLLECTIONS)).toContain('messages');
  });
});

describe('realtime database paths', () => {
  it('builds the ephemeral plane paths the database rules authorise', () => {
    expect(presencePath('u1')).toBe(`${RTDB_PATHS.presence}/u1`);
    expect(typingPath('cv1', 'u1')).toBe('typing/cv1/u1');
    expect(conversationMemberPath('cv1', 'u1')).toBe('conversationMembers/cv1/u1');
    expect(receiptPath('cv1', 'm1', 'u1')).toBe('receipts/cv1/m1/u1');
    expect(fanoutPath('u1', 'n1')).toBe('notificationFanout/u1/n1');
  });

  it('scopes every fan-out node to one account', () => {
    expect(fanoutPath('u1', 'n1').startsWith('notificationFanout/u1/')).toBe(true);
  });
});
