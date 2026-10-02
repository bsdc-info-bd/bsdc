-- ---------------------------------------------------------------------------
-- Performance: what the site is actually like to use.
--
-- Laboratory numbers describe one machine on one network. These tables hold
-- what happened on real devices, on real connections, in Bangladesh, which
-- is a different story and the only one worth acting on.
--
-- The rules kept by Postgres rather than by any screen:
--   1. A measurement is attached to a route, never to a person. There is no
--      user column here and no session identifier, so the performance
--      console cannot become a surveillance console.
--   2. A URL with an identifier in it is not a route. Paths are reduced to
--      their pattern before they are stored, or every post would be its own
--      row and no page would ever have enough samples to judge.
--   3. Speed is reported at the 75th percentile, never as an average. An
--      average is dragged down by the fast half of the audience; the
--      percentile is a promise about a person.
--   4. A day with no traffic is a day with no traffic. Series are generated
--      from the calendar and left-joined, so a gap looks like a gap.
--   5. Nothing writes here directly. Ingestion is a function that clamps
--      what it is given, because this is the one set of tables an anonymous
--      browser is allowed to add rows to.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_vital') then
    create type bsdc_vital as enum ('LCP', 'INP', 'CLS', 'FCP', 'TTFB');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_device') then
    create type bsdc_device as enum ('mobile', 'tablet', 'desktop');
  end if;
end;
$$;

-- ===========================================================================
-- 0. A route, not a URL
-- ===========================================================================
-- /p/why-rust-is-nice and /p/a-note-on-dhaka are one page as far as speed is
-- concerned. Identifiers are replaced by their placeholder so the samples
-- land together; without this, every post has three samples and nothing can
-- be said about any of them.
create or replace function bsdc.route_pattern(p_path text)
returns text
language sql
immutable
as $$
  select case
    when v.path = '' then '/'
    else v.path
  end
  from (
    select regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            rtrim(lower(split_part(split_part(coalesce(p_path, '/'), '#', 1), '?', 1)), '/'),
            '/@[^/]+', '/@:username', 'g'
          ),
          '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/:id', 'g'
        ),
        '^/(p|g|shop|learn|jobs|events|freelance|projects|messages|tag)/[^/]+',
        '/\1/:slug'
      ),
      '/[0-9]{2,}', '/:n', 'g'
    ) as path
  ) v;
$$;

comment on function bsdc.route_pattern(text) is
  'Reduces a URL to the page it belongs to, so measurements of one page land together.';

-- ===========================================================================
-- 1. Field measurements
-- ===========================================================================
create table if not exists public.web_vitals (
  id          bigserial primary key,
  recorded_at timestamptz not null default now(),
  app         text not null default 'main-site' check (char_length(app) between 2 and 40),
  route       text not null check (char_length(route) <= 200),
  metric      bsdc_vital not null,
  -- Milliseconds for every metric except CLS, which is a unitless score.
  value       numeric(10, 3) not null check (value >= 0 and value <= 600000),
  device      bsdc_device not null default 'mobile',
  connection  text not null default '' check (char_length(connection) <= 12),
  country     text not null default '' check (char_length(country) <= 2),
  build       text not null default '' check (char_length(build) <= 40)
);

create index if not exists web_vitals_day_idx on public.web_vitals (recorded_at desc);
create index if not exists web_vitals_route_idx on public.web_vitals (metric, route, recorded_at desc);

comment on table public.web_vitals is
  'Core Web Vitals from real devices. No user column exists here, by design.';

-- ===========================================================================
-- 2. What broke, in the browser
-- ===========================================================================
create table if not exists public.client_errors (
  fingerprint text primary key,
  app         text not null default 'main-site',
  name        text not null default 'Error' check (char_length(name) <= 80),
  message     text not null check (char_length(message) <= 300),
  route       text not null default '/' check (char_length(route) <= 200),
  build       text not null default '',
  occurrences integer not null default 1 check (occurrences > 0),
  users_hint  integer not null default 0 check (users_hint >= 0),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  is_resolved boolean not null default false,
  resolved_by text references public.profiles (uid) on delete set null
);

create index if not exists client_errors_recent_idx
  on public.client_errors (is_resolved, last_seen desc);

