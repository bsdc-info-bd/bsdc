import { describe, expect, it } from 'vitest';
import {
  buildCommentTree,
  countComments,
  EMPTY_INTERACTION,
  REACTIONS,
  type Comment,
} from '@/lib/interactions/interaction-types';

function comment(overrides: Partial<Comment> & Pick<Comment, 'id'>): Comment {
  return {
    postId: 'post-1',
    parentId: null,
    rootId: null,
    depth: 0,
    body: 'body',
    likes: 0,
    replies: 0,
    isAnswer: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    editedAt: null,
    author: null,
    liked: false,
    ...overrides,
  };
}

describe('reaction vocabulary', () => {
  it('starts with like and has no duplicates', () => {
    expect(REACTIONS[0]).toBe('like');
    expect(new Set(REACTIONS).size).toBe(REACTIONS.length);
  });

  it('treats an unknown post as neither reacted nor saved', () => {
    expect(EMPTY_INTERACTION).toEqual({ reaction: null, bookmarked: false });
  });
});

describe('buildCommentTree', () => {
  it('nests replies under their parent', () => {
    const tree = buildCommentTree([
      comment({ id: 'root' }),
      comment({ id: 'child', parentId: 'root', depth: 1 }),
      comment({ id: 'grandchild', parentId: 'child', depth: 2 }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe('child');
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('grandchild');
  });

  it('orders siblings oldest first', () => {
    const tree = buildCommentTree([
      comment({ id: 'later', createdAt: '2026-10-01T12:00:00.000Z' }),
      comment({ id: 'earlier', createdAt: '2026-10-01T09:00:00.000Z' }),
    ]);
    expect(tree.map((node) => node.id)).toEqual(['earlier', 'later']);
  });

  it('promotes an accepted answer to the top of the thread', () => {
    const tree = buildCommentTree([
      comment({ id: 'first', createdAt: '2026-10-01T09:00:00.000Z' }),
      comment({ id: 'answer', createdAt: '2026-10-01T11:00:00.000Z', isAnswer: true }),
    ]);
    expect(tree[0]?.id).toBe('answer');
  });

  it('promotes an orphan instead of dropping its subtree', () => {
    const tree = buildCommentTree([
      comment({ id: 'orphan', parentId: 'removed', depth: 1 }),
      comment({ id: 'orphan-child', parentId: 'orphan', depth: 2 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('orphan');
    expect(tree[0]?.children).toHaveLength(1);
  });

  it('never loses a comment', () => {
    const flat = [
      comment({ id: 'a' }),
      comment({ id: 'b', parentId: 'a', depth: 1 }),
      comment({ id: 'c', parentId: 'b', depth: 2 }),
      comment({ id: 'd' }),
    ];
    expect(countComments(buildCommentTree(flat))).toBe(flat.length);
  });

  it('returns nothing for an empty thread', () => {
    expect(buildCommentTree([])).toEqual([]);
    expect(countComments([])).toBe(0);
  });
});
