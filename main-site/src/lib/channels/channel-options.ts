import type { Visibility } from '@/lib/content/content-types';
import type { PostableChannel } from './channel-repository';

/** The value the composer's channel selector sends for "the feed". */
export const FEED_OPTION_VALUE = '__feed__';

export type ChannelPickerCopy = {
  feed: string;
  reason: Record<NonNullable<PostableChannel['blockReason']>, string>;
};

/**
 * The picker groups a channel list by group, with the feed first.
 *
 * A blocked channel stays visible: hiding it leaves a member hunting for a
 * room the group page shows. What changes is that the option is disabled, and
 * the label says why — so the refusal is on screen before the save is sent,
 * and the database says the same words if it happens anyway.
 */
export function channelSelectGroups(
  channels: readonly PostableChannel[],
  copy: ChannelPickerCopy,
): { label: string; options: { value: string; label: string; disabled?: boolean }[] }[] {
  const groups = new Map<string, PostableChannel[]>();
  for (const channel of channels) {
    // The key carries the group's name first so the label can read it without
    // looking the group up again; under noUncheckedIndexedAccess-style
    // strictness a bare destructure is string | undefined, so it is split
    // and defaulted explicitly.
    const key = `${channel.groupName}\u0000${channel.groupId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(channel);
    else groups.set(key, [channel]);
  }

  const blockGroups = [...groups.entries()].map(([key, members]) => {
    const groupName = key.split('\u0000')[0] ?? '';
    return {
      label: groupName,
      options: members.map((channel) => ({
        value: channel.id,
        label: channelLabel(channel, copy),
        // A blocked channel is shown but cannot be chosen: the reason is in
        // the label, and picking it would be a save the database refuses.
        disabled: channel.blockReason !== null,
      })),
    };
  });

  return [
    { label: copy.feed, options: [{ value: FEED_OPTION_VALUE, label: copy.feed }] },
    ...blockGroups,
  ];
}

function channelLabel(channel: PostableChannel, copy: ChannelPickerCopy): string {
  const reason = channel.blockReason !== null ? copy.reason[channel.blockReason] : null;
  return `#${channel.slug} · ${channel.name}${reason ? ` (${reason})` : ''}`;
}

/** The value a picker sends for a channel id, or the feed's sentinel. */
export function channelValue(channelId: string | null): string {
  return channelId === null ? FEED_OPTION_VALUE : channelId;
}

/** The channel id a picker value names, or null for the feed. */
export function channelIdFromValue(value: string): string | null {
  return value === FEED_OPTION_VALUE ? null : value;
}

/**
 * `private` is the one visibility a channel cannot carry: a member who asked
 * for "only me" and got "the whole room" has been overruled on the one field
 * that decides who reads their words.
 */
export function visibilityAllowedInChannel(
  visibility: Visibility,
  channelId: string | null,
): boolean {
  return !(visibility === 'private' && channelId !== null);
}

/**
 * Settles an impossible pair before the member presses publish, so the save is
 * never refused for something the screen could have said. The channel keeps
 * its place; the visibility moves to `followers`, the nearest honourable
 * answer that a channel can carry.
 */
export function reconcileVisibility(visibility: Visibility, channelId: string | null): Visibility {
  return visibilityAllowedInChannel(visibility, channelId) ? visibility : 'followers';
}
