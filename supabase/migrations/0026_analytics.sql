-- ---------------------------------------------------------------------------
-- Analytics and reporting.
--
-- The principles behind this file:
--   1. A number on a dashboard must be reproducible. Every series is derived
--      from the rows that caused it, by a function anybody with permission
--      can call and re-run tomorrow and get the same answer for the same day.
--   2. A report is a stored set of numbers, not a stored file. A snapshot
--      records what was true when it was taken, so a PDF printed six months
--      later still prints the figures that were reported then.
--   3. Analytics never leaks what the panel is not allowed to see: every
--      function begins with the permission check, and nothing here returns a
--      member's identity alongside their behaviour.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_report_kind') then
    create type bsdc_report_kind as enum ('overview', 'growth', 'revenue', 'moderation', 'ads');
  end if;
end;
$$;

-- --------------------------- report snapshots ------------------------------
create table if not exists public.report_snapshots (
  id          uuid primary key default gen_random_uuid(),
  kind        bsdc_report_kind not null,
  title       text not null check (char_length(btrim(title)) between 3 and 160),
  period_from date not null,
  period_to   date not null,
  -- The figures themselves. A PDF is a rendering of this, never the source.
  payload     jsonb not null,
  created_by  text references public.profiles (uid) on delete set null,
  created_at  timestamptz not null default now(),
  constraint report_snapshots_period check (period_to >= period_from)
);

create index if not exists report_snapshots_kind_idx
  on public.report_snapshots (kind, created_at desc);

-- ---------------------------------------------------------------------------
-- A gapless calendar. Without this a quiet Tuesday simply vanishes from a
-- chart, and a chart with missing days tells a comforting lie.
-- ---------------------------------------------------------------------------
create or replace function bsdc.day_series(p_days integer)
returns table (day date)
language sql
immutable
as $$
  select generate_series(
    current_date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1),
    current_date,
    interval '1 day'
  )::date;
$$;