-- ===========================================================================
-- 3. How long the edge took
-- ===========================================================================
create table if not exists public.edge_timings (
  id          bigserial primary key,
  recorded_at timestamptz not null default now(),
  app         text not null default 'main-site',
  endpoint    text not null check (char_length(endpoint) <= 120),
  status      smallint not null check (status between 100 and 599),
  duration_ms integer not null check (duration_ms between 0 and 120000),
  colo        text not null default '' check (char_length(colo) <= 8)
);

create index if not exists edge_timings_day_idx on public.edge_timings (recorded_at desc);

-- ===========================================================================
-- 4. What the build weighed
-- ===========================================================================
-- Written by continuous integration after a successful build. A regression
-- in bundle size is the cause of a regression in field performance three
-- weeks later, so the two are kept in the same place.
create table if not exists public.bundle_sizes (
  id          bigserial primary key,
  recorded_at timestamptz not null default now(),
  app         text not null check (char_length(app) between 2 and 40),
  commit_sha  text not null default '' check (char_length(commit_sha) <= 40),
  bytes_gzip  integer not null check (bytes_gzip > 0),
  budget_gzip integer not null default 256000 check (budget_gzip > 0)
);

create index if not exists bundle_sizes_app_idx on public.bundle_sizes (app, recorded_at desc);

-- ===========================================================================
-- 5. Ingestion
-- ===========================================================================
-- The one door an anonymous browser may write through. It clamps everything
-- it is given: a metric it does not know is dropped, a value outside the
-- plausible range is dropped, and the route is reduced to its pattern. A
-- beacon is fire-and-forget, so it must never be able to cause an error that
-- a page would have to handle.
create or replace function public.record_vital(
  p_route text,
  p_metric text,
  p_value numeric,
  p_device text default 'mobile',
  p_connection text default '',
  p_build text default '',
  p_app text default 'main-site'
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_metric bsdc_vital;
  v_device bsdc_device;
begin
  begin
    v_metric := upper(btrim(p_metric))::bsdc_vital;
  exception when others then
    return;
  end;

  begin
    v_device := lower(btrim(coalesce(p_device, 'mobile')))::bsdc_device;
  exception when others then
    v_device := 'mobile';
  end;

  if p_value is null or p_value < 0 then return; end if;
  -- CLS is a score, not a duration; anything above 10 is a broken reading.
  if v_metric = 'CLS' and p_value > 10 then return; end if;
  if v_metric <> 'CLS' and p_value > 600000 then return; end if;

  insert into public.web_vitals (app, route, metric, value, device, connection, build)
  values (
    left(coalesce(nullif(btrim(p_app), ''), 'main-site'), 40),
    left(bsdc.route_pattern(p_route), 200),
    v_metric,
    round(p_value, 3),
    v_device,
    left(coalesce(p_connection, ''), 12),
    left(coalesce(p_build, ''), 40)
  );
end;
$$;

-- Errors are grouped by fingerprint rather than listed one by one: a hundred
-- copies of one broken component is one piece of work, and a list that shows
-- it a hundred times hides the other nine problems.
create or replace function public.record_client_error(
  p_fingerprint text,
  p_name text,
  p_message text,
  p_route text,
  p_build text default '',
  p_app text default 'main-site'
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if coalesce(btrim(p_fingerprint), '') = '' then return; end if;

  insert into public.client_errors (fingerprint, app, name, message, route, build)
  values (
    left(btrim(p_fingerprint), 64),
    left(coalesce(nullif(btrim(p_app), ''), 'main-site'), 40),
    left(coalesce(nullif(btrim(p_name), ''), 'Error'), 80),
    left(coalesce(p_message, ''), 300),
    left(bsdc.route_pattern(p_route), 200),
    left(coalesce(p_build, ''), 40)
  )
  on conflict (fingerprint) do update
    set occurrences = public.client_errors.occurrences + 1,
        last_seen   = now(),
        route       = excluded.route,
        build       = excluded.build,
        -- A fault that returns after somebody closed it is not closed.
        is_resolved = false;
end;
$$;

create or replace function public.record_edge_timing(
  p_endpoint text,
  p_status integer,
  p_duration_ms integer,
  p_colo text default '',
  p_app text default 'main-site'
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 120000 then return; end if;
  if p_status is null or p_status < 100 or p_status > 599 then return; end if;

  insert into public.edge_timings (app, endpoint, status, duration_ms, colo)
  values (
    left(coalesce(nullif(btrim(p_app), ''), 'main-site'), 40),
    left(bsdc.route_pattern(p_endpoint), 120),
    p_status,
    p_duration_ms,
    left(coalesce(p_colo, ''), 8)
  );
end;
$$;

create or replace function public.record_bundle_size(
  p_app text,
  p_bytes_gzip integer,
  p_commit_sha text default '',
  p_budget_gzip integer default 256000
)
returns public.bundle_sizes
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_row public.bundle_sizes;
begin
  perform bsdc.require_permission('settings.write');
  insert into public.bundle_sizes (app, bytes_gzip, commit_sha, budget_gzip)
  values (btrim(p_app), p_bytes_gzip, left(coalesce(p_commit_sha, ''), 40),
          coalesce(p_budget_gzip, 256000))
  returning * into v_row;
  return v_row;
end;
$$;

-- ===========================================================================
-- 6. Reading it back
-- ===========================================================================
-- The 75th percentile, per route and metric, with the sample count beside it
-- so nobody acts on three measurements. A route with fewer than twenty
-- samples is reported as such rather than hidden: absence of data about the
-- checkout page is itself worth seeing.
create or replace function public.vitals_summary(
  p_days integer default 28,
  p_app text default 'main-site'
)
returns table (
  route    text,
  metric   text,
  samples  integer,
  p75      numeric,
  p95      numeric,
  rating   text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with window_rows as (
    select v.route, v.metric, v.value
    from public.web_vitals v
    where v.recorded_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 28), 180)))
      and v.app = coalesce(nullif(p_app, ''), 'main-site')
      and bsdc.has_permission('performance.read')
  ),
  rolled as (
    select
      w.route,
      w.metric::text as metric,
      count(*)::integer as samples,
      round(percentile_cont(0.75) within group (order by w.value)::numeric, 3) as p75,
      round(percentile_cont(0.95) within group (order by w.value)::numeric, 3) as p95
    from window_rows w
    group by w.route, w.metric
  )
  select
    r.route,
    r.metric,
    r.samples,
    r.p75,
    r.p95,
    -- The same thresholds the console uses, kept here so a report produced
    -- by a script and a screen read by a person cannot disagree.
    case r.metric
      when 'LCP'  then case when r.p75 <= 2500 then 'good' when r.p75 <= 4000 then 'fair' else 'poor' end
      when 'INP'  then case when r.p75 <= 200  then 'good' when r.p75 <= 500  then 'fair' else 'poor' end
      when 'CLS'  then case when r.p75 <= 0.1  then 'good' when r.p75 <= 0.25 then 'fair' else 'poor' end
      when 'FCP'  then case when r.p75 <= 1800 then 'good' when r.p75 <= 3000 then 'fair' else 'poor' end
      when 'TTFB' then case when r.p75 <= 800  then 'good' when r.p75 <= 1800 then 'fair' else 'poor' end
      else 'unknown'
    end as rating
  from rolled r
  order by r.metric, r.p75 desc;
