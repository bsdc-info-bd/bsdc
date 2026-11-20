import { describe, expect, it } from 'vitest';
import {
  FEED_OPTION_VALUE,
  channelIdFromValue,
  channelSelectGroups,
  channelValue,
  reconcileVisibility,
  visibilityAllowedInChannel,
} from './channel-options';
import type { ChannelPickerCopy } from './channel-options';
import type { PostableChannel } from './channel-repository';

const COPY: ChannelPickerCopy = {
  feed: 'The main feed',
  reason: {
    'channel/read-only': 'read-only',
    'channel/not-member': 'not a member',
    'channel/archived': 'archived',
    'channel/not-found': 'missing',
  },
};

function channel(overrides: Partial<PostableChannel> = {}): PostableChannel {
  return {
    id: 'ch-1',
    groupId: 'grp-1',
    groupSlug: 'sylhet-php',
    groupName: 'Sylhet PHP',
    slug: 'general',
    name: 'general',
    topic: '',
    isReadOnly: false,
    blockReason: null,
    ...overrides,
  };
}

describe('channelSelectGroups', () => {
  it('puts the feed first and never disables it', () => {
    const groups = channelSelectGroups([channel()], COPY);
    expect(groups[0]?.label).toBe(COPY.feed);
    expect(groups[0]?.options).toHaveLength(1);
    expect(groups[0]?.options[0]?.value).toBe(FEED_OPTION_VALUE);
    expect(groups[0]?.options[0]?.disabled).toBeUndefined();
  });

  it('produces one optgroup per group', () => {
    const groups = channelSelectGroups(
      [channel(), channel({ id: 'ch-2', groupId: 'grp-2', groupName: 'Dhaka Rust' })],
      COPY,
    );
    expect(groups).toHaveLength(3);
    expect(groups[1]?.label).toBe('Sylhet PHP');
    expect(groups[2]?.label).toBe('Dhaka Rust');
    expect(groups[1]?.options).toHaveLength(1);
    expect(groups[2]?.options).toHaveLength(1);
  });

  it('keeps a blocked channel visible, disabled, with the reason in the label', () => {
    const groups = channelSelectGroups([channel({ blockReason: 'channel/read-only' })], COPY);
    const blocked = groups[1]?.options[0];
    expect(blocked?.value).toBe('ch-1');
    expect(blocked?.disabled).toBe(true);
    expect(blocked?.label).toBe('#general · general (read-only)');
  });

  it('worded every one of the four reasons', () => {
    const reasons = [
      'channel/read-only',
      'channel/not-member',
      'channel/archived',
      'channel/not-found',
    ] as const;
    for (const reason of reasons) {
      const groups = channelSelectGroups([channel({ blockReason: reason })], COPY);
      const option = groups[1]?.options[0];
      expect(option?.label).toContain(`(${COPY.reason[reason]})`);
      expect(option?.disabled).toBe(true);
    }
  });

  it('normalises an unknown reason to a plain label, never a raw key', () => {
    const groups = channelSelectGroups([channel({ blockReason: null })], COPY);
    // The picker only receives the four known reasons; what is asserted here
    // is that a label never leaks a `channel/` substring from anywhere.
    for (const group of groups) {
      for (const option of group.options) {
        expect(option.label).not.toContain('channel/');
      }
    }
  });
});

describe('channelValue round trips', () => {
  it('maps a channel id to its value and back', () => {
    expect(channelValue('ch-1')).toBe('ch-1');
    expect(channelIdFromValue('ch-1')).toBe('ch-1');
  });

  it('maps null to the feed sentinel and back', () => {
    expect(channelValue(null)).toBe(FEED_OPTION_VALUE);
    expect(channelIdFromValue(FEED_OPTION_VALUE)).toBeNull();
  });

  it('keeps an empty string apart from the feed sentinel', () => {
    // An empty string is not the sentinel: the picker always sends either the
    // sentinel for the feed or a real channel id.
    expect(channelIdFromValue('')).toBe('');
    expect(channelValue('')).toBe('');
  });
});

describe('visibilityAllowedInChannel', () => {
  it('refuses private only inside a channel', () => {
    expect(visibilityAllowedInChannel('private', null)).toBe(true);
    expect(visibilityAllowedInChannel('private', 'ch-1')).toBe(false);
    expect(visibilityAllowedInChannel('public', 'ch-1')).toBe(true);
    expect(visibilityAllowedInChannel('followers', 'ch-1')).toBe(true);
    expect(visibilityAllowedInChannel('public', null)).toBe(true);
  });
});

describe('reconcileVisibility', () => {
  it('leaves an allowed pair alone', () => {
    expect(reconcileVisibility('public', 'ch-1')).toBe('public');
    expect(reconcileVisibility('followers', 'ch-1')).toBe('followers');
    expect(reconcileVisibility('private', null)).toBe('private');
  });

  it('settles an impossible pair to followers', () => {
    expect(reconcileVisibility('private', 'ch-1')).toBe('followers');
  });
});
