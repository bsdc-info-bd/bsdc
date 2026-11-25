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

// ---------------------------------------------------------------------------
// §13.2 — an incident channel that links back to the public record
// ---------------------------------------------------------------------------

export type ChannelIncident = {
  readonly id: string;
  readonly public_title: string;
  readonly public_slug: string;
  readonly impact: 'none' | 'minor' | 'major' | 'critical';
  readonly started_at: string;
  readonly resolved_at: string | null;
  readonly is_drill: boolean;
};

/**
 * The banner an incident channel carries.
 *
 * §13.2's requirement is that the conversation and the public record do not
 * diverge. A channel that looks like any other channel is a channel whose
 * participants forget they are inside a record, so the banner names the
 * incident, says whether it is still open, and says what the public board says
 * — which is the only version a customer can read.
 */
export function incidentBanner(incident: ChannelIncident, now = Date.now()): string {
  const started = new Date(incident.started_at).getTime();
  const hours = Number.isNaN(started) ? null : Math.floor((now - started) / 3_600_000);
  const span =
    hours === null ? '' : hours < 1 ? ' under an hour ago' : hours < 24 ? ` ${String(hours)}h ago` : ` ${String(Math.floor(hours / 24))}d ago`;
  if (incident.is_drill) {
    return `This is a drill. Nothing here is visible to anybody outside staff, and the public board is untouched.`;
  }
  if (incident.resolved_at !== null) {
    return `Resolved. This channel stays as the internal record; the public board carries the customer-facing summary.`;
  }
  return `Open${span}. What you write here is internal — the public board shows only what somebody published there.`;
}

/**
 * A channel keeps its incident link for good, so the only cheap client-side
 * test is the slug. It is a hint, not a rule: the server still decides whether
 * there is an incident to show, and a channel named `inc-` that has none gets
 * an empty answer.
 */
export function isIncidentChannelSeed(slug: string): boolean {
  return slug.startsWith('inc-');
}

/**
 * A stable public link, not a guess based on a staff-console origin. The board
 * card owns the matching fragment id. `base` is injectable for preview and
 * tests; production's domain is the documented status-site deployment.
 */
export function statusIncidentHref(
  slug: string,
  base = import.meta.env.VITE_STATUS_URL ?? 'https://status.site.main.bsdc.info.bd',
): string {
  return `${base.replace(/\/$/, '')}/#incident-${encodeURIComponent(slug)}`;
}

/** Only an incident channel gets the banner, and only for a real incident. */
export function isIncidentChannel(incident: ChannelIncident | null): boolean {
  return incident !== null;
}
