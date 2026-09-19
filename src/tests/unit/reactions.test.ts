/**
 * BSDC — src/tests/unit/reactions.test.ts
 * Purpose : Proves reaction counting, summary derivation and optimistic updates are exact.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A reaction count that disagrees between the card, the detail page and a notification is
 *   the kind of small wrongness people stop trusting a product over.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  REACTIONS,
  REACTION_DEFINITIONS,
  isReactionType,
  orderedReactionSummary,
  reactionDefinition,
} from '@/core/config/reactions';
import {
  applyReactionChange,
  emptySummary,
  newReaction,
  summariseReactions,
  type Reaction,
} from '@/entities/reaction/model';

describe('reaction registry', () => {
  it('defines exactly ten reactions with bilingual labels', () => {
    expect(REACTIONS).toHaveLength(10);
    expect(REACTION_DEFINITIONS).toHaveLength(10);
    for (const definition of REACTION_DEFINITIONS) {
      expect(definition.labelBn.length).toBeGreaterThan(0);
      expect(definition.labelEn.length).toBeGreaterThan(0);
      expect(definition.spriteId).toBe(`reaction-${definition.type}`);
    }
  });

  it('recognises known reactions and rejects unknown ones', () => {
    expect(isReactionType('love')).toBe(true);
    expect(isReactionType('mindblown')).toBe(true);
    expect(isReactionType('shrug')).toBe(false);
  });

  it('falls back to like for an unknown identifier', () => {
    expect(reactionDefinition('unknown').type).toBe('like');
    expect(reactionDefinition('fire').type).toBe('fire');
  });
});

describe('summary derivation', () => {
  it('starts at zero with no viewer reaction', () => {
    const summary = emptySummary();
    expect(summary.total).toBe(0);
    expect(summary.mine).toBeNull();
    expect(Object.values(summary.counts).every((value) => value === 0)).toBe(true);
  });

  it('counts every reaction exactly once', () => {
    const reactions: readonly Reaction[] = [
      newReaction('post-1', 'u1', 'like'),
      newReaction('post-1', 'u2', 'love'),
      newReaction('post-1', 'u3', 'like'),
      newReaction('post-1', 'u4', 'fire'),
    ];
    const summary = summariseReactions(reactions, 'u2');
    expect(summary.total).toBe(4);
    expect(summary.counts.like).toBe(2);
    expect(summary.counts.love).toBe(1);
    expect(summary.counts.fire).toBe(1);
    expect(summary.mine).toBe('love');
  });

  it('ignores soft-deleted reactions', () => {
    const removed: Reaction = {
      ...newReaction('post-1', 'u1', 'like'),
      deletedAt: '2026-01-01T00:00:00.000Z',
    };
    const summary = summariseReactions([removed, newReaction('post-1', 'u2', 'wow')], null);
    expect(summary.total).toBe(1);
    expect(summary.counts.like).toBe(0);
    expect(summary.counts.wow).toBe(1);
  });

  it('applies a change optimistically and keeps the total consistent', () => {
    const start = summariseReactions([newReaction('post-1', 'u1', 'like')], 'u1');
    const swapped = applyReactionChange(start, 'like', 'love');
    expect(swapped.total).toBe(1);
    expect(swapped.counts.like).toBe(0);
    expect(swapped.counts.love).toBe(1);
    expect(swapped.mine).toBe('love');

    const cleared = applyReactionChange(swapped, 'love', null);
    expect(cleared.total).toBe(0);
    expect(cleared.mine).toBeNull();
  });

  it('orders the summary by weight, then by count within a weight', () => {
    // like and sad share weight 1, so the more numerous one leads; mindblown outranks both.
    const order = orderedReactionSummary({ like: 2, sad: 9, mindblown: 1 });
    expect(order).toEqual(['mindblown', 'sad', 'like']);
  });
});
