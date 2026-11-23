import { describe, expect, it } from 'vitest';
import type { PostableChannel } from './channel-repository';
import {
  applyChannelSeed,
  composeChannelHref,
  seedChannelFromParam,
  type ChannelSeed,
} from './channel-seed';

/**
 * A channel has to be writable from the channel.
 *
 * Phase 2 taught the composer to place a post in a channel and the feed to say
 * where a post was written; Phase 3 let a moderator build the room. What was
 * missing is the obvious move: reading `#release-notes` and writing the next
 * post *into* it. These two pure functions are that move — the link a channel
 * page offers, and the answer the composer gives when a link arrives with a
 * channel already chosen.
 *
 * The interesting case is refusal. A deep link is a promise made by whoever put
 * it on screen, and it can be stale: the room may have been closed, the group
 * archived, the reader removed, or the channel deleted. Silently dropping the
 * member into a *feed* composer after they clicked "post in #release-notes" is
 * the worst possible outcome, because the post will succeed and land somewhere
 * they did not choose. So the composer is told which of the three happened, and
 * says so.
 */

function channel(overrides: Partial<PostableChannel> = {}): PostableChannel {
  return {
    id: 'channel-general',
    groupId: 'group-1',
    groupSlug: 'sylhet-php',
    groupName: 'Sylhet PHP',
    slug: 'general',
    name: 'general',
    topic: 'Anything',
    isReadOnly: false,
    blockReason: null,
    ...overrides,
  };
}

describe('seedChannelFromParam', () => {
  it('seeds nothing when the composer was opened without a channel', () => {
    expect(seedChannelFromParam(null, [channel()])).toEqual({ kind: 'none' });
    expect(seedChannelFromParam('', [channel()])).toEqual({ kind: 'none' });
    expect(seedChannelFromParam('  ', [channel()])).toEqual({ kind: 'none' });
  });

  it('seeds the channel a link named, when the member may write there', () => {
    expect(seedChannelFromParam('channel-general', [channel()])).toEqual({
      kind: 'seeded',
      channelId: 'channel-general',
    });
  });

  it('keeps the picker quiet while the list is still arriving', () => {
    // The channels come from a query. Refusing a link that is merely early
    // would be a race presented as a decision, so the id is seeded and the
    // database, which is not racy, has the last word on save.
    expect(seedChannelFromParam('channel-general', null)).toEqual({
      kind: 'seeded',
      channelId: 'channel-general',
    });
  });

  it('says why a closed room refuses the link, rather than moving the post', () => {
    expect(
      seedChannelFromParam('channel-general', [channel({ blockReason: 'channel/read-only' })]),
    ).toEqual({ kind: 'blocked', reason: 'channel/read-only' });
  });

  it('says so when the channel is not one this member can see at all', () => {
    expect(seedChannelFromParam('channel-gone', [channel({ id: 'other' })])).toEqual({
      kind: 'unknown',
    });
  });

  it('treats a blocked entry as blocked even when other channels are open', () => {
    const channels = [
      channel({ id: 'open' }),
      channel({ id: 'closed', blockReason: 'channel/archived' }),
    ];
    expect(seedChannelFromParam('closed', channels)).toEqual({
      kind: 'blocked',
      reason: 'channel/archived',
    });
    expect(seedChannelFromParam('open', channels)).toEqual({ kind: 'seeded', channelId: 'open' });
  });
});

describe('composeChannelHref', () => {
  it('points at the composer with the channel attached', () => {
    const href = composeChannelHref('channel-general');
    expect(href.pathname).toBe('/compose');
    expect(href.search).toBe('?channel=channel-general');
  });

  it('survives a round trip through the URL', () => {
    const href = composeChannelHref('channel-general');
    const search = new URLSearchParams(href.search.replace(/^\?/, ''));
    expect(search.get('channel')).toBe('channel-general');
  });
});

describe('applyChannelSeed', () => {
  // The shape the composer actually carries: a channel id and a visibility,
  // nothing else. Keeping the parameter this small is what lets the function be
  // tested without mounting the composer, and what stops a link from rewriting
  // a title or a body the member is already typing.
  const base = { id: '', channelId: null as string | null, visibility: 'public' as const };

  it('leaves an untouched composer alone', () => {
    const seed: ChannelSeed = { kind: 'none' };
    expect(applyChannelSeed(base, seed)).toEqual({ draft: base, notice: null });
  });

  it('names the channel the link asked for', () => {
    const seed: ChannelSeed = { kind: 'seeded', channelId: 'channel-general' };
    const out = applyChannelSeed(base, seed);
    expect(out.draft.channelId).toBe('channel-general');
    expect(out.notice).toBeNull();
  });

  it('carries the post to the feed rather than past a closed room', () => {
    // The link asked for a room that refuses a post. Honoring it would send a
    // save the database rejects, so the composer says so and leaves the draft
    // pointed at nothing: a member who then picks a different room is choosing,
    // not being redirected behind their back.
    const seed: ChannelSeed = { kind: 'blocked', reason: 'channel/read-only' };
    const out = applyChannelSeed({ ...base, channelId: 'channel-general' }, seed);
    expect(out.draft.channelId).toBeNull();
    expect(out.notice).toEqual({ kind: 'blocked', reason: 'channel/read-only' });
  });

  it('reports a channel this member cannot see instead of posting to the feed silently', () => {
    const seed: ChannelSeed = { kind: 'unknown' };
    const out = applyChannelSeed(base, seed);
    expect(out.draft.channelId).toBeNull();
    expect(out.notice).toEqual({ kind: 'unknown' });
  });

  it('never seeds a private post into a channel', () => {
    // `private` inside a channel is refused by the database; the composer
    // reconciles the two the same way the picker does, so the link cannot put
    // the member one save away from an error.
    const seed: ChannelSeed = { kind: 'seeded', channelId: 'channel-general' };
    const out = applyChannelSeed({ ...base, visibility: 'private' as const }, seed);
    expect(out.draft.channelId).toBe('channel-general');
    expect(out.draft.visibility).not.toBe('private');
  });
});
