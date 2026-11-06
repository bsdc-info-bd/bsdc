/**
 * The numbers a console lead looks at first, turned into words.
 *
 * Pure functions, no JSX, because every rule here is a judgement that should not
 * be made twice: what counts as urgent, whether a report-to-action ratio looks
 * wrong, and whether a plugin count that never moves means the plugins are all
 * switched off or means the counter is broken.
 */

/** A row of `admin_overview()`. */
export interface Overview {
  members_total: number;
  members_today: number;
  posts_total: number;
  posts_today: number;
  open_reports: number;
  shops_pending: number;
  campaigns_pending: number;
  plugins_enabled: number;
  plugins_total: number;
}

/** A row of `admin_audit(p_limit)`. */
export interface AuditRow {
  actor_uid: string;
  action: string;
  subject: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** One number on the dashboard, with the sentence under it. */
export interface Tile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: 'ok' | 'warn' | 'bad' | 'neutral';
  readonly note: string;
}

/**
 * The work that is actually waiting on a person.
 *
 * A dashboard is useful only for the number that requires somebody to do
 * something. Members and posts are context; these are the three queues that grow
 * while nobody looks, and the total is what the tab title can show.
 */
export function outstandingWork(overview: Overview): number {
  return overview.open_reports + overview.shops_pending + overview.campaigns_pending;
}

export function overviewTiles(overview: Overview): readonly Tile[] {
  return [
    {
      key: 'members',
      label: 'Members',
      value: formatCount(overview.members_total),
      tone: 'neutral',
      note:
        overview.members_today === 0
          ? 'Nobody joined today yet.'
          : `${String(overview.members_today)} joined today.`,
    },
    {
      key: 'posts',
      label: 'Posts',
      value: formatCount(overview.posts_total),
      tone: 'neutral',
      note:
        overview.posts_today === 0
          ? 'Nothing has been published today yet.'
          : `${String(overview.posts_today)} published today.`,
    },
    {
      key: 'reports',
      label: 'Open reports',
      value: formatCount(overview.open_reports),
      tone: triageTone(overview.open_reports, 10, 40),
      note:
        overview.open_reports === 0
          ? 'The moderation queue is clear.'
          : 'Mean time to resolution is on the Performance screen.',
    },
    {
      key: 'shops',
      label: 'Shops waiting',
      value: formatCount(overview.shops_pending),
      tone: triageTone(overview.shops_pending, 3, 10),
      note:
        overview.shops_pending === 0
          ? 'Every shop that asked has an answer.'
          : 'Approve or refuse them on the Approvals tab.',
    },
    {
      key: 'campaigns',
      label: 'Ads waiting',
      value: formatCount(overview.campaigns_pending),
      tone: triageTone(overview.campaigns_pending, 3, 10),
      note:
        overview.campaigns_pending === 0
          ? 'Every campaign has been reviewed.'
          : 'Approve or refuse them on the Approvals tab.',
    },
    {
      key: 'plugins',
      label: 'Plugins on',
      value: `${String(overview.plugins_enabled)} / ${String(overview.plugins_total)}`,
      tone: 'neutral',
      note:
        overview.plugins_total === 0
          ? 'No plugin is registered, which means the registry has not been seeded.'
          : 'Each one is a feature a member can see; the Config screen lists them.',
    },
  ];
}

/**
 * A count with a colour, from the two thresholds that matter.
 *
 * The thresholds are per queue because a queue of ten reports is a morning's work
 * and a queue of ten shops is a fortnight of somebody's business not starting.
 */
export function triageTone(count: number, warn: number, bad: number): Tile['tone'] {
  if (count >= bad) return 'bad';
  if (count >= warn) return 'warn';
  return 'ok';
}

/** Thousands separated, because a console is read at a glance. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return Math.trunc(value).toLocaleString('en-US');
}

/**
 * What an audit action means, in words rather than in dotted notation.
 *
 * The audit log stores `shop.approve`, `people.role`, `config.set`. An operator
 * reading an incident needs "Changed somebody's role", not a code they have to
 * look up — but the code is kept, because it is the stable half.
 */
export function describeAction(action: string): string {
  const known: Record<string, string> = {
    'shop.approve': 'Approved a shop',
    'shop.suspend': 'Suspended a shop',
    'campaign.approve': 'Approved an advertisement',
    'campaign.reject': 'Refused an advertisement',
    'people.role': "Changed somebody's role",
    'people.status': "Changed somebody's account status",
    'config.set': 'Changed a configuration value',
    'config.revert': 'Reverted a configuration value',
    'redirect.set': 'Set a redirect',
    'redirect.remove': 'Removed a redirect',
    'seo.set': 'Changed how a page is indexed',
    'seo.clear': 'Reset a page to the site default',
    'brand.save': 'Changed the brand palette',
    'brand.activate': 'Activated a brand theme',
    'plugin.enable': 'Switched a plugin on',
    'plugin.disable': 'Switched a plugin off',
    'notice.publish': 'Published a notice',
    'notice.archive': 'Archived a notice',
    'error.resolve': 'Closed a client error',
    'incident.open': 'Opened an incident',
    'incident.resolve': 'Resolved an incident',
    'ip.rule': 'Changed an IP rule',
    'certificate.issue': 'Issued a certificate',
    'certificate.revoke': 'Revoked a certificate',
    'staff.provisioned': 'A staff account was given its first profile row',
    'staff.role_reconciled': "A staff account's role was raised to match its sign-in token",
  };
  if (action in known) return known[action] ?? action;
  // An action a newer deployment writes before this console knows about it is
  // shown as written rather than hidden: an unfamiliar line in an audit trail is
  // information, and an empty one is not.
  return action.replace(/[._]/g, ' ').replace(/^./, (first) => first.toUpperCase());
}

/**
 * Group an audit trail by the day it happened.
 *
 * Reading an incident means reading one afternoon, not a flat list of two hundred
 * changes, and the day is the boundary an operator already thinks in.
 */
export function groupByDay(
  rows: readonly AuditRow[],
  timeZone = 'Asia/Dhaka',
): readonly { readonly day: string; readonly rows: readonly AuditRow[] }[] {
  const groups = new Map<string, AuditRow[]>();
  for (const row of rows) {
    const day = dayOf(row.created_at, timeZone);
    const bucket = groups.get(day);
    if (bucket) bucket.push(row);
    else groups.set(day, [row]);
  }
  return [...groups.entries()]
    .sort((left, right) => (left[0] < right[0] ? 1 : left[0] > right[0] ? -1 : 0))
    .map(([day, items]) => ({ day, rows: items }));
}

/** `YYYY-MM-DD` in the community's own time zone, not the browser's. */
export function dayOf(iso: string, timeZone = 'Asia/Dhaka'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** What a metadata blob says, flattened into one readable line. */
export function describeMetadata(metadata: Record<string, unknown> | null): string {
  if (metadata === null) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined || value === '') continue;
    const rendered =
      typeof value === 'object'
        ? JSON.stringify(value)
        : String(value as string | number | boolean);
    parts.push(`${key}: ${rendered}`);
    if (parts.length === 4) break;
  }
  return parts.join(' · ');
}
