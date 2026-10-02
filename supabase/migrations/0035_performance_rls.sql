-- ---------------------------------------------------------------------------
-- Row level security for the performance tables.
--
-- These are the only tables in BSDC an anonymous browser contributes rows
-- to, and it does so through functions that clamp everything they are
-- given. Nobody — not even a signed-in member — can read them back without
-- the permission, because a list of which routes are slow for which
-- connection type in which country is operational information, not public
-- information.
-- ---------------------------------------------------------------------------

alter table public.web_vitals    enable row level security;
alter table public.client_errors enable row level security;
alter table public.edge_timings  enable row level security;
alter table public.bundle_sizes  enable row level security;

drop policy if exists web_vitals_read on public.web_vitals;
create policy web_vitals_read on public.web_vitals
  for select using (bsdc.has_permission('performance.read'));

drop policy if exists client_errors_read on public.client_errors;
create policy client_errors_read on public.client_errors
  for select using (bsdc.has_permission('performance.read'));

drop policy if exists edge_timings_read on public.edge_timings;
create policy edge_timings_read on public.edge_timings
  for select using (bsdc.has_permission('performance.read'));

drop policy if exists bundle_sizes_read on public.bundle_sizes;
create policy bundle_sizes_read on public.bundle_sizes
  for select using (bsdc.has_permission('performance.read'));

-- No insert, update or delete policy anywhere here. Everything arrives
-- through the ingest functions, which drop a value they cannot believe
-- rather than storing it and reporting it later as a fact.
revoke insert, update, delete on public.web_vitals    from anon, authenticated;
revoke insert, update, delete on public.client_errors from anon, authenticated;
revoke insert, update, delete on public.edge_timings  from anon, authenticated;
revoke insert, update, delete on public.bundle_sizes  from anon, authenticated;

-- The beacons. A browser may say how slow its own page was and what broke
-- in it; that is all. None of these functions returns a row, so none of them
-- can be used to read anything back.
grant execute on function public.record_vital(text, text, numeric, text, text, text, text)
  to anon, authenticated;
grant execute on function public.record_client_error(text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.record_edge_timing(text, integer, integer, text, text)
  to anon, authenticated;

-- The reports. Each one checks the permission inside itself as well, so a
-- direct PostgREST call is no shortcut around the console.
grant execute on function public.vitals_summary(integer, text) to authenticated;
grant execute on function public.vitals_trend(text, integer, text) to authenticated;
grant execute on function public.edge_latency(integer) to authenticated;
grant execute on function public.error_board(integer, boolean) to authenticated;
grant execute on function public.resolve_client_error(text) to authenticated;
grant execute on function public.bundle_history(text, integer) to authenticated;
grant execute on function public.capacity_forecast(integer) to authenticated;
grant execute on function public.record_bundle_size(text, integer, text, integer) to authenticated;

revoke execute on function public.vitals_summary(integer, text) from anon;
revoke execute on function public.vitals_trend(text, integer, text) from anon;
revoke execute on function public.edge_latency(integer) from anon;
revoke execute on function public.error_board(integer, boolean) from anon;
revoke execute on function public.resolve_client_error(text) from anon;
revoke execute on function public.bundle_history(text, integer) from anon;
revoke execute on function public.capacity_forecast(integer) from anon;
revoke execute on function public.record_bundle_size(text, integer, text, integer) from anon;
