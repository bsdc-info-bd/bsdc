-- Accurate app-wide performance percentiles, permissioned PDF receipts, and
-- the frozen certificate body for reprinting. A QR receipt stores a hash of the
-- *whole normalized PDF*, not the private metrics inside it.
set search_path = public, bsdc, extensions, pg_temp;

-- Percentiles cannot be averaged across routes. Compute them over the actual
-- observations, independently for each metric and the selected application.
create or replace function public.performance_vitals_overall(
  p_days integer default 28,
  p_app text default 'main-site'
)
returns table (metric text, samples integer, p75 numeric, p95 numeric)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.read');
  return query
  select v.metric::text,
         count(*)::integer,
         round(percentile_cont(0.75) within group (order by v.value)::numeric, 3),
         round(percentile_cont(0.95) within group (order by v.value)::numeric, 3)
  from public.web_vitals v
  where v.app = coalesce(nullif(btrim(p_app), ''), 'main-site')
    and v.recorded_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 28), 180)))
  group by v.metric
  order by v.metric::text;
end;
$$;

-- Unlike the original all-application edge board, a report can attribute edge
-- timings to the app actually recorded by record_edge_timing.
create or replace function public.performance_edge_for_app(
  p_days integer default 7,
  p_app text default 'main-site'
)
returns table (endpoint text, calls integer, p50 numeric, p95 numeric, error_rate numeric)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.read');
  return query
  select t.endpoint, count(*)::integer,
         round(percentile_cont(0.50) within group (order by t.duration_ms)::numeric, 1),
         round(percentile_cont(0.95) within group (order by t.duration_ms)::numeric, 1),
         round(100.0 * count(*) filter (where t.status >= 500) / nullif(count(*), 0), 2)
  from public.edge_timings t
  where t.app = coalesce(nullif(btrim(p_app), ''), 'main-site')
    and t.recorded_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
  group by t.endpoint
  order by 5 desc nulls last, 2 desc;
end;
$$;

-- CI uses the actual PostgREST service role; it has no staff profile. Check
-- the role set by PostgREST, not a client-supplied role string in the payload.
-- Human callers still need settings.write. This repairs the formerly silent
-- CI failure without granting ordinary members a write path.
create or replace function public.record_bundle_size(
  p_app text, p_bytes_gzip integer, p_commit_sha text default '', p_budget_gzip integer default 256000
)
returns public.bundle_sizes
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.bundle_sizes;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    perform bsdc.require_permission('settings.write');
  end if;
  insert into public.bundle_sizes (app, bytes_gzip, commit_sha, budget_gzip)
  values (btrim(p_app), p_bytes_gzip, left(coalesce(p_commit_sha, ''), 40), coalesce(p_budget_gzip, 256000))
  returning * into v_row;
  return v_row;
end;
$$;

-- The registry is not a report store. Its public response contains only the
-- report's title, app, period, timestamp, sections and SHA-256 fingerprint.
-- The selected measurements and any private note remain solely in the PDF.
create table if not exists public.performance_report_receipts (
  id uuid primary key default gen_random_uuid(),
  created_by text not null references public.profiles(uid),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  app text not null check (char_length(app) between 2 and 40),
  days integer not null check (days between 1 and 90),
  title text not null check (char_length(title) between 3 and 100),
  sections text[] not null,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  check ((sha256 is null and finalized_at is null) or (sha256 is not null and finalized_at is not null))
);
alter table public.performance_report_receipts enable row level security;
-- Explicitly deny direct access in addition to revoking grants. The definer
-- functions are the only staff/public interfaces to this registry.
drop policy if exists performance_report_receipts_no_direct_access on public.performance_report_receipts;
create policy performance_report_receipts_no_direct_access on public.performance_report_receipts
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.performance_report_receipts from public, anon, authenticated;

