import { messageTime, type ChatMessage } from '@kit';

/** A row from `my_channels()`. */
export type ChannelRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly topic: string;
  readonly is_private: boolean;
  readonly member_count: number;
};

/** How a channel appears on its button: private channels say so. */
export function channelLabel(channel: ChannelRow): string {
  return channel.is_private ? `${channel.name} (private)` : channel.name;
}

/** When the channel last had something in it, in words. */
export function lastActivity(messages: readonly ChatMessage[], now = Date.now()): string {
  if (messages.length === 0) return 'nothing yet';
  const latest = messages.reduce((max, message) => Math.max(max, message.sentAt), 0);
  if (latest === 0) return 'unknown';
  const minutes = Math.floor((now - latest) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `at ${messageTime(latest)} on ${new Date(latest).toLocaleDateString('en-GB')}`;
}