$$;

-- One metric over time, with every day present whether or not anybody
-- visited. The device split is returned alongside, because a site that is
-- fine on a laptop and painful on a phone averages out to "acceptable".
create or replace function public.vitals_trend(
  p_metric text default 'LCP',
  p_days integer default 28,
  p_app text default 'main-site'
)
returns table (day date, samples integer, p75 numeric, mobile_p75 numeric, desktop_p75 numeric)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    d.day,
    coalesce(count(v.id), 0)::integer,
    round(percentile_cont(0.75) within group (order by v.value)::numeric, 3),
    round(percentile_cont(0.75) within group (
      order by case when v.device = 'mobile' then v.value end)::numeric, 3),
    round(percentile_cont(0.75) within group (
      order by case when v.device = 'desktop' then v.value end)::numeric, 3)
  from bsdc.day_series(greatest(1, least(coalesce(p_days, 28), 180))) d
  left join public.web_vitals v
    on v.recorded_at::date = d.day
   and v.metric = upper(coalesce(nullif(p_metric, ''), 'LCP'))::bsdc_vital
   and v.app = coalesce(nullif(p_app, ''), 'main-site')
  where bsdc.has_permission('performance.read')
  group by d.day
  order by d.day;
$$;

create or replace function public.edge_latency(p_days integer default 7)
returns table (endpoint text, calls integer, p50 numeric, p95 numeric, error_rate numeric)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    t.endpoint,
    count(*)::integer,
    round(percentile_cont(0.50) within group (order by t.duration_ms)::numeric, 1),
    round(percentile_cont(0.95) within group (order by t.duration_ms)::numeric, 1),
    round(100.0 * count(*) filter (where t.status >= 500) / nullif(count(*), 0), 2)
  from public.edge_timings t
  where t.recorded_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
    and bsdc.has_permission('performance.read')
  group by t.endpoint
  order by 5 desc nulls last, 2 desc;
