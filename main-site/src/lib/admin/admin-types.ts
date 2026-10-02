import type {
  DbAccountStatus,
  DbModerationAction,
  DbReportStatus,
  DbRole,
} from '@/lib/supabase/types';

export type Role = DbRole;
export type AccountStatus = DbAccountStatus;
export type ReportStatus = DbReportStatus;
export type ModerationActionKind = DbModerationAction;

export interface Plugin {
  key: string;
  label: string;
  description: string;
  module: string;
  enabled: boolean;
  audience: string;
  isCore: boolean;
  dependsOn: string[];
  rolloutPercent: number;
  /** Dependencies that are currently off, straight from the database. */
  blockedBy: string[];
  updatedAt: string;
}

export interface AdminOverview {
  membersTotal: number;
  membersToday: number;
  postsTotal: number;
  postsToday: number;
  openReports: number;
  shopsPending: number;
  campaignsPending: number;
  pluginsEnabled: number;
  pluginsTotal: number;
}

export interface Person {
  uid: string;
  username: string | null;
  displayName: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
}

export interface QueuedReport {
  id: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  details: string;
  status: ReportStatus;
  reporterUid: string;
  assignedTo: string | null;
  resolution: string;
  reportCount: number;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  actorUid: string | null;
  action: string;
  subject: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Mirrors bsdc.role_rank(): a comparison between roles is a number. */
const RANK: Record<Role, number> = {
  member: 10,
  creator: 20,
  vendor: 30,
  moderator: 40,
  manager: 50,
  admin: 60,
  owner: 70,
};

export const ROLES: readonly Role[] = [
  'member',
  'creator',
  'vendor',
  'moderator',
  'manager',
  'admin',
  'owner',
] as const;

export function roleRank(role: Role): number {
  return RANK[role];
}

export function outranks(actor: Role, subject: Role): boolean {
  return RANK[actor] > RANK[subject];
}

/**
 * The roles one person may grant another. Mirrors set_user_role(): never
 * yourself, never at or above your own rank, never over someone who already
 * outranks you.
 */
export function assignableRoles(actorRole: Role, targetRole: Role): Role[] {
  if (!outranks(actorRole, targetRole)) return [];
  return ROLES.filter((role) => RANK[role] < RANK[actorRole] && role !== targetRole);
}

export function canChangeRole(actorRole: Role, actorUid: string, target: Person): boolean {
  if (actorUid === target.uid) return false;
  return assignableRoles(actorRole, target.role).length > 0;
}

export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: readonly string[],
  wanted: readonly string[],
): boolean {
  return wanted.some((permission) => permissions.includes(permission));
}

/** A plugin is only truly on when its own switch and every dependency are. */
export function isPluginActive(plugin: Plugin): boolean {
  return plugin.enabled && plugin.blockedBy.length === 0 && plugin.rolloutPercent > 0;
}

/** What switching a plugin off would take with it, computed over the graph. */
export function cascadeOff(plugins: readonly Plugin[], key: string): string[] {
  const affected = new Set<string>();
  let frontier = [key];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const plugin of plugins) {
      if (affected.has(plugin.key) || plugin.key === key || !plugin.enabled) continue;
      if (plugin.dependsOn.some((dependency) => frontier.includes(dependency))) {
        affected.add(plugin.key);
        next.push(plugin.key);
      }
    }
    frontier = next;
  }

  return [...affected].sort((a, b) => a.localeCompare(b));
}

/** Dependencies that must be switched on first, in the order to do it. */
export function missingDependencies(plugins: readonly Plugin[], key: string): string[] {
  const byKey = new Map(plugins.map((plugin) => [plugin.key, plugin]));
  const plugin = byKey.get(key);
  if (plugin === undefined) return [];
  return plugin.dependsOn.filter((dependency) => byKey.get(dependency)?.enabled !== true);
}

/** A core plugin's switch does not move, whatever the screen offers. */
export function canToggle(plugin: Plugin, enable: boolean): boolean {
  if (plugin.isCore && !enable) return false;
  if (enable && plugin.blockedBy.length > 0) return false;
  return true;
}

export function groupByModule(plugins: readonly Plugin[]): [string, Plugin[]][] {
  const modules = new Map<string, Plugin[]>();
  for (const plugin of plugins) {
    const bucket = modules.get(plugin.module);
    if (bucket === undefined) modules.set(plugin.module, [plugin]);
    else bucket.push(plugin);
  }
  return [...modules.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Stable bucketing for a percentage rollout: the same member always lands in
 * the same bucket for the same plugin, so a feature does not flicker between
 * reloads. A 32-bit FNV-1a hash is enough and needs no dependency.
 */
export function rolloutBucket(uid: string, key: string): number {
  let hash = 0x811c9dc5;
  const input = `${key}:${uid}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function isPluginVisibleTo(
  plugin: Plugin,
  viewer: { uid: string | null; staff: boolean; vendor: boolean },
): boolean {
  if (!isPluginActive(plugin)) return false;
  if (plugin.audience === 'staff' || plugin.audience === 'beta') return viewer.staff;
  if (plugin.audience === 'vendor') return viewer.vendor || viewer.staff;
  if (plugin.rolloutPercent >= 100) return true;
  if (viewer.uid === null) return false;
  return rolloutBucket(viewer.uid, plugin.key) < plugin.rolloutPercent;
}

/** The moderation outcomes a report may be closed with. */
export const RESOLUTIONS: readonly ModerationActionKind[] = [
  'dismiss',
  'warn',
  'hide_content',
  'restore_content',
] as const;

export function resolutionNeedsPermission(action: ModerationActionKind): string | null {
  return action === 'hide_content' || action === 'restore_content' ? 'content.hide' : null;
}

export function canResolve(permissions: readonly string[], action: ModerationActionKind): boolean {
  if (!hasPermission(permissions, 'moderation.resolve')) return false;
  const needed = resolutionNeedsPermission(action);
  return needed === null || hasPermission(permissions, needed);
}

/** A report already claimed by somebody else is not yours to close. */
export function canClaim(report: QueuedReport, uid: string): boolean {
  return report.status === 'open' && (report.assignedTo === null || report.assignedTo === uid);
}

/** Reports about the same subject, counted together and ordered by weight. */
export function sortQueue(reports: readonly QueuedReport[]): QueuedReport[] {
  return [...reports].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.reportCount !== b.reportCount) return b.reportCount - a.reportCount;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
