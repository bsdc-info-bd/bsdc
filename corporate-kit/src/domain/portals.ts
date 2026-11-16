import { roleRank } from './staff';

export type PortalCategory =
  'command' | 'trust' | 'people' | 'platform' | 'content' | 'security' | 'comms' | 'public';

export type PortalIconKey =
  | 'command'
  | 'shield'
  | 'award'
  | 'megaphone'
  | 'users'
  | 'directory'
  | 'sliders'
  | 'layers'
  | 'network'
  | 'activity'
  | 'chat'
  | 'status'
  | 'verify'
  | 'globe';

export interface PortalEntry {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly category: PortalCategory;
  readonly minRole: 'public' | 'moderator' | 'manager' | 'admin' | 'owner';
  readonly prodUrl: string;
  readonly devPort: number;
  readonly shortcut: string;
  readonly icon: PortalIconKey;
  readonly keywords: readonly string[];
}

export const PORTAL_CATEGORY_LABELS: Readonly<Record<PortalCategory, string>> = {
  command: 'Operations & CLI',
  trust: 'Trust & Authority',
  people: 'Identity & Staff',
  security: 'Network Security',
  platform: 'Runtime & Telemetry',
  content: 'Publishing & Notices',
  comms: 'Communications',
  public: 'Public & Community',
};

export const PORTALS: readonly PortalEntry[] = [
  {
    id: 'bsdc-admin',
    name: 'Operations & CLI Admin',
    shortName: 'Operations Admin',
    description: 'Telemetry, bulk approvals, CLI command deck, SEO, redirects, and branding.',
    category: 'command',
    minRole: 'manager',
    prodUrl: 'https://admin.corporate.main.bsdc.info.bd',
    devPort: 5191,
    shortcut: 'g a',
    icon: 'command',
    keywords: [
      'admin',
      'cli',
      'terminal',
      'bulk',
      'seo',
      'brand',
      'approvals',
      'campaigns',
      'audit',
    ],
  },
  {
    id: 'bsdc-mod',
    name: 'Moderation & Safety',
    shortName: 'Moderation',
    description:
      'Severity-ranked moderation queue, SLA triage, bulk resolution, and pattern signals.',
    category: 'trust',
    minRole: 'moderator',
    prodUrl: 'https://moderator.corporate.bsdc.info.bd',
    devPort: 5193,
    shortcut: 'g m',
    icon: 'shield',
    keywords: ['reports', 'moderation', 'safety', 'abuse', 'spam', 'queue'],
  },
  {
    id: 'bsdc-cert',
    name: 'Certificate Authority',
    shortName: 'Certificates',
    description:
      'Issue, batch mint, edit with audit revisions, amend & reissue, and template studio.',
    category: 'trust',
    minRole: 'moderator',
    prodUrl: 'https://generate.certificate.main.bsdc.info.bd',
    devPort: 5190,
    shortcut: 'g e',
    icon: 'award',
    keywords: ['certificate', 'template', 'edit', 'amend', 'pdf', 'reissue', 'revoke'],
  },
  {
    id: 'bsdc-notice',
    name: 'Official Notices',
    shortName: 'Notices',
    description: 'Split-pane notice studio, revision history & revert, ack roster, and scheduling.',
    category: 'content',
    minRole: 'manager',
    prodUrl: 'https://notice.site.main.bsdc.info.bd',
    devPort: 5192,
    shortcut: 'g n',
    icon: 'megaphone',
    keywords: ['notice', 'announcement', 'ack', 'revision', 'publish', 'schedule'],
  },
  {
    id: 'bsdc-uadmin',
    name: 'User Governance',
    shortName: 'User Admin',
    description: 'Community roles, standing, bulk suspensions, staff records, and ID cards.',
    category: 'people',
    minRole: 'admin',
    prodUrl: 'https://users.admin.main.bsdc.info.bd',
    devPort: 5185,
    shortcut: 'g u',
    icon: 'users',
    keywords: ['users', 'roles', 'suspend', 'staff', 'cards', 'governance'],
  },
  {
    id: 'bsdc-umod',
    name: 'Staff Directory',
    shortName: 'Directory',
    description: 'Active staff roster, department directory, shifts, and card coverage audit.',
    category: 'people',
    minRole: 'moderator',
    prodUrl: 'https://users.moderator.bsdc.info.bd',
    devPort: 5184,
    shortcut: 'g s',
    icon: 'directory',
    keywords: ['staff', 'roster', 'shifts', 'department', 'tenure'],
  },
  {
    id: 'bsdc-config',
    name: 'Runtime Configuration',
    shortName: 'Config',
    description: 'Typed community parameters, feed weights, diffable history, and instant revert.',
    category: 'platform',
    minRole: 'admin',
    prodUrl: 'https://config.site.main.bsdc.info.bd',
    devPort: 5183,
    shortcut: 'g c',
    icon: 'sliders',
    keywords: ['config', 'settings', 'flags', 'weights', 'revert'],
  },
  {
    id: 'bsdc-custom',
    name: 'Page Composer',
    shortName: 'Custom Pages',
    description: 'Custom public page builder, ordered section blocks, and publication readiness.',
    category: 'content',
    minRole: 'admin',
    prodUrl: 'https://customize.site.main.bsdc.info.bd',
    devPort: 5186,
    shortcut: 'g p',
    icon: 'layers',
    keywords: ['pages', 'sections', 'hero', 'cms', 'publish'],
  },
  {
    id: 'bsdc-ip',
    name: 'IP Intelligence',
    shortName: 'IP Rules',
    description:
      'CIDR allow/block/watch policies, blast-radius simulator, and edge request activity.',
    category: 'security',
    minRole: 'moderator',
    prodUrl: 'https://ip.corporate.main.bsdc.info.bd',
    devPort: 5187,
    shortcut: 'g i',
    icon: 'network',
    keywords: ['ip', 'cidr', 'firewall', 'security', 'allowlist', 'block'],
  },
  {
    id: 'bsdc-perf',
    name: 'Performance & Errors',
    shortName: 'Performance',
    description:
      'Core Web Vitals p75/p95, edge latencies, browser error board, bundles, and signed PDFs.',
    category: 'platform',
    minRole: 'moderator',
    prodUrl: 'https://performance.site.main.bsdc.info.bd',
    devPort: 5182,
    shortcut: 'g f',
    icon: 'activity',
    keywords: ['vitals', 'lcp', 'inp', 'errors', 'bundle', 'latency', 'reports'],
  },
  {
    id: 'bsdc-connect',
    name: 'Staff Connect Chat',
    shortName: 'Connect',
    description: 'Role-gated staff coordination rooms backed by Postgres access + realtime stream.',
    category: 'comms',
    minRole: 'moderator',
    prodUrl: 'https://connect.live.chat.main.bsdc.info.bd',
    devPort: 5189,
    shortcut: 'g k',
    icon: 'chat',
    keywords: ['chat', 'channels', 'messages', 'realtime', 'incident'],
  },
  {
    id: 'bsdc-status',
    name: 'System Status',
    shortName: 'Status',
    description:
      '90-day uptime bars, service health, and public incident declaration & resolution.',
    category: 'public',
    minRole: 'public',
    prodUrl: 'https://status.site.main.bsdc.info.bd',
    devPort: 5188,
    shortcut: 'g t',
    icon: 'status',
    keywords: ['status', 'uptime', 'incidents', 'outage', 'health'],
  },
  {
    id: 'bsdc-vf',
    name: 'Trust Verification Desk',
    shortName: 'Verify',
    description:
      'Public cryptographic check-digit & registry desk for certificates, notices, IDs, and PDFs.',
    category: 'public',
    minRole: 'public',
    prodUrl: 'https://vf.main.bsdc.info.bd',
    devPort: 5181,
    shortcut: 'g v',
    icon: 'verify',
    keywords: ['verify', 'qr', 'sha256', 'certificate', 'notice', 'id'],
  },
  {
    id: 'main-site',
    name: 'BSDC Community',
    shortName: 'Main Site',
    description: 'Member-facing BSDC community application and internal /admin portal directory.',
    category: 'public',
    minRole: 'public',
    prodUrl: 'https://www.bsdc.info.bd',
    devPort: 5173,
    shortcut: 'g h',
    icon: 'globe',
    keywords: ['community', 'home', 'main', 'forum', 'marketplace'],
  },
];

