-- ---------------------------------------------------------------------------
-- Row level security for analytics and reports.
--
-- Analytics is read through definer functions that each check a permission,
-- so there is nothing here for a member to query directly. Snapshots are
-- readable by the people who may read the audit log, and they are immutable:
-- a report that could be edited after the fact is not a report.
-- ---------------------------------------------------------------------------

alter table public.report_snapshots enable row level security;

drop policy if exists report_snapshots_read on public.report_snapshots;
create policy report_snapshots_read on public.report_snapshots
  for select using (bsdc.has_permission('audit.read'));

-- No insert, update or delete policy. create_report_snapshot() writes as the
-- definer after checking the permission, and nothing rewrites a snapshot:
-- re-running a report produces a new row with its own timestamp, so the
-- figures reported in March still read as they did in March.
revoke insert, update, delete on public.report_snapshots from anon, authenticated;

grant select on public.report_snapshots to authenticated;

grant execute on function public.analytics_growth(integer) to authenticated;
grant execute on function public.analytics_revenue(integer) to authenticated;
grant execute on function public.analytics_moderation(integer) to authenticated;
grant execute on function public.analytics_retention(integer) to authenticated;
grant execute on function public.analytics_top_content(integer, integer) to authenticated;
grant execute on function public.create_report_snapshot(bsdc_report_kind, text, integer)
  to authenticated;
grant execute on function public.report_snapshots_list(integer) to authenticated;
grant execute on function public.report_snapshot(uuid) to authenticated;