$$;

create or replace function public.error_board(
  p_days integer default 7,
  p_include_resolved boolean default false
)
returns table (
  fingerprint text,
  name        text,
  message     text,
  route       text,
  build       text,
  occurrences integer,
  first_seen  timestamptz,
  last_seen   timestamptz,
  is_resolved boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select e.fingerprint, e.name, e.message, e.route, e.build, e.occurrences,
         e.first_seen, e.last_seen, e.is_resolved
  from public.client_errors e
  where e.last_seen >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 180)))
    and (coalesce(p_include_resolved, false) or not e.is_resolved)
    and bsdc.has_permission('performance.read')
  order by e.is_resolved, e.occurrences desc, e.last_seen desc;
$$;

create or replace function public.resolve_client_error(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.read');
  update public.client_errors
     set is_resolved = true, resolved_by = bsdc.current_uid()
   where fingerprint = p_fingerprint;
  if not found then return false; end if;
  perform bsdc.audit('error.resolve', 'client_error', p_fingerprint, '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.bundle_history(p_app text, p_limit integer default 30)
returns table (
  recorded_at timestamptz,
  commit_sha  text,
  bytes_gzip  integer,
  budget_gzip integer,
  delta_bytes integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    b.recorded_at,
    b.commit_sha,
    b.bytes_gzip,
    b.budget_gzip,
    (b.bytes_gzip - lag(b.bytes_gzip) over (order by b.recorded_at))::integer
  from public.bundle_sizes b
  where b.app = p_app and bsdc.has_permission('performance.read')
  order by b.recorded_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 365));
$$;

-- Capacity, from the slope of the last few weeks rather than from a feeling.
-- A straight line through recent traffic is a crude model, which is why the
-- confidence is reported as the correlation and a weak one is said to be
-- weak instead of being dressed up as a forecast.
create or replace function public.capacity_forecast(p_days integer default 28)
returns table (
  days_observed   integer,
  daily_now       numeric,
  daily_in_30     numeric,
  growth_per_day  numeric,
  correlation     numeric,
  confidence      text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with daily as (
    select d.day,
           -- date minus date is already an integer count of days in Postgres,
           -- so there is no interval here for extract(epoch from ...) to read.
           (d.day - (current_date - greatest(1, least(coalesce(p_days, 28), 180))))::numeric as x,
           coalesce(count(v.id), 0)::numeric as y
    from bsdc.day_series(greatest(1, least(coalesce(p_days, 28), 180))) d
    left join public.web_vitals v on v.recorded_at::date = d.day
    where bsdc.has_permission('performance.read')
    group by d.day
  ),
  fit as (
    select
      count(*)::integer as n,
      coalesce(regr_slope(y, x), 0) as slope,
      coalesce(regr_intercept(y, x), 0) as intercept,
      coalesce(corr(y, x), 0) as r,
      max(x) as last_x
    from daily
  )
  select
    f.n,
    round((f.intercept + f.slope * f.last_x)::numeric, 1),
    round(greatest(0, f.intercept + f.slope * (f.last_x + 30))::numeric, 1),
    round(f.slope::numeric, 3),
    round(f.r::numeric, 3),
    case
      when f.n < 14 then 'not enough days to say anything'
      when abs(f.r) >= 0.7 then 'the trend is consistent'
      when abs(f.r) >= 0.4 then 'the trend is noisy'
      else 'there is no trend, only noise'
    end
  from fit f;
$$;

-- ===========================================================================
-- 7. Permissions
-- ===========================================================================
insert into public.role_permissions (role, permission)
values
  ('moderator', 'performance.read'),
  ('manager',   'performance.read'),
  ('admin',     'performance.read'),
  ('owner',     'performance.read')
on conflict do nothing;
