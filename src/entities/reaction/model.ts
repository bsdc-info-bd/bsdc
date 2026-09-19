/**
 * BSDC — src/entities/reaction/model.ts
 * Purpose : Reactions as data: one per person per post, plus the derived summary.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A reaction is stored at `posts/{postId}/reactions/{uid}`, which makes "one reaction
 *   per person" a structural property rather than a rule the client has to remember. Changing a
 *   reaction is therefore a write, not a delete plus a create, and the summary is derived here so
 *   the post card, the detail page and the notification copy all count the same way.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { REACTIONS, type ReactionType } from '@/core/config/reactions';

/** A single person's reaction to a post. */
export interface Reaction {
  /** Equals the reacting account id. */
  readonly id: string;
  readonly postId: string;
  readonly uid: string;
  readonly type: ReactionType;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Counted reactions for a post plus the viewer's own choice. */
export interface ReactionSummary {
  readonly counts: Readonly<Record<ReactionType, number>>;
  readonly total: number;
  readonly mine: ReactionType | null;
}

/**
 * Builds an all-zero summary.
 * @returns an empty summary
 */
export function emptySummary(): ReactionSummary {
  const counts = {} as Record<ReactionType, number>;
  for (const type of REACTIONS) counts[type] = 0;
  return { counts, total: 0, mine: null };
}

/**
 * Derives a summary from a list of reactions.
 * @param reactions every reaction on the post
 * @param viewerUid the viewer's account id, or null when signed out
 * @returns the summary
 */
export function summariseReactions(
  reactions: readonly Reaction[],
  viewerUid: string | null,
): ReactionSummary {
  const counts = {} as Record<ReactionType, number>;
  for (const type of REACTIONS) counts[type] = 0;
  let mine: ReactionType | null = null;
  let total = 0;

  for (const reaction of reactions) {
    if (reaction.deletedAt !== null) continue;
    counts[reaction.type] += 1;
    total += 1;
    if (viewerUid !== null && reaction.uid === viewerUid) mine = reaction.type;
  }

  return { counts, total, mine };
}

/**
 * Applies one person's change to an existing summary without recomputing everything.
 * @param summary the current summary
 * @param previous the person's previous reaction, when known
 * @param next the person's new reaction, or null to remove it
 * @returns the updated summary
 */
export function applyReactionChange(
  summary: ReactionSummary,
  previous: ReactionType | null,
  next: ReactionType | null,
): ReactionSummary {
  const counts: Record<ReactionType, number> = { ...summary.counts };
  let total = summary.total;

  if (previous !== null) {
    counts[previous] = Math.max(0, (counts[previous] ?? 0) - 1);
    total = Math.max(0, total - 1);
  }
  if (next !== null) {
    counts[next] = (counts[next] ?? 0) + 1;
    total += 1;
  }

  return { counts, total, mine: next };
}

/**
 * Builds a reaction entity.
 * @param postId post id
 * @param uid reacting account id
 * @param type chosen reaction
 * @param now creation instant
 * @returns the reaction entity
 */
export function newReaction(
  postId: string,
  uid: string,
  type: ReactionType,
  now: Date = new Date(),
): Reaction {
  const iso = now.toISOString();
  return { id: uid, postId, uid, type, createdAt: iso, updatedAt: iso, deletedAt: null };
}