const DEV_PORT_HOST = /^(\d+)-([a-z0-9-]+\.e2b\.app)$/i;

/**
 * Resolves the live target URL for cross-portal navigation:
 * - On localhost/127.0.0.1, targets that app's local dev port on the same origin scheme.
 * - On sandbox proxy domains (`<port>-<id>.e2b.app`), swaps the port prefix seamlessly.
 * - Everywhere else, uses the canonical `https://` production domain.
 */
export function resolvePortalHref(
  portal: Pick<PortalEntry, 'prodUrl' | 'devPort'>,
  locationLike?: { readonly protocol: string; readonly hostname: string } | null,
): string {
  const loc =
    locationLike !== undefined
      ? locationLike
      : typeof window !== 'undefined'
        ? window.location
        : null;
  if (!loc) return portal.prodUrl;

  const host = loc.hostname.toLowerCase();
  const proto = loc.protocol === 'https:' || loc.protocol === 'http:' ? loc.protocol : 'https:';
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${proto}//${host}:${String(portal.devPort)}`;
  }
  const e2bMatch = DEV_PORT_HOST.exec(host);
  if (e2bMatch) {
    return `https://${String(portal.devPort)}-${e2bMatch[2]}`;
  }
  return portal.prodUrl;
}

/** True when a signed-in user's role satisfies a portal's minimum rank (or portal is public). */
export function canAccessPortal(portal: PortalEntry, userRole: string | null | undefined): boolean {
  if (portal.minRole === 'public') return true;
  if (!userRole) return false;
  return roleRank(userRole) >= roleRank(portal.minRole);
}

/** Portals the active role may open, keeping canonical display order. */
export function accessiblePortals(userRole: string | null | undefined): readonly PortalEntry[] {
  return PORTALS.filter((portal) => canAccessPortal(portal, userRole));
}

/** Searches portals by name, shortName, category, id, or keywords. */
export function searchPortals(
  query: string,
  list: readonly PortalEntry[] = PORTALS,
): readonly PortalEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return list;
  return list.filter(
    (portal) =>
      portal.name.toLowerCase().includes(q) ||
      portal.shortName.toLowerCase().includes(q) ||
      portal.id.toLowerCase().includes(q) ||
      portal.description.toLowerCase().includes(q) ||
      portal.keywords.some((kw) => kw.includes(q)),
  );
}

/** Groups portals by category while preserving portal and category order. */
export function portalsByCategory(list: readonly PortalEntry[]): ReadonlyArray<{
  readonly category: PortalCategory;
  readonly label: string;
  readonly portals: readonly PortalEntry[];
}> {
  const order: PortalCategory[] = [
    'command',
    'trust',
    'content',
    'people',
    'security',
    'platform',
    'comms',
    'public',
  ];
  return order
    .map((category) => ({
      category,
      label: PORTAL_CATEGORY_LABELS[category],
      portals: list.filter((p) => p.category === category),
    }))
    .filter((group) => group.portals.length > 0);
}

/** Looks up a portal by its `appId`. */
export function portalById(appId: string): PortalEntry | undefined {
  return PORTALS.find((portal) => portal.id === appId);
}