-- ---------------------------------------------------------------------------
-- Growth: members and posts per day, zero-filled.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_growth(p_days integer default 30)
returns table (
  day            date,
  new_members    integer,
  new_posts      integer,
  active_members integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    d.day,
    coalesce((
      select count(*)::integer from public.profiles p
      where p.created_at >= d.day and p.created_at < d.day + 1
    ), 0),
    coalesce((
      select count(*)::integer from public.posts o
      where o.created_at >= d.day and o.created_at < d.day + 1
    ), 0),
    -- Active means they wrote something that day. A view is not activity we
    -- are willing to claim as engagement.
    coalesce((
      select count(distinct o.author_uid)::integer from public.posts o
      where o.created_at >= d.day and o.created_at < d.day + 1
    ), 0)
  from bsdc.day_series(p_days) d
  where bsdc.has_permission('moderation.read')
  order by d.day;
$$;

-- ---------------------------------------------------------------------------
-- Revenue: marketplace and advertising, in poisha, per day.
-- Marketplace revenue to the platform is commission, not turnover; the two
-- are reported side by side so neither can be mistaken for the other.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_revenue(p_days integer default 30)
returns table (
  day             date,
  orders_count    integer,
  gross_sales     integer,
  commission      integer,
  ad_spend        integer,
  platform_total  integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with daily as (
    select
      d.day,
      coalesce((
        select count(*)::integer from public.orders o
        where o.placed_at >= d.day and o.placed_at < d.day + 1
          and o.status <> 'cancelled'
      ), 0) as orders_count,
      coalesce((
        select sum(o.total)::integer from public.orders o
        where o.placed_at >= d.day and o.placed_at < d.day + 1
          and o.status <> 'cancelled'
      ), 0) as gross_sales,
      coalesce((
        select -sum(l.amount)::integer from public.shop_ledger l
        where l.created_at >= d.day and l.created_at < d.day + 1
          and l.kind = 'commission'
      ), 0) as commission,
      coalesce((
        select sum(s.spend)::integer from public.ad_daily_stats s
        where s.day = d.day
      ), 0) as ad_spend
    from bsdc.day_series(p_days) d
    where bsdc.has_permission('settings.read') or bsdc.has_permission('people.read')
  )
  select
    day, orders_count, gross_sales, commission, ad_spend,
    (commission + ad_spend)::integer as platform_total
  from daily
  order by day;
$$;

-- ---------------------------------------------------------------------------
-- Moderation health: what arrived, what was handled, and how long it took.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_moderation(p_days integer default 30)
returns table (
  day              date,
  reports_opened   integer,
  reports_resolved integer,
  actions_taken    integer,
  median_hours     numeric
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    d.day,
    coalesce((
      select count(*)::integer from public.reports r
      where r.created_at >= d.day and r.created_at < d.day + 1
    ), 0),
    coalesce((
      select count(*)::integer from public.reports r
      where r.handled_at >= d.day and r.handled_at < d.day + 1
    ), 0),
    coalesce((
      select count(*)::integer from public.moderation_actions m
      where m.created_at >= d.day and m.created_at < d.day + 1
        and m.action <> 'dismiss'
    ), 0),
    coalesce((
      select round(
        percentile_cont(0.5) within group (
          order by extract(epoch from (r.handled_at - r.created_at)) / 3600
        )::numeric, 2)
      from public.reports r
      where r.handled_at >= d.day and r.handled_at < d.day + 1
    ), 0)
  from bsdc.day_series(p_days) d
  where bsdc.has_permission('moderation.read')
  order by d.day;
$$;

-- ---------------------------------------------------------------------------
-- Retention cohorts: of the people who joined in week W, how many were still
-- writing N weeks later. Counted from posts, so it cannot be inflated.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_retention(p_weeks integer default 8)
returns table (
  cohort_week date,
  cohort_size integer,
  week_offset integer,
  retained    integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with bounded as (
    select greatest(1, least(coalesce(p_weeks, 8), 26)) as weeks
  ),
  cohorts as (
    select
      date_trunc('week', p.created_at)::date as cohort_week,
      p.uid
    from public.profiles p, bounded b
    where p.created_at >= date_trunc('week', now()) - (b.weeks || ' weeks')::interval
  ),
  sizes as (
    select cohort_week, count(*)::integer as cohort_size
    from cohorts group by cohort_week
  ),
  activity as (
    select
      c.cohort_week,
      (extract(epoch from (date_trunc('week', o.created_at) - c.cohort_week)) / 604800)::integer
        as week_offset,
      count(distinct c.uid)::integer as retained
    from cohorts c
    join public.posts o on o.author_uid = c.uid
    where o.created_at >= c.cohort_week
    group by 1, 2
  )
  select s.cohort_week, s.cohort_size, a.week_offset, a.retained
  from sizes s
  join activity a on a.cohort_week = s.cohort_week
  where bsdc.has_permission('moderation.read')
  order by s.cohort_week, a.week_offset;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards. Content only; never a private signal about a member.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_top_content(
  p_days  integer default 30,
  p_limit integer default 10
)
returns table (
  post_id       uuid,
  slug          text,
  title         text,
  likes_count   integer,
  comments_count integer,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    o.id, o.slug::text, o.title, o.likes_count, o.comments_count, o.created_at
  from public.posts o
  where bsdc.has_permission('moderation.read')
    and o.status = 'published'
    and o.created_at >= current_date - greatest(1, least(coalesce(p_days, 30), 365))
  order by (o.likes_count + o.comments_count * 2) desc, o.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- ---------------------------------------------------------------------------
-- A snapshot is taken by the database, not assembled in a browser, so two
-- people exporting the same report on the same day get the same numbers.
-- ---------------------------------------------------------------------------
create or replace function public.create_report_snapshot(
  p_kind  bsdc_report_kind,
  p_title text,
  p_days  integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_id      uuid;
  v_days    integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_from    date := current_date - (v_days - 1);
  v_payload jsonb;
begin
  perform bsdc.require_permission('audit.read');

  v_payload := jsonb_build_object(
    'generated_at', now(),
    'days', v_days,
    'totals', (
      select to_jsonb(t) from (
        select
          (select count(*)::integer from public.profiles) as members_total,
          (select count(*)::integer from public.profiles where created_at >= v_from)
            as members_period,
          (select count(*)::integer from public.posts where status = 'published')
            as posts_total,
          (select count(*)::integer from public.posts where created_at >= v_from)
            as posts_period,
          (select count(*)::integer from public.reports where status = 'open')
            as reports_open,
          coalesce((
            select sum(o.total)::integer from public.orders o
            where o.placed_at >= v_from and o.status <> 'cancelled'
          ), 0) as gross_sales,
          coalesce((
            select -sum(l.amount)::integer from public.shop_ledger l
            where l.created_at >= v_from and l.kind = 'commission'
          ), 0) as commission,
          coalesce((
            select sum(s.spend)::integer from public.ad_daily_stats s where s.day >= v_from
          ), 0) as ad_spend
      ) t
    ),
    'growth', (
      select coalesce(jsonb_agg(to_jsonb(g) order by g.day), '[]'::jsonb)
      from public.analytics_growth(v_days) g
    ),
    'revenue', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.day), '[]'::jsonb)
      from public.analytics_revenue(v_days) r
    )
  );

  insert into public.report_snapshots (kind, title, period_from, period_to, payload, created_by)
  values (p_kind, btrim(p_title), v_from, current_date, v_payload, bsdc.current_uid())
  returning id into v_id;

  perform bsdc.audit('report.snapshot', v_id::text,
    jsonb_build_object('kind', p_kind, 'days', v_days));

  return v_id;
end;
$$;

create or replace function public.report_snapshots_list(p_limit integer default 30)
returns table (
  id          uuid,
  kind        bsdc_report_kind,
  title       text,
  period_from date,
  period_to   date,
  created_by  text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select s.id, s.kind, s.title, s.period_from, s.period_to, s.created_by, s.created_at
  from public.report_snapshots s
  where bsdc.has_permission('audit.read')
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.report_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select s.payload
  from public.report_snapshots s
  where s.id = p_id and bsdc.has_permission('audit.read');
$$;
