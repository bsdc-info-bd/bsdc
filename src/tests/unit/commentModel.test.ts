/**
 * BSDC — src/tests/unit/commentModel.test.ts
 * Purpose : Proves comment construction and one-level threading.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The data model allows arbitrary depth; the view deliberately renders one level. These
 *   tests pin that contract so a future change cannot quietly produce nested walls of text on a
 *   320px screen.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { TEXT_LIMITS } from '@/core/config/limits';
import { isReply, newComment, threadComments } from '@/entities/comment/model';

describe('comment construction', () => {
  it('clamps the body to the comment ceiling', () => {
    const comment = newComment({
      postId: 'p1',
      authorUid: 'u1',
      body: 'x'.repeat(TEXT_LIMITS.comment + 200),
    });
    expect(comment.body).toHaveLength(TEXT_LIMITS.comment);
  });

  it('starts with no parent, no reaction and no deletion', () => {
    const comment = newComment({ postId: 'p1', authorUid: 'u1', body: 'Hello' });
    expect(comment.parentId).toBe('');
    expect(isReply(comment)).toBe(false);
    expect(comment.myReaction).toBeNull();
    expect(comment.deletedAt).toBeNull();
  });

  it('detects the language of the body', () => {
    expect(newComment({ postId: 'p1', authorUid: 'u1', body: 'ভালো লিখেছেন' }).language).toBe('bn');
  });
});

describe('threading', () => {
  it('groups replies under their root in chronological order', () => {
    const root = newComment({
      postId: 'p1',
      authorUid: 'u1',
      body: 'root',
      id: 'c1',
      now: new Date('2026-01-01T10:00:00.000Z'),
    });
    const replyB = newComment({
      postId: 'p1',
      authorUid: 'u2',
      body: 'second',
      parentId: 'c1',
      id: 'c3',
      now: new Date('2026-01-01T11:00:00.000Z'),
    });
    const replyA = newComment({
      postId: 'p1',
      authorUid: 'u3',
      body: 'first',
      parentId: 'c1',
      id: 'c2',
      now: new Date('2026-01-01T10:30:00.000Z'),
    });

    const threaded = threadComments([replyB, root, replyA]);
    expect(threaded).toHaveLength(1);
    expect(threaded[0]?.root.id).toBe('c1');
    expect(threaded[0]?.replies.map((reply) => reply.id)).toEqual(['c2', 'c3']);
  });

  it('leaves a reply to a reply at the same level', () => {
    const root = newComment({ postId: 'p1', authorUid: 'u1', body: 'root', id: 'c1' });
    const reply = newComment({
      postId: 'p1',
      authorUid: 'u2',
      body: 'r',
      parentId: 'c1',
      id: 'c2',
    });
    const nested = newComment({
      postId: 'p1',
      authorUid: 'u3',
      body: 'n',
      parentId: 'c2',
      id: 'c3',
    });
    const threaded = threadComments([root, reply, nested]);
    expect(threaded).toHaveLength(1);
    expect(threaded[0]?.replies).toHaveLength(1);
  });

  it('orders roots oldest first', () => {
    const older = newComment({
      postId: 'p1',
      authorUid: 'u1',
      body: 'a',
      id: 'c1',
      now: new Date('2026-01-01T09:00:00.000Z'),
    });
    const newer = newComment({
      postId: 'p1',
      authorUid: 'u2',
      body: 'b',
      id: 'c2',
      now: new Date('2026-01-01T10:00:00.000Z'),
    });
    const threaded = threadComments([newer, older]);
    expect(threaded.map((entry) => entry.root.id)).toEqual(['c1', 'c2']);
  });
});
