import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  AdminOverviewRow,
  AdminPersonRow,
  AuditEntryRow,
  ModerationQueueRow,
  PluginRow,
} from '@/lib/supabase/types';
import type {
  AccountStatus,
  AdminOverview,
  AuditEntry,
  ModerationActionKind,
  Person,
  Plugin,
  QueuedReport,
  ReportStatus,
  Role,
} from './admin-types';

function toPlugin(row: PluginRow): Plugin {
  return {
    key: row.key,
    label: row.label.length > 0 ? row.label : row.key,
    description: row.description,
    module: row.module,
    enabled: row.enabled,
    audience: row.audience,
    isCore: row.is_core,
    dependsOn: row.depends_on,
    rolloutPercent: row.rollout_percent,
    blockedBy: row.blocked_by,
    updatedAt: row.updated_at,
  };
}

export async function fetchPlugins(): Promise<Plugin[]> {
  const { data, error } = await getSupabase().rpc('plugin_registry').returns<PluginRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toPlugin);
}

export async function setPluginEnabled(key: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('set_plugin_enabled', {
    p_key: key,
    p_enabled: enabled,
  });
  if (error) throw toDataError(error);
  return data === true;
}

export async function setPluginRollout(key: string, percent: number): Promise<number> {
  const { data, error } = await getSupabase().rpc('set_plugin_rollout', {
    p_key: key,
    p_percent: percent,
  });
  if (error) throw toDataError(error);
  return data ?? percent;
}

export async function fetchPermissions(): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('my_permissions');
  if (error) throw toDataError(error);
  return data ?? [];
}

export async function fetchOverview(): Promise<AdminOverview | null> {
  const { data, error } = await getSupabase().rpc('admin_overview').returns<AdminOverviewRow[]>();
  if (error) throw toDataError(error);
  const row = (data ?? [])[0];
  if (row === undefined) return null;
  return {
    membersTotal: row.members_total,
    membersToday: row.members_today,
    postsTotal: row.posts_total,
    postsToday: row.posts_today,
    openReports: row.open_reports,
    shopsPending: row.shops_pending,
    campaignsPending: row.campaigns_pending,
    pluginsEnabled: row.plugins_enabled,
    pluginsTotal: row.plugins_total,
  };
}

export async function fetchPeople(search: string, limit = 50): Promise<Person[]> {
  const { data, error } = await getSupabase()
    .rpc('admin_people', { p_search: search, p_limit: limit })
    .returns<AdminPersonRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function setUserRole(uid: string, role: Role): Promise<Role> {
  const { data, error } = await getSupabase().rpc('set_user_role', { p_uid: uid, p_role: role });
  if (error) throw toDataError(error);
  return data;
}

export async function setAccountStatus(
  uid: string,
  status: AccountStatus,
  reason: string,
): Promise<AccountStatus> {
  const { data, error } = await getSupabase().rpc('set_account_status', {
    p_uid: uid,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function fetchQueue(status = 'open', limit = 50): Promise<QueuedReport[]> {
  const { data, error } = await getSupabase()
    .rpc('moderation_queue', { p_status: status, p_limit: limit })
    .returns<ModerationQueueRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporterUid: row.reporter_uid,
    assignedTo: row.assigned_to,
    resolution: row.resolution,
    reportCount: row.report_count,
    createdAt: row.created_at,
  }));
}

export async function claimReport(reportId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('claim_report', { p_report_id: reportId });
  if (error) throw toDataError(error);
  return data;
}

export async function resolveReport(
  reportId: string,
  action: ModerationActionKind,
  reason: string,
): Promise<ReportStatus> {
  const { data, error } = await getSupabase().rpc('resolve_report', {
    p_report_id: reportId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function fetchAudit(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await getSupabase()
    .rpc('admin_audit', { p_limit: limit })
    .returns<AuditEntryRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    actorUid: row.actor_uid,
    action: row.action,
    subject: row.subject,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}
