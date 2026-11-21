/**
 * The channel a composer was opened for, and the link that opens it.
 *
 * Both halves of "post in this channel" are here so that neither the channel
 * page nor the composer has to know the other's rules: the page builds a link,
 * the composer reads it, and the only shared contract is the `channel` query
 * parameter and the shape returned below.
 */

import type { Visibility } from '@/lib/content/content-types';
import { reconcileVisibility } from './channel-options';
import type { ChannelBlockReason, PostableChannel } from './channel-repository';
import { ROUTES } from '@/lib/site';

/** The query parameter that carries a channel id into the composer. */
export const CHANNEL_QUERY_PARAM = 'channel';

export type ChannelSeed =
  /** No link named a channel; the composer behaves as it always did. */
  | { kind: 'none' }
  /** The channel is one this member may write in; preselect it. */
  | { kind: 'seeded'; channelId: string }
  /**
   * The channel exists and the member can see it, but it refuses their post.
   * The reason is the same sentence the picker and the database use, so the
   * composer does not invent a second vocabulary for a refusal.
   */
  | { kind: 'blocked'; reason: ChannelBlockReason }
  /** The named channel is not one this member can see, or no longer exists. */
  | { kind: 'unknown' };

/**
 * Decide what a `?channel=` link means, given the member's channel list.
 *
 * Three of these outcomes matter, and the distinction between them is the whole
 * function. A stale link — a room closed since it was written down — must not
 * quietly become a post to the open feed, because the member would write a post
 * for `#release-notes` and publish it to everyone. So a blocked channel is
 * reported, not dropped. A channel the member cannot see is reported too, since
 * "you cannot post there" and "there is nothing called that" deserve different
 * sentences even where the room itself is invisible.
 *
 * A `null` channel list means the query has not answered yet. Seeding the id
 * anyway is deliberate: refusing a link because a fetch lost a race would make
 * a working button fail intermittently, and the database still has the last
 * word when the post is saved.
 */
export function seedChannelFromParam(
  value: string | null | undefined,
  channels: readonly PostableChannel[] | null,
): ChannelSeed {
  const channelId = value?.trim() ?? '';
  if (channelId.length === 0) return { kind: 'none' };
  if (channels === null) return { kind: 'seeded', channelId };

  const match = channels.find((channel) => channel.id === channelId);
  if (match === undefined) return { kind: 'unknown' };
  if (match.blockReason !== null) return { kind: 'blocked', reason: match.blockReason };
  return { kind: 'seeded', channelId };
}

/**
 * The composer's address for one channel: `/compose?channel=<id>`.
 *
 * It returns `{ pathname, search }` rather than a string so the caller hands
 * React Router a structured target and nobody hand-assembles a query string
 * with `+` and `%` in it.
 */
export function composeChannelHref(channelId: string): { pathname: string; search: string } {
  const search = new URLSearchParams();
  search.set(CHANNEL_QUERY_PARAM, channelId);
  // The leading `?` is part of the contract, not decoration: react-router's
  // `createSearchParams` tolerates it and hand-built strings often forget it,
  // and a search of `channel=…` against a path of `/compose` silently yields
  // `/composechannel=…` in any code that concatenates rather than parses.
  return { pathname: ROUTES.compose, search: `?${search.toString()}` };
}

/** Why the composer did not honour a link's channel. */
export type ChannelSeedNotice =
  | { kind: 'blocked'; reason: ChannelBlockReason }
  | { kind: 'unknown' };

/**
 * Apply a link's channel to a draft, and say what had to be refused.
 *
 * Deliberately narrow — a channel id and a visibility, nothing else — so that
 * arriving from `#release-notes` can retarget the post but cannot rewrite its
 * title, its body or its pictures. It is also what keeps the rule testable: the
 * composer's other twenty states are none of this function's business.
 *
 * A refused channel clears the draft's channel rather than keeping the link's.
 * The alternative is to seed a channel the database will reject on save, which
 * turns a stale link into an error at the worst possible moment: after the
 * member has written the post.
 */
export function applyChannelSeed<D extends { channelId: string | null; visibility: Visibility }>(
  draft: D,
  seed: ChannelSeed,
): { draft: D; notice: ChannelSeedNotice | null } {
  if (seed.kind === 'none') return { draft, notice: null };
  if (seed.kind === 'seeded') {
    return {
      draft: {
        ...draft,
        channelId: seed.channelId,
        // The same rule the picker enforces: a "only me" post inside a channel
        // is refused by the database, so the visibility moves, not the room.
        visibility: reconcileVisibility(draft.visibility, seed.channelId),
      },
      notice: null,
    };
  }
  return { draft: { ...draft, channelId: null }, notice: seed };
}
