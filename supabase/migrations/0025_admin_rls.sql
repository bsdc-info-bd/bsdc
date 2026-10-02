-- ---------------------------------------------------------------------------
-- Row level security for the admin core.
--
-- The panel reads through security-definer functions that each check a
-- permission, so the tables themselves stay closed. What is granted directly
-- is deliberately small: a member may read the plugin catalogue and the
-- public settings, because the product's own code needs them, and nothing
-- else.
-- ---------------------------------------------------------------------------

alter table public.role_permissions    enable row level security;
alter table public.admin_settings      enable row level security;
alter table public.moderation_actions  enable row level security;
alter table public.audit_log           enable row level security;
alter table public.feature_flags       enable row level security;

-- ------------------------------- plugins -----------------------------------
-- Everyone may read which plugins are on: the client has to know whether to
-- render the messenger. Nobody may write one except through
-- set_plugin_enabled(), which enforces the dependency graph.
drop policy if exists feature_flags_read_all on public.feature_flags;
create policy feature_flags_read_all on public.feature_flags
  for select using (true);

revoke insert, update, delete on public.feature_flags from anon, authenticated;

-- ----------------------------- permissions ---------------------------------
-- The matrix is readable by staff so the panel can explain what a role can
-- do. It is written by migration only: a permission grant is a deployment
-- decision, not a runtime one.
drop policy if exists role_permissions_read_staff on public.role_permissions;
create policy role_permissions_read_staff on public.role_permissions
  for select using (bsdc.has_permission('people.read'));

revoke insert, update, delete on public.role_permissions from anon, authenticated;

-- ------------------------------- settings ----------------------------------
drop policy if exists admin_settings_read on public.admin_settings;
create policy admin_settings_read on public.admin_settings
  for select using (visibility = 'public' or bsdc.has_permission('settings.read'));

revoke insert, update, delete on public.admin_settings from anon, authenticated;

-- -------------------------- moderation actions -----------------------------
-- A moderator sees the history of decisions; the subject of a decision does
-- not get to edit it, and neither does the moderator who made it. A reversal
-- is a new row.
drop policy if exists moderation_actions_read on public.moderation_actions;
create policy moderation_actions_read on public.moderation_actions
  for select using (bsdc.has_permission('moderation.read'));

revoke insert, update, delete on public.moderation_actions from anon, authenticated;

-- ------------------------------- audit log ---------------------------------
-- Readable with audit.read. Writable by nobody at all: there is no insert,
-- update or delete policy, and bsdc.audit() writes as the definer. An owner
-- cannot quietly erase what they did.
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select using (bsdc.has_permission('audit.read'));

revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ------------------------------- profiles ----------------------------------
-- Role and account status are moved by set_user_role() and
-- set_account_status(), which refuse self-promotion and refuse to touch
-- anyone who outranks the caller. Revoking the columns is what makes those
-- functions the only path.
revoke update (role, status) on public.profiles from authenticated;

-- ------------------------------- reports -----------------------------------
-- A reporter may still file and read their own report; assignment and
-- resolution belong to the queue functions.
revoke update (status, handled_by, handled_at, assigned_to, resolution)
  on public.reports from authenticated;

grant select on public.feature_flags to anon, authenticated;
grant select on public.admin_settings to anon, authenticated;
grant select on public.role_permissions, public.moderation_actions, public.audit_log
  to authenticated;

grant execute on function public.plugin_registry() to authenticated;
grant execute on function public.set_plugin_enabled(text, boolean) to authenticated;
grant execute on function public.set_plugin_rollout(text, integer, text) to authenticated;
grant execute on function public.set_user_role(text, bsdc_role) to authenticated;
grant execute on function public.set_account_status(text, bsdc_account_status, text)
  to authenticated;
grant execute on function public.moderation_queue(text, integer) to authenticated;
grant execute on function public.claim_report(uuid) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_people(text, integer) to authenticated;
grant execute on function public.admin_audit(integer) to authenticated;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.set_admin_setting(text, jsonb) to authenticated;