create or replace function public.start_performance_report(
  p_app text, p_days integer, p_title text, p_sections text[]
)
returns table (receipt_id uuid, generated_at timestamptz)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  perform bsdc.require_permission('performance.read');
  if p_app is null or btrim(p_app) !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'Choose a valid application' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'The report window must be between 1 and 90 days' using errcode = '22023';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 3 and 100 then
    raise exception 'The report title must be 3 to 100 characters' using errcode = '22023';
  end if;
  if p_sections is null or cardinality(p_sections) < 1 or cardinality(p_sections) > 7
     or exists (select 1 from unnest(p_sections) as section
                where section is null or section not in ('overall', 'routes', 'trend', 'edge', 'errors', 'bundle', 'forecast')) then
    raise exception 'Choose at least one supported report section' using errcode = '22023';
  end if;
  return query
  insert into public.performance_report_receipts as r (created_by, app, days, title, sections)
  values (v_uid, btrim(p_app), p_days, btrim(p_title), p_sections)
  returning r.id, r.created_at;
end;
$$;

-- Only the original authorized issuer may finalize, once, while the request is
-- fresh. Merely allocating an ID never makes a report publicly verifiable.
create or replace function public.finalize_performance_report(p_id uuid, p_sha256 text)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.read');
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The report fingerprint must be a lowercase SHA-256 digest' using errcode = '22023';
  end if;
  update public.performance_report_receipts r
     set sha256 = p_sha256, finalized_at = now()
   where r.id = p_id and r.created_by = bsdc.current_uid()
     and r.sha256 is null and r.created_at >= now() - interval '1 hour';
  if not found then
    raise exception 'The report is not pending for this issuer or has expired' using errcode = 'P0002';
  end if;
  perform bsdc.audit('performance.report.finalize', 'performance_report', p_id::text,
                     jsonb_build_object('sha256', p_sha256));
  return true;
end;
$$;

-- The unguessable UUID is the lookup key. There is no listing endpoint and no
-- report data in this result; pending and unknown IDs both return no row.
create or replace function public.verify_performance_report(p_id uuid)
returns table (
  receipt_id uuid, app text, days integer, title text, sections text[],
  generated_at timestamptz, sha256 text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select r.id, r.app, r.days, r.title, r.sections, r.created_at, r.sha256
  from public.performance_report_receipts r
  where r.id = p_id and r.sha256 is not null and r.finalized_at is not null;
$$;

-- Reprints must use the issued body, not the shorter registry list's subject.
create or replace function public.certificate_for_print(p_code text)
returns table (
  code text, template_key text, recipient_name text, subject text, body text,
  issued_on date, expires_on date, status bsdc_doc_status
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('certificates.issue');
  return query
  select c.code, c.template_key, c.recipient_name, c.subject, c.body,
         c.issued_on, c.expires_on, c.status
  from public.issued_certificates c
  where c.code = upper(btrim(coalesce(p_code, '')));
end;
$$;

revoke all on function public.record_bundle_size(text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.performance_vitals_overall(integer, text) from public, anon, authenticated;
revoke all on function public.performance_edge_for_app(integer, text) from public, anon, authenticated;
revoke all on function public.start_performance_report(text, integer, text, text[]) from public, anon, authenticated;
revoke all on function public.finalize_performance_report(uuid, text) from public, anon, authenticated;
revoke all on function public.verify_performance_report(uuid) from public, anon, authenticated;
revoke all on function public.certificate_for_print(text) from public, anon, authenticated;
grant execute on function public.record_bundle_size(text, integer, text, integer) to authenticated, service_role;
grant execute on function public.performance_vitals_overall(integer, text) to authenticated, service_role;
grant execute on function public.performance_edge_for_app(integer, text) to authenticated, service_role;
grant execute on function public.start_performance_report(text, integer, text, text[]) to authenticated, service_role;
grant execute on function public.finalize_performance_report(uuid, text) to authenticated, service_role;
grant execute on function public.verify_performance_report(uuid) to anon, authenticated, service_role;
grant execute on function public.certificate_for_print(text) to authenticated, service_role;
