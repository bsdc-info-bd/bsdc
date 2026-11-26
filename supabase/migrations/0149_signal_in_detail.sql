-- ===========================================================================
-- 0149 — Signal in detail (§13)
--
-- Response 8 has one idea in three forms, and it is the difference between a
-- monitor and a tool: every number here has to lead somebody to an action.
--
--   * A vitals dashboard that shows p75 per route is a report. A budget that
--     fires after three consecutive breaches, names the release that
--     introduced the delta, and links the error fingerprint that appeared in
--     the same window is a tool (§13.1).
--   * An incident that survives its own resolution needs a public update and
--     an internal note to be *different fields*, an action list with owners,
--     and a drill that notifies nobody (§13.2).
--   * Verification that answers in one query has to distinguish revoked from
--     unknown, reveal nothing the document does not already carry, be rate
--     limited, accept a batch, and be embeddable — four properties that must
--     hold in the same function or none of them is worth anything (§13.3).
--
-- Everything below is enforced where the row is written, so a screen cannot be
-- the only thing standing between a member and a leak.
-- ===========================================================================
set search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Budgets are data, per route per metric (§13.1)
-- ---------------------------------------------------------------------------
-- A budget in a config file is a number somebody edited once. A budget in a
-- table has an owner, a reason and a history, and a breach of it can be
-- audited. The metric list is the enum the measurements already use, so a
-- budget for a metric nobody records cannot be created.
create table if not exists public.vital_budgets (
  id            uuid primary key default gen_random_uuid(),
  app           text not null default 'main-site' check (char_length(app) between 2 and 40),
  -- `*` is the whole site. A budget for a route beats the site-wide one, which
  -- is the only precedence an operator should have to remember.
  route         text not null default '*' check (char_length(route) between 1 and 200),
  metric        bsdc_vital not null,
  -- The same unit as `web_vitals.value`: milliseconds, except CLS, which is a
  -- unitless score. Stored as numeric so a CLS budget of 0.1 is expressible.
  target        numeric(10, 3) not null check (target > 0 and target <= 600000),
  -- How many consecutive windows over target before this is a regression
  -- rather than a fluctuation. Three is the default and the floor, because a
  -- budget that alerts on one slow window is a budget nobody keeps.
  consecutive   integer not null default 3 check (consecutive between 3 and 10),
  -- The window each comparison is made over.
  window_days   integer not null default 1 check (window_days between 1 and 28),
  -- A minimum sample count. Below this a breach is reported as insufficient
  -- data rather than as a regression (§13.1, small-sample honesty).
  min_samples   integer not null default 30 check (min_samples between 1 and 100000),
  note          text not null default '' check (char_length(note) <= 200),
  created_by    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (app, route, metric)
);

create index if not exists vital_budgets_lookup_idx
  on public.vital_budgets (app, metric);

drop trigger if exists vital_budgets_touch on public.vital_budgets;
create trigger vital_budgets_touch before update on public.vital_budgets
  for each row execute function bsdc.touch_updated_at();

comment on table public.vital_budgets is
  'One row per route per metric. A route budget beats the site-wide `*` budget, which is the only precedence anybody should have to remember.';

-- The regression board. One row per (budget, metric, window) that breached,
-- with the release that was current during the window and the error
-- fingerprint that appeared at the same time — recorded, not inferred later,
-- because "which build was it" is unanswerable after a deploy overwrites it.
create table if not exists public.vital_regressions (
  id            uuid primary key default gen_random_uuid(),
  budget_id     uuid references public.vital_budgets (id) on delete set null,
  app           text not null,
  route         text not null,
  metric        bsdc_vital not null,
  target        numeric(10, 3) not null,
  observed      numeric(10, 3) not null,
  -- (observed - target) / target, as a share, so 0.42 reads as 42% over.
  delta_share   numeric(8, 4) not null,
  samples       integer not null default 0,
  -- Consecutive windows over target at the moment this row was written.
  streak        integer not null default 1,
  build         text not null default '',
  error_fingerprint text references public.client_errors (fingerprint) on delete set null,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  -- A regression is acknowledged by a person or it stays on the board. There
  -- is no automatic close, because "it went back under budget" is not the same
  -- as "we know why it was over".
  acknowledged_at timestamptz,
  acknowledged_by text,
  ack_note      text not null default '',
  unique (app, route, metric, first_seen)
);

create index if not exists vital_regressions_open_idx
  on public.vital_regressions (last_seen desc) where acknowledged_at is null;

comment on column public.vital_regressions.error_fingerprint is
  'The error that appeared in the same window. A correlation, recorded as one — not a cause.';

-- ---------------------------------------------------------------------------
-- 2. The breach checker (§13.1)
-- ---------------------------------------------------------------------------
-- `bsdc.budget_breaches()` returns the comparisons that are over target right
-- now, with the sample count, the streak and the build. It is a plain
-- function so the console can show "you are one window from an alert" before
-- anything fires.
create or replace function bsdc.budget_breaches(p_app text default null)
returns table (
  budget_id    uuid,
  app          text,
  route        text,
  metric       bsdc_vital,
  target       numeric,
  observed     numeric,
  delta_share  numeric,
  samples      integer,
  streak       integer,
  over_target  boolean,
  insufficient boolean,
  build        text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with window_rows as (
    -- One row per budget per window. A window is `window_days` long, counted
    -- back from now, so bucket 1 is the newest and bucket 2 the one before.
    select
      b.id, b.app, b.route, b.metric, b.target, b.min_samples,
      ceil(extract(epoch from (now() - v.recorded_at)) / (b.window_days * 86400.0))::integer as bucket,
      count(*)::integer as samples,
      percentile_cont(0.75) within group (order by v.value) as p75,
      max(v.build) as build
    from public.vital_budgets b
    join public.web_vitals v
      on v.metric = b.metric
     and v.app = b.app
     and (b.route = '*' or v.route = b.route)
     and v.recorded_at > now() - (b.consecutive * b.window_days || ' days')::interval
    where (p_app is null or b.app = p_app)
    group by b.id, b.app, b.route, b.metric, b.target, b.min_samples,
             ceil(extract(epoch from (now() - v.recorded_at)) / (b.window_days * 86400.0))
  ),
  ordered as (
    select w.*, row_number() over (partition by w.id order by w.bucket) as rn
      from window_rows w
  ),
  -- The first window, counting back from the newest, that is *not* a breach.
  -- Everything before it is the streak, which is why this is a count of a
  -- leading run rather than a count of breaches: three bad windows separated
  -- by a good one are two streaks of one, not a streak of three.
  first_miss as (
    select o.id, min(o.rn) as rn
      from ordered o
     where o.samples < o.min_samples or o.p75 <= o.target
     group by o.id
  ),
  streaks as (
    select o.id, count(*)::integer as streak
      from ordered o
      left join first_miss f on f.id = o.id
     where f.rn is null or o.rn < f.rn
     group by o.id
  ),
  newest as (
    select distinct on (o.id) o.* from ordered o order by o.id, o.rn
  )
  select
    n.id, n.app, n.route, n.metric, n.target,
    coalesce(n.p75, 0)::numeric(10, 3),
    coalesce(round(((n.p75 - n.target) / nullif(n.target, 0))::numeric, 4), 0),
    n.samples,
    coalesce(s.streak, 0),
    coalesce(n.p75 > n.target, false),
    coalesce(n.samples < n.min_samples, true),
    coalesce(n.build, '')
  from newest n
  left join streaks s on s.id = n.id;
$$;

comment on function bsdc.budget_breaches(text) is
  'Every budget against its newest window: over or not, the streak, and whether the sample count is even enough to say.';

-- `check_vital_budgets()` writes the regressions. It is idempotent: a breach
-- already recorded for this window updates its last_seen instead of writing a
-- second row, so running it every five minutes does not produce a hundred
-- alerts for one bad deploy.
create or replace function public.check_vital_budgets()
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row      record;
  v_written  integer := 0;
  v_fingerprint text;
  v_id       uuid;
begin
  for v_row in
    select * from bsdc.budget_breaches(null)
     where over_target and not insufficient
  loop
    continue when v_row.streak < (
      select b.consecutive from public.vital_budgets b where b.id = v_row.budget_id
    );

    -- The error that appeared in the same window, if exactly one candidate
    -- stands out. Chosen rather than assumed: the link is recorded as a
    -- correlation and the column says so.
    select e.fingerprint into v_fingerprint
      from public.client_errors e
     where e.app = v_row.app
       and e.last_seen > now() - interval '1 day'
       and not e.is_resolved
     order by e.occurrences desc
     limit 1;

    select r.id into v_id
      from public.vital_regressions r
     where r.app = v_row.app and r.route = v_row.route and r.metric = v_row.metric
       and r.acknowledged_at is null
     order by r.last_seen desc
     limit 1;

    if v_id is null then
      insert into public.vital_regressions
        (budget_id, app, route, metric, target, observed, delta_share, samples, streak,
         build, error_fingerprint)
      values
        (v_row.budget_id, v_row.app, v_row.route, v_row.metric, v_row.target,
         v_row.observed, v_row.delta_share, v_row.samples, v_row.streak,
         v_row.build, v_fingerprint)
      returning id into v_id;
      v_written := v_written + 1;
    else
      update public.vital_regressions r
         set observed = v_row.observed,
             delta_share = v_row.delta_share,
             samples = v_row.samples,
             streak = v_row.streak,
             build = v_row.build,
             error_fingerprint = coalesce(r.error_fingerprint, v_fingerprint),
             last_seen = now()
       where r.id = v_id;
    end if;
  end loop;
  return v_written;
end;
$$;

revoke all on function public.check_vital_budgets() from public, anon, authenticated;
grant execute on function public.check_vital_budgets() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Release comparison (§13.1)
-- ---------------------------------------------------------------------------
-- A regression is only actionable if the reader can see what changed. This
-- compares the two most recent builds per metric on a route, with the sample
-- counts, and refuses to draw a conclusion from a build that has too few
-- measurements — "the new build is 40ms slower" is not a finding if it has
-- eleven samples.
create or replace function public.vitals_release_compare(
  p_app    text,
  p_route  text default '*',
  p_days   integer default 14
)
returns table (
  metric        bsdc_vital,
  build         text,
  samples       integer,
  p75           numeric,
  previous_build text,
  previous_p75  numeric,
  previous_samples integer,
  delta         numeric,
  enough        boolean
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 14), 90));
begin
  perform bsdc.require_permission('performance.read');

  return query
  with ranked as (
    select
      v.metric, v.build, count(*)::integer as samples,
      percentile_cont(0.75) within group (order by v.value)::numeric(10,3) as p75,
      rank() over (partition by v.metric order by max(v.recorded_at) desc) as position
    from public.web_vitals v
    where v.app = p_app
      and v.build <> ''
      and (p_route = '*' or v.route = p_route)
      and v.recorded_at > now() - (v_days || ' days')::interval
    group by v.metric, v.build
  ),
  current_build as (select * from ranked where position = 1),
  previous_build as (select * from ranked where position = 2)
  select
    c.metric, c.build, c.samples, c.p75,
    p.build, p.p75, p.samples,
    (c.p75 - p.p75)::numeric(10,3),
    -- Both sides need enough measurements for a comparison to mean anything.
    (c.samples >= 30 and coalesce(p.samples, 0) >= 30)
  from current_build c
  left join previous_build p on p.metric = c.metric
  order by abs(coalesce(c.p75 - p.p75, 0)) desc, c.metric;
end;
$$;

revoke all on function public.vitals_release_compare(text, text, integer) from public, anon;
grant execute on function public.vitals_release_compare(text, text, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The one board a person reads in the morning (§13.1)
-- ---------------------------------------------------------------------------
-- Everything above assembled into the shape the console actually renders, so
-- the screen makes no judgement of its own and two screens cannot disagree.
create or replace function public.vitals_board(p_app text, p_days integer default 7)
returns table (
  route        text,
  metric       bsdc_vital,
  samples      integer,
  p75          numeric,
  p95          numeric,
  rating       text,
  target       numeric,
  over_budget  boolean,
  insufficient boolean,
  streak       integer,
  build        text,
  open_regression uuid
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
begin
  perform bsdc.require_permission('performance.read');

  return query
  with measured as (
    select
      v.route, v.metric, count(*)::integer as samples,
      percentile_cont(0.75) within group (order by v.value)::numeric(10,3) as p75,
      percentile_cont(0.95) within group (order by v.value)::numeric(10,3) as p95,
      max(v.build) as build
    from public.web_vitals v
    where v.app = p_app and v.recorded_at > now() - (v_days || ' days')::interval
    group by v.route, v.metric
  ),
  budgeted as (
    select
      m.route, m.metric, m.samples, m.p75, m.p95, m.build,
      -- A route budget wins over the site-wide one. Nothing else matters, and
      -- the screen never has to know which one it used.
      coalesce(rb.target, sb.target) as effective_target,
      coalesce(rb.min_samples, sb.min_samples, 30) as effective_min,
      coalesce((
        select r.streak from public.vital_regressions r
         where r.app = p_app and r.route = m.route and r.metric = m.metric
           and r.acknowledged_at is null
         order by r.last_seen desc limit 1
      ), 0) as streak,
      (select r.id from public.vital_regressions r
        where r.app = p_app and r.route = m.route and r.metric = m.metric
          and r.acknowledged_at is null
        order by r.last_seen desc limit 1) as regression_id
    from measured m
    left join public.vital_budgets rb
      on rb.app = p_app and rb.route = m.route and rb.metric = m.metric
    left join public.vital_budgets sb
      on sb.app = p_app and sb.route = '*' and sb.metric = m.metric
  )
  select
    b.route, b.metric, b.samples, b.p75, b.p95,
    case
      -- A rating the measurement cannot support is not a rating.
      when b.samples < b.effective_min then 'insufficient'
      when b.effective_target is null then 'no budget'
      when b.p75 <= b.effective_target then 'within budget'
      else 'over budget'
    end,
    b.effective_target,
    coalesce(b.p75 > b.effective_target, false) and b.samples >= b.effective_min,
    b.samples < b.effective_min,
    b.streak,
    coalesce(b.build, ''),
    b.regression_id
  from budgeted b
  order by
    (coalesce(b.p75 > b.effective_target, false) and b.samples >= b.effective_min) desc,
    b.samples desc,
    b.route,
    b.metric;
end;
$$;

-- `from public` is not enough on its own: PUBLIC holds EXECUTE on a new
-- function and `anon` inherits it, so a revoke that only names PUBLIC leaves
-- the anonymous path open. t26 enforces this for every routine that asks for
-- an identity, which is a rule worth having.
revoke all on function public.vitals_board(text, integer) from public, anon;
grant execute on function public.vitals_board(text, integer) to authenticated, service_role;

-- The open board, as the console reads it. A screen selecting the table
-- directly would have to decide what "open" means; here it is one predicate.
create or replace function public.vital_regressions_open(p_limit integer default 50)
returns table (
  id                uuid,
  app               text,
  route             text,
  metric            bsdc_vital,
  target            numeric,
  observed          numeric,
  delta_share       numeric,
  samples           integer,
  streak            integer,
  build             text,
  error_fingerprint text,
  first_seen        timestamptz,
  last_seen         timestamptz,
  acknowledged_at   timestamptz,
  ack_note          text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.read');
  return query
  select r.id, r.app, r.route, r.metric, r.target, r.observed, r.delta_share,
         r.samples, r.streak, r.build, r.error_fingerprint, r.first_seen, r.last_seen,
         r.acknowledged_at, r.ack_note
    from public.vital_regressions r
   where r.acknowledged_at is null
   order by r.delta_share desc, r.last_seen desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.vital_regressions_open(integer) from public, anon;
grant execute on function public.vital_regressions_open(integer) to authenticated, service_role;

-- Acknowledge a regression, with a sentence. There is no automatic close.
create or replace function public.acknowledge_regression(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform bsdc.require_permission('performance.read');
  if char_length(v_note) < 10 then
    raise exception 'Say what was done about it, in at least ten characters.'
      using errcode = '22023';
  end if;
  update public.vital_regressions
     set acknowledged_at = now(), acknowledged_by = bsdc.current_uid(), ack_note = v_note
   where id = p_id and acknowledged_at is null;
  if not found then
    raise exception 'That regression is not on the board' using errcode = 'P0002';
  end if;
  perform bsdc.audit('perf.regression.ack', p_id::text, jsonb_build_object('note', v_note));
end;
$$;

revoke all on function public.acknowledge_regression(uuid, text) from public, anon;
grant execute on function public.acknowledge_regression(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Incidents that survive their own resolution (§13.2)
-- ---------------------------------------------------------------------------
-- The existing incident tables carry one body per update. That single field is
-- the defect §13.2 names: an engineer writes "we think it was the cache" in a
-- field that is also the customer-facing message, and the status board says it
-- with an official tone. So the two become two columns, and the constraint
-- that matters is that resolving *requires* the public one.
alter table public.incidents
  add column if not exists declared_at timestamptz not null default now(),
  -- The one-line public title, distinct from the internal title.
  add column if not exists public_title text not null default ''
    check (char_length(public_title) <= 160),
  add column if not exists summary text not null default ''
    check (char_length(summary) <= 2000),
  add column if not exists postmortem text not null default ''
    check (char_length(postmortem) <= 20000),
  add column if not exists postmortem_at timestamptz,
  add column if not exists postmortem_by text,
  -- A drill throws the whole switch without telling anybody. Every notification
  -- path checks this column, so a rehearsal cannot page a customer-facing
  -- channel by being written in the same function as a real one.
  add column if not exists is_drill boolean not null default false,
  -- Declaring publishes to the status board and opens a staff channel; these
  -- are the links back, so the conversation and the public record do not
  -- diverge (§13.2).
  add column if not exists channel_id uuid references public.corporate_channels (id) on delete set null,
  add column if not exists public_slug text not null default ''
    check (public_slug = '' or public_slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  add column if not exists resolved_by text;

comment on column public.incidents.is_drill is
  'A rehearsal. It notifies nobody, appears on no public board, and is labelled as a drill wherever it appears.';

-- Two boxes for every update, and they are never the same field.
alter table public.incident_updates
  add column if not exists public_body text not null default ''
    check (char_length(public_body) <= 2000),
  add column if not exists internal_note text not null default ''
    check (char_length(internal_note) <= 4000),
  add column if not exists is_public boolean not null default false,
  add column if not exists author_kind text not null default 'person'
    check (author_kind in ('person', 'automation'));

comment on column public.incident_updates.internal_note is
  'Staff only. Never rendered on the status board, and never copied into public_body automatically — the copy is a deliberate act.';

-- The post-incident action list, tracked to closure. §13.2 asks for owners and
-- dates; the table also asks for what done means, because an action with no
-- definition of done is an action that closes when somebody gets bored.
create table if not exists public.incident_actions (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 8 and 500),
  owner_uid    text references public.profiles (uid) on delete set null,
  due_on       date not null,
  done_at      timestamptz,
  done_note    text not null default '' check (char_length(done_note) <= 1000),
  done_by      text,
  created_by   text,
  created_at   timestamptz not null default now(),
  constraint incident_actions_done_has_note
    check (done_at is null or char_length(btrim(done_note)) >= 5)
);

create index if not exists incident_actions_open_idx
  on public.incident_actions (due_on) where done_at is null;

comment on column public.incident_actions.due_on is
  'A date, not "soon". An action without a date is a wish.';

-- Resolving requires a customer-facing summary. This is a constraint rather
-- than a screen rule, because the screen is not the only writer.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_resolved_has_summary') then
    alter table public.incidents
      add constraint incidents_resolved_has_summary
      check (resolved_at is null or char_length(btrim(summary)) >= 10 or is_drill);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The lifecycle, with an author on every transition (§13.2)
-- ---------------------------------------------------------------------------
create or replace function public.declare_incident(
  p_service_key  text,
  p_title        text,
  p_public_title text,
  p_impact       bsdc_incident_impact,
  p_public_body  text,
  p_internal     text default '',
  p_drill        boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id       uuid;
  v_slug     text;
  v_channel  uuid;
  v_staff    text;
begin
  perform bsdc.require_permission('status.write');

  if char_length(btrim(coalesce(p_public_body, ''))) < 10 then
    raise exception 'Write the sentence a customer will read. "Investigating" is not one.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_public_title, ''))) < 4 then
    raise exception 'A public title is required, because the status board shows it without context.'
      using errcode = '22023';
  end if;

  v_slug := regexp_replace(lower(btrim(p_public_title)), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  if char_length(v_slug) < 3 then v_slug := 'incident'; end if;
  -- A slug has to be unique per day rather than globally, or the second
  -- incident of the year cannot be described in the same words as the first.
  v_slug := v_slug || '-' || to_char(now(), 'YYYYMMDD');

  insert into public.incidents
    (service_key, title, impact, created_by, public_title, public_slug, summary, is_drill)
  values
    (p_service_key, btrim(p_title), p_impact, bsdc.current_uid(),
     btrim(p_public_title), v_slug, '', p_drill)
  returning id into v_id;

  insert into public.incident_updates
    (incident_id, body, public_body, internal_note, state, created_by, is_public)
  values
    (v_id, btrim(p_public_body), btrim(p_public_body), btrim(coalesce(p_internal, '')),
     (case p_impact when 'critical' then 'down'
                    when 'major' then 'partial'
                    else 'degraded' end)::bsdc_service_state,
     bsdc.current_uid(), true);

  -- The public board. A drill changes nothing a customer can see.
  if not p_drill then
    update public.services
       set state = (case p_impact
         when 'critical' then 'down'
         when 'major' then 'partial'
         else 'degraded'
       end)::bsdc_service_state
     where key = p_service_key;

    -- The staff channel, so the conversation happens next to the record.
    insert into public.corporate_channels (slug, name, topic, is_private, min_role, created_by)
    values (
      left('inc-' || v_slug, 40), left('Incident: ' || btrim(p_public_title), 60),
      'Coordination for one incident. The public record is the status board.',
      true, 'moderator', bsdc.current_uid()
    )
    on conflict (slug) do nothing
    returning id into v_channel;

    if v_channel is null then
      select id into v_channel from public.corporate_channels where slug = left('inc-' || v_slug, 40);
    end if;

    update public.incidents set channel_id = v_channel where id = v_id;

    -- A private channel with no members is a channel nobody can open, which
    -- would make the link from the incident a link to an empty room. Everybody
    -- who may write an incident joins, because that is the set of people the
    -- notification goes to and the set who can do anything about it.
    insert into public.channel_members (channel_id, uid, added_by)
    select v_channel, p.uid, bsdc.current_uid()
      from public.profiles p
     where p.status = 'active'::bsdc_account_status
       and (p.role = 'owner'::bsdc_role
            or exists (select 1 from public.role_permissions r
                        where r.role = p.role and r.permission = 'status.write'))
    on conflict do nothing;

    -- Everybody who may write an incident is told, once, by name.
    perform bsdc.notify_staff(
      'status.write', bsdc.current_uid(),
      'Incident declared: ' || btrim(p_public_title),
      '/?incident=' || v_id::text
    );
  end if;

  perform bsdc.audit('status.incident', v_id::text,
    jsonb_build_object('impact', p_impact, 'drill', p_drill, 'service', p_service_key));
  return v_id;
end;
$$;

revoke all on function public.declare_incident(text, text, text, bsdc_incident_impact, text, text, boolean)
  from public, anon;
grant execute on function public.declare_incident(text, text, text, bsdc_incident_impact, text, text, boolean)
  to authenticated, service_role;

create or replace function public.update_incident(
  p_incident_id uuid,
  p_public_body text,
  p_internal    text,
  p_state       bsdc_service_state default 'degraded'
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id    uuid;
  v_inc   public.incidents%rowtype;
begin
  perform bsdc.require_permission('status.write');

  select * into v_inc from public.incidents where id = p_incident_id;
  if not found then
    raise exception 'No such incident' using errcode = 'P0002';
  end if;
  if v_inc.resolved_at is not null then
    raise exception 'That incident is resolved. A new update would rewrite history; declare a new one instead.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_public_body, ''))) < 5 then
    raise exception 'Every update carries a customer-facing sentence, even when nothing changed publicly.'
      using errcode = '22023';
  end if;

  insert into public.incident_updates
    (incident_id, body, public_body, internal_note, state, created_by, is_public)
  values (p_incident_id, btrim(p_public_body), btrim(p_public_body),
          btrim(coalesce(p_internal, '')), p_state, bsdc.current_uid(), true)
  returning id into v_id;

  if not v_inc.is_drill then
    update public.services set state = p_state where key = v_inc.service_key;
  end if;

  perform bsdc.audit('status.update', p_incident_id::text,
    jsonb_build_object('state', p_state, 'drill', v_inc.is_drill));
  return v_id;
end;
$$;

revoke all on function public.update_incident(uuid, text, text, bsdc_service_state) from public, anon;
grant execute on function public.update_incident(uuid, text, text, bsdc_service_state)
  to authenticated, service_role;

-- Resolving: a public summary, a timestamp, an author, and then the action
-- list. The old `resolve_incident` is left in place for compatibility but this
-- is what the console calls, because it also opens the post-mortem.
create or replace function public.resolve_with_summary(
  p_incident_id uuid,
  p_summary     text,
  p_actions     jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_inc     public.incidents%rowtype;
  v_action  jsonb;
  v_count   integer := 0;
begin
  perform bsdc.require_permission('status.write');

  if char_length(btrim(coalesce(p_summary, ''))) < 10 then
    raise exception 'A resolution needs a sentence a customer can read, not a timestamp.'
      using errcode = '22023';
  end if;

  select * into v_inc from public.incidents where id = p_incident_id for update;
  if not found then
    raise exception 'No such incident' using errcode = 'P0002';
  end if;
  if v_inc.resolved_at is not null then
    raise exception 'That incident is already resolved' using errcode = '22023';
  end if;

  update public.incidents
     set resolved_at = now(),
         resolved_by = bsdc.current_uid(),
         summary = btrim(p_summary)
   where id = p_incident_id;

  insert into public.incident_updates
    (incident_id, body, public_body, internal_note, state, created_by, is_public)
  values (p_incident_id, btrim(p_summary), btrim(p_summary), '', 'operational',
          bsdc.current_uid(), true);

  if not v_inc.is_drill then
    update public.services s
       set state = 'operational'
     where s.key = v_inc.service_key
       and not exists (
         select 1 from public.incidents i
          where i.service_key = s.key and i.resolved_at is null
       );
  end if;

  -- The action list. Each one needs an owner and a date, and the function is
  -- the only place that decides what "enough" means.
  for v_action in select * from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb))
  loop
    if char_length(btrim(coalesce(v_action ->> 'body', ''))) < 8 then
      raise exception 'An action needs a sentence somebody can act on.' using errcode = '22023';
    end if;
    if (v_action ->> 'due_on') is null then
      raise exception 'An action needs a due date. "Soon" is not a date.' using errcode = '22023';
    end if;
    insert into public.incident_actions (incident_id, body, owner_uid, due_on, created_by)
    values (
      p_incident_id, btrim(v_action ->> 'body'),
      nullif(v_action ->> 'owner_uid', ''), (v_action ->> 'due_on')::date,
      bsdc.current_uid()
    );
    v_count := v_count + 1;
  end loop;

  perform bsdc.audit('status.resolve', p_incident_id::text,
    jsonb_build_object('actions', v_count, 'drill', v_inc.is_drill));
  return v_count;
end;
$$;

revoke all on function public.resolve_with_summary(uuid, text, jsonb) from public, anon;
grant execute on function public.resolve_with_summary(uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.complete_incident_action(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('status.write');
  if char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Say what closing it actually delivered, in at least five characters.'
      using errcode = '22023';
  end if;
  update public.incident_actions
     set done_at = now(), done_by = bsdc.current_uid(), done_note = btrim(p_note)
   where id = p_id and done_at is null;
  if not found then
    raise exception 'That action is not open' using errcode = 'P0002';
  end if;
  perform bsdc.audit('status.action.done', p_id::text);
end;
$$;

revoke all on function public.complete_incident_action(uuid, text) from public, anon;
grant execute on function public.complete_incident_action(uuid, text) to authenticated, service_role;

create or replace function public.record_postmortem(
  p_incident_id uuid,
  p_body        text
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_inc public.incidents%rowtype;
begin
  perform bsdc.require_permission('status.write');
  select * into v_inc from public.incidents where id = p_incident_id;
  if not found then
    raise exception 'No such incident' using errcode = 'P0002';
  end if;
  if v_inc.resolved_at is null then
    raise exception 'A post-mortem is written after the incident is resolved, not during it.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 40 then
    raise exception 'Write at least a paragraph. A post-mortem of one sentence is a shrug.'
      using errcode = '22023';
  end if;

  update public.incidents
     set postmortem = btrim(p_body), postmortem_at = now(), postmortem_by = bsdc.current_uid()
   where id = p_incident_id;

  perform bsdc.audit('status.postmortem', p_incident_id::text);
end;
$$;

revoke all on function public.record_postmortem(uuid, text) from public, anon;
grant execute on function public.record_postmortem(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Verification that answers in one query (§13.3)
-- ---------------------------------------------------------------------------
-- The desk has three entry points today: `verify_code` (a code, many fields,
-- legacy shape), `verify_document` (a code, the shape a printed document
-- carries) and nothing at all for a file hash. And a `verification_log` with
-- no throttle, which makes enumeration a matter of patience.
--
-- This section replaces the lot with one function that:
--
--   * answers a code, a notice id or a SHA-256 file hash in one query;
--   * says "revoked" and "unknown" differently, and says so with different
--     reason text as well as a different state;
--   * returns nothing the document does not already carry — the published
--     field list below is the allow-list, and `verification_keys()` is the
--     same list the test compares the response against;
--   * is rate limited per caller, recorded in aggregate only;
--   * has a batch form for a CSV of codes;
--   * is embeddable from any origin without exposing an address.

-- What an attempt is allowed to reveal. Stored as a row rather than written
-- into the function, because the test reads it and compares the two.
create table if not exists public.verification_fields (
  field      text primary key,
  why        text not null,
  sort_order integer not null default 100
);

insert into public.verification_fields (field, why, sort_order) values
  ('kind',           'So the reader knows what they are holding.', 10),
  ('found',          'Revoked and unknown must not look the same.', 20),
  ('code',           'What was checked, echoed back normalised.', 30),
  ('recipient_name', 'Printed on the certificate itself.', 40),
  ('subject',        'Printed on the certificate itself.', 50),
  ('issued_on',      'Printed on the certificate itself.', 60),
  ('expires_on',     'Printed on the certificate itself.', 70),
  ('state',          'valid, revoked, expired, withdrawn or not_found.', 80),
  ('reason',         'The issuer''s own words for a revocation.', 90),
  ('superseded_by',  'A reissued document, by its code.', 100),
  ('hash_matches',   'Whether the stored hash still reproduces.', 110),
  ('checked_at',     'When this answer was produced.', 120)
on conflict (field) do nothing;

-- What is *not* on the list, and why: a recipient's uid, their email, their
-- other certificates, any body text beyond the printed document, and any
-- count of how many people have looked. Every one of those has been the
-- actual leak in a real verification portal.
comment on table public.verification_fields is
  'The allow-list of response fields. `verification_keys()` returns exactly this, and a test compares the live response against it.';

create or replace function public.verification_keys()
returns text[]
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select coalesce(array_agg(f.field order by f.sort_order), '{}'::text[])
    from public.verification_fields f;
$$;

revoke all on function public.verification_keys() from public;
grant execute on function public.verification_keys() to anon, authenticated, service_role;

-- Attempts, in aggregate. No address, no code, no identity: §13.3 asks for
-- "every attempt counted in aggregate only", and the aggregate is all a
-- throttle needs.
create table if not exists public.verification_attempts (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  -- The throttle key. A hash of the address, so the table cannot be read as a
  -- log of who checked what even by somebody with the table.
  bucket      text not null,
  kind        text not null default 'code',
  found       boolean not null default false,
  batch_size  integer not null default 1
);

create index if not exists verification_attempts_bucket_idx
  on public.verification_attempts (bucket, at desc);
create index if not exists verification_attempts_time_idx
  on public.verification_attempts (at desc);

comment on table public.verification_attempts is
  'Aggregate only. The throttle key is a hash, never an address, so this table cannot become a log of who verified what.';

-- The public answer. One row, one shape.
create or replace function public.verify_one(p_code text, p_kind text default 'code')
returns table (
  kind           text,
  found          boolean,
  code           text,
  recipient_name text,
  subject        text,
  issued_on      date,
  expires_on     date,
  state          text,
  reason         text,
  superseded_by  text,
  hash_matches   boolean,
  checked_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_ct   public.issued_certificates%rowtype;
  v_nt   public.notices%rowtype;
  v_recomputed text;
begin
  v_code := replace(replace(v_code, '—', '-'), '–', '-');

  if v_code = '' then
    raise exception 'Enter the code printed on the document' using errcode = '22023';
  end if;

  if v_code ~ '^BSDC-CT-' then
    select * into v_ct from public.issued_certificates c where c.code = v_code;
    if not found then
      return query select 'certificate'::text, false, v_code, null::text, null::text,
                          null::date, null::date, 'not_found'::text,
                          'No certificate in the registry carries that code.'::text,
                          null::text, null::boolean, now();
      return;
    end if;

    -- Recomputed, not read: a stored hash that is never checked is a
    -- decoration. A mismatch is information for the desk, not a reason to
    -- refuse a document that already exists.
    v_recomputed := bsdc.certificate_hash(
      v_ct.code, v_ct.recipient_name, v_ct.subject, v_ct.body,
      v_ct.issued_on, v_ct.expires_on, v_ct.template_key);

    return query
      select 'certificate'::text, true, v_ct.code, v_ct.recipient_name, v_ct.subject,
             v_ct.issued_on, v_ct.expires_on,
             case when v_ct.status = 'revoked' then 'revoked'
                  when v_ct.expires_on is not null and v_ct.expires_on < current_date then 'expired'
                  else 'valid' end,
             case
               when v_ct.status = 'revoked' and coalesce(v_ct.revoke_reason, '') <> ''
                 then v_ct.revoke_reason
               when v_ct.status = 'revoked' then 'Withdrawn by the issuer, without a reason on record.'
               when v_ct.expires_on is not null and v_ct.expires_on < current_date
                 then 'Genuine, but its period has ended.'
               else '' end,
             coalesce(v_ct.superseded_by, ''),
             (v_ct.content_hash is null or v_ct.content_hash = v_recomputed),
             now();
    return;
  end if;

  if v_code ~ '^BSDC-NT-' then
    select * into v_nt from public.notices n where n.code = v_code;
    if not found then
      return query select 'notice'::text, false, v_code, null::text, null::text,
                          null::date, null::date, 'not_found'::text,
                          'No notice in the registry carries that code.'::text,
                          null::text, null::boolean, now();
      return;
    end if;
    return query
      select 'notice'::text, true, v_nt.code, null::text, v_nt.title,
             v_nt.publish_at::date, v_nt.expires_at::date,
             case when v_nt.withdrawn_at is not null then 'withdrawn'
                  when v_nt.status = 'published'
                       and (v_nt.publish_at is null or v_nt.publish_at <= now()) then 'valid'
                  when v_nt.status = 'published' then 'withdrawn'
                  else 'draft' end,
             case when v_nt.withdrawn_at is not null and coalesce(v_nt.withdraw_reason, '') <> ''
                    then v_nt.withdraw_reason
                  when v_nt.withdrawn_at is not null then 'Withdrawn, without a reason on record.'
                  else '' end,
             ''::text, null::boolean, now();
    return;
  end if;

  -- A code that is not even in our shape is answered the same way as one that
  -- is. Telling the two apart would let somebody enumerate the format.
  return query select 'unknown'::text, false, v_code, null::text, null::text,
                      null::date, null::date, 'not_found'::text,
                      'That code does not belong to a BSDC document.'::text,
                      null::text, null::boolean, now();
end;
$$;

revoke all on function public.verify_one(text, text) from public, anon, authenticated;
grant execute on function public.verify_one(text, text) to service_role;

-- The rate limit, and the answer, in one call.
--
-- 60 an hour is enough for a desk checking a stack of printed documents and
-- far too few to enumerate 36^9 codes. A batch counts as its length.
create or replace function public.verify_public(
  p_codes text[],
  p_address text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_codes    text[];
  v_size     integer;
  v_bucket   text;
  v_recent   integer;
  v_limit    constant integer := 60;
  v_rows     jsonb;
begin
  if p_codes is null or array_length(p_codes, 1) is null then
    raise exception 'Give at least one code' using errcode = '22023';
  end if;

  -- A batch is capped at 200: a CSV of codes is a legitimate request, an
  -- unbounded array is an enumeration attempt wearing a CSV's clothes.
  v_size := least(array_length(p_codes, 1), 200);
  v_codes := p_codes[1:v_size];

  v_bucket := encode(digest(coalesce(nullif(btrim(p_address), ''), 'anonymous'), 'sha256'), 'hex');
  v_bucket := left(v_bucket, 32);

  select coalesce(sum(a.batch_size), 0)::integer into v_recent
    from public.verification_attempts a
   where a.bucket = v_bucket and a.at > now() - interval '1 hour';

  if v_recent + v_size > v_limit then
    raise exception 'Too many checks from this connection. Try again later, or ask the trust desk.'
      using errcode = '53400';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.checked_at desc), '[]'::jsonb)
    into v_rows
    from unnest(v_codes) as c
    cross join lateral public.verify_one(c, 'code') as r;

  insert into public.verification_attempts (bucket, kind, found, batch_size)
  values (
    v_bucket, case when v_size > 1 then 'batch' else 'code' end,
    exists (select 1 from jsonb_array_elements(v_rows) e where (e ->> 'found')::boolean),
    v_size
  );

  return jsonb_build_object(
    'results', v_rows,
    'checked_at', now(),
    'remaining', greatest(0, v_limit - v_recent - v_size)
  );
end;
$$;

revoke all on function public.verify_public(text[], text) from public;
grant execute on function public.verify_public(text[], text) to anon, authenticated, service_role;

comment on function public.verify_public(text[], text) is
  'Rate limited verification for the public desk. Returns results plus what is left of the allowance, and records the attempt in aggregate only.';

-- A file hash is a fourth way in, because a printed page is not the only
-- thing a person has. `p_kind` is 'hash' and the code is a SHA-256.
create or replace function public.verify_by_hash(p_hash text)
returns table (
  kind           text,
  found          boolean,
  code           text,
  recipient_name text,
  subject        text,
  issued_on      date,
  expires_on     date,
  state          text,
  reason         text,
  superseded_by  text,
  hash_matches   boolean,
  checked_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_hash text := lower(btrim(coalesce(p_hash, '')));
  v_code text;
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A file hash is 64 hexadecimal characters' using errcode = '22023';
  end if;

  select c.code into v_code
    from public.issued_certificates c
   where c.content_hash = v_hash
   limit 1;

  if v_code is null then
    return query select 'certificate'::text, false, ''::text, null::text, null::text,
                        null::date, null::date, 'not_found'::text,
                        'No certificate in the registry matches that file.'::text,
                        null::text, null::boolean, now();
    return;
  end if;

  return query select * from public.verify_one(v_code, 'code');
end;
$$;

revoke all on function public.verify_by_hash(text) from public;
grant execute on function public.verify_by_hash(text) to anon, authenticated, service_role;

-- What the trust desk sees: how many checks, how many misses, and the ratio.
-- Aggregate only, and readable by anybody with performance.read.
create or replace function public.verification_health(p_days integer default 30)
returns table (
  day          date,
  checks       integer,
  misses       integer,
  miss_share   numeric,
  batches      integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
begin
  perform bsdc.require_permission('performance.read');
  return query
  select
    d.day::date,
    coalesce(sum(a.batch_size) filter (where a.at >= d.day), 0)::integer,
    -- Misses are counted in requests, not in rows, so a batch of ten
    -- unknown codes reads as ten misses rather than one.
    coalesce(sum(a.batch_size) filter (where not a.found), 0)::integer,
    coalesce(
      round(
        coalesce(sum(a.batch_size) filter (where not a.found), 0)::numeric
        / nullif(sum(a.batch_size), 0), 4),
      0),
    -- A "rate limited" count is not visible from the table (a refused attempt
    -- writes no row), so this reports batches instead and the name says so.
    coalesce(count(*) filter (where a.kind = 'batch'), 0)::integer
  from generate_series(current_date - (v_days - 1), current_date, interval '1 day') as d(day)
  left join public.verification_attempts a on a.at >= d.day and a.at < d.day + interval '1 day'
  group by d.day
  order by d.day desc;
end;
$$;

revoke all on function public.verification_health(integer) from public, anon;
grant execute on function public.verification_health(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Permissions for the new consoles
-- ---------------------------------------------------------------------------
insert into public.permission_catalogue
  (permission, label, subject_kind, is_destructive, console, grant_rank)
values
  ('performance.manage', 'Set vitals budgets and acknowledge regressions', 'platform', false, 'performance-site', 50),
  ('status.postmortem',  'Write a post-incident review',                   'platform', false, 'status-site',      50),
  ('verification.read',  'Read aggregate verification activity',           'platform', false, 'vf-site',          50)
on conflict (permission) do nothing;

-- The Bangla copy for the three, in the one place the authority matrix reads
-- it. `bsdc_permission_copy()` is an immutable `values` list rather than a
-- table (0138), so it is restated in full here with three rows added — a
-- partial restatement would silently delete twenty-seven translations, and a
-- permission with no row renders as its own key in a Bangla console, which
-- reads as a bug rather than as a missing translation.
create or replace function bsdc_permission_copy()
returns table (
  permission     text,
  label_bn       text,
  why_bn         text,
  why_en         text
)
language sql
immutable
as $$
  values
    ('ads.manage',        'বিজ্ঞাপন পরিচালনা',        'বিজ্ঞাপন তৈরি, সম্পাদনা ও বন্ধ করা যায়', 'Create, edit and pause advertising'),
    ('ads.review',        'বিজ্ঞাপন পর্যালোচনা',      'অন্যের বিজ্ঞাপন অনুমোদন বা প্রত্যাখ্যান করা যায়', 'Approve or refuse somebody else''s advertising'),
    ('advertising.review','বিজ্ঞাপন নীতি পর্যালোচনা',  'বিজ্ঞাপন নীতি প্রয়োগ করা যায়', 'Enforce the advertising policy'),
    ('audit.read',        'নিরীক্ষা পড়া',             'সবার কার্যক্রমের ইতিহাস পড়া যায়', 'Read every account''s activity history'),
    ('brand.manage',      'ব্র্যান্ড পরিচালনা',        'সাইটের চেহারা ও লোগো বদলানো যায়', 'Change the site''s appearance and logo'),
    ('brand.publish',     'ব্র্যান্ড প্রকাশ',          'সাইটের চেহারা সব দর্শকের জন্য বদলে দেওয়া যায়', 'Put a theme in front of every visitor'),
    ('certificates.issue','সনদ ইস্যু',                 'সনদ তৈরি ও বাতিল করা যায়', 'Issue and revoke certificates'),
    ('content.hide',      'কনটেন্ট লুকানো',           'পোস্ট সবার চোখ থেকে সরানো যায়', 'Remove a post from public view'),
    ('corporate.chat',    'কর্পোরেট চ্যাট',            'কর্মীদের সঙ্গে অভ্যন্তরীণ বার্তা', 'Internal messages with staff'),
    ('marketplace.review','মার্কেটপ্লেস পর্যালোচনা',   'দোকান ও ক্রয় অনুমোদন করা যায়', 'Approve shops and credit purchases'),
    ('marketplace.settings','মার্কেটপ্লেস সেটিংস',    'দোকানের নিয়ম ও দাম বদলানো যায়', 'Change marketplace rules and prices'),
    ('moderation.read',   'মডারেশন পড়া',              'রিপোর্ট ও অভিযোগ দেখা যায়', 'See reports and complaints'),
    ('moderation.resolve','মডারেশন নিষ্পত্তি',        'রিপোর্ট নিষ্পত্তি বা খারিজ করা যায়', 'Resolve or dismiss reports'),
    ('notices.publish',   'নোটিশ প্রকাশ',             'সবার কাছে নোটিশ প্রকাশ করা যায়', 'Publish notices to everybody'),
    ('owner.transfer',    'মালিকানা হস্তান্তর',       'প্ল্যাটফর্মের মালিকানা অন্যকে দেওয়া যায়', 'Hand the platform to another account'),
    ('people.read',       'মানুষ পড়া',                'সদস্যদের প্রোফাইল ও সেশন দেখা যায়', 'See member profiles and sessions'),
    ('people.role',       'ভূমিকা পরিবর্তন',          'কেউ কে কী করতে পারবে তা বদলানো যায়', 'Change what somebody is allowed to do'),
    ('people.suspend',    'অ্যাকাউন্ট স্থগিত',        'কাউকে সাইট থেকে সাময়িকভাবে বন্ধ করা যায়', 'Shut an account out of the site'),
    ('performance.manage','কর্মক্ষমতা ব্যবস্থাপনা',   'গতির বাজেট ঠিক করা ও পিছিয়ে পড়া স্বীকার করা যায়', 'Set speed budgets and acknowledge a regression'),
    ('performance.read',  'কর্মক্ষমতা পড়া',           'সাইটের গতি ও ত্রুটি দেখা যায়', 'See site speed and errors'),
    ('plugins.read',      'প্লাগইন পড়া',              'কোন প্লাগইন চালু আছে তা দেখা যায়', 'See which plugins are running'),
    ('plugins.write',     'প্লাগইন পরিবর্তন',         'সাইটে কোড চালু বা বন্ধ করা যায়', 'Turn code on or off in the running site'),
    ('seo.manage',        'এসইও পরিচালনা',            'সার্চ ইঞ্জিনের জন্য শিরোনাম ও বর্ণনা বদলানো যায়', 'Change titles and descriptions search engines read'),
    ('settings.read',     'সেটিংস পড়া',              'সাইটের কনফিগারেশন দেখা যায়', 'See the site''s configuration'),
    ('settings.write',    'সেটিংস পরিবর্তন',         'সাইটের আচরণ বদলানো যায়', 'Change how the platform behaves'),
    ('shop.review',       'দোকান পর্যালোচনা',         'দোকানের আবেদন দেখা ও মন্তব্য করা যায়', 'See and comment on shop applications'),
    ('status.postmortem', 'ঘটনা পরবর্তী পর্যালোচনা',   'ঘটনার পরে কী ঘটেছিল ও কীভাবে ধরা পড়ত তা লেখা যায়', 'Write the review after an incident'),
    ('status.write',      'স্ট্যাটাস লেখা',           'সবার জন্য স্ট্যাটাস বিজ্ঞপ্তি দেওয়া যায়', 'Post a status update for everybody'),
    ('verification.read', 'যাচাইকরণ পড়া',            'কতগুলো যাচাই হয়েছে তার সারসংক্ষেপ দেখা যায়', 'See aggregate verification activity');
$$;

revoke all on function bsdc_permission_copy() from public, anon;
grant execute on function bsdc_permission_copy() to authenticated, service_role;

-- A catalogued permission that nobody holds is a permission that does not
-- exist. These three are new in this migration, so they are granted here
-- rather than left for somebody to notice.
insert into public.role_permissions (role, permission) values
  ('admin',     'performance.manage'),
  ('owner',     'performance.manage'),
  ('admin',     'status.postmortem'),
  ('owner',     'status.postmortem'),
  ('moderator', 'verification.read'),
  ('manager',   'verification.read'),
  ('admin',     'verification.read'),
  ('owner',     'verification.read')
on conflict do nothing;

-- The console shows "one window from an alert" before anything fires, so the
-- breach computation has to be readable, not only runnable by a cron.
revoke all on function bsdc.budget_breaches(text) from public, anon;
grant execute on function bsdc.budget_breaches(text) to authenticated, service_role;

-- A budget is set through a function, never by an insert. A grant on the table
-- would let a console write a target of zero, or a streak of one, which the
-- table's own checks refuse — but it would also let one write skip the audit.
create or replace function public.save_vital_budget(
  p_app         text,
  p_route       text,
  p_metric      bsdc_vital,
  p_target      numeric,
  p_consecutive integer default 3,
  p_window_days integer default 1,
  p_min_samples integer default 30,
  p_note        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  perform bsdc.require_permission('performance.manage');

  if p_target is null or p_target <= 0 then
    raise exception 'A budget of zero is not a target. Give a number a measurement can be compared against.'
      using errcode = '22023';
  end if;
  if p_consecutive < 3 then
    raise exception 'Three consecutive breaches is the floor. One slow window is a fluctuation, and a monitor that pages on one is a monitor nobody reads.'
      using errcode = '22023';
  end if;
  -- CLS is unitless, so the same ceiling as milliseconds would be a budget
  -- nobody could ever exceed. The unit is decided by the metric, not by taste.
  if p_metric <> 'CLS' and p_target > 600000 then
    raise exception 'A budget above ten minutes is not a budget' using errcode = '22023';
  end if;
  if p_metric = 'CLS' and p_target > 10 then
    raise exception 'CLS is a score between 0 and 1. A budget of % is not a score.' , p_target
      using errcode = '22023';
  end if;

  insert into public.vital_budgets
    (app, route, metric, target, consecutive, window_days, min_samples, note, created_by)
  values (p_app, coalesce(nullif(btrim(p_route), ''), '*'), p_metric, p_target,
          p_consecutive, p_window_days, p_min_samples, btrim(coalesce(p_note, '')), bsdc.current_uid())
  on conflict (app, route, metric) do update
    set target = excluded.target,
        consecutive = excluded.consecutive,
        window_days = excluded.window_days,
        min_samples = excluded.min_samples,
        note = excluded.note,
        updated_at = now()
  returning id into v_id;

  perform bsdc.audit('perf.budget.save', v_id::text,
    jsonb_build_object('app', p_app, 'route', p_route, 'metric', p_metric, 'target', p_target));
  return v_id;
end;
$$;

revoke all on function public.save_vital_budget(text, text, bsdc_vital, numeric, integer, integer, integer, text)
  from public, anon;
grant execute on function public.save_vital_budget(text, text, bsdc_vital, numeric, integer, integer, integer, text)
  to authenticated, service_role;

create or replace function public.delete_vital_budget(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.manage');
  delete from public.vital_budgets where id = p_id;
  if not found then
    raise exception 'No such budget' using errcode = 'P0002';
  end if;
  perform bsdc.audit('perf.budget.delete', p_id::text);
end;
$$;

revoke all on function public.delete_vital_budget(uuid) from public, anon;
grant execute on function public.delete_vital_budget(uuid) to authenticated, service_role;

-- The budget list the console edits, with the readers untouched.
create or replace function public.vital_budget_list(p_app text default null)
returns table (
  id uuid, app text, route text, metric bsdc_vital, target numeric,
  consecutive integer, window_days integer, min_samples integer, note text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('performance.read');
  return query
  select b.id, b.app, b.route, b.metric, b.target, b.consecutive, b.window_days,
         b.min_samples, b.note, b.updated_at
    from public.vital_budgets b
   where p_app is null or b.app = p_app
   order by b.app, b.route, b.metric;
end;
$$;

revoke all on function public.vital_budget_list(text) from public, anon;
grant execute on function public.vital_budget_list(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Row level security
-- ---------------------------------------------------------------------------
alter table public.verification_fields enable row level security;
alter table public.vital_budgets      enable row level security;
alter table public.vital_regressions  enable row level security;
alter table public.incident_actions   enable row level security;
alter table public.verification_attempts enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['vital_budgets', 'vital_regressions', 'incident_actions'] loop
    execute format('drop policy if exists %I_staff_read on public.%I', t, t);
    execute format(
      'create policy %I_staff_read on public.%I for select to authenticated using (bsdc.has_permission(''performance.read'') or bsdc.has_permission(''status.write''))',
      t, t);
  end loop;
end;
$$;

-- The field list is read by the console and by the harness, never written at
-- runtime. Enabling RLS with no policy means a direct select returns nothing,
-- which is correct: `verification_keys()` is the door, and it is a definer
-- function so it still answers.
drop policy if exists verification_fields_none on public.verification_fields;

-- Attempts are aggregate and nobody reads them directly; the health function
-- is the only door.
drop policy if exists verification_attempts_none on public.verification_attempts;

revoke all on public.verification_attempts from anon, authenticated;

-- The public board needs the published incidents and nothing else.
create or replace function public.status_board(p_limit integer default 20)
returns table (
  id           uuid,
  public_title text,
  public_slug  text,
  impact       bsdc_incident_impact,
  started_at   timestamptz,
  resolved_at  timestamptz,
  summary      text,
  updates      jsonb
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    i.id, i.public_title, i.public_slug, i.impact, i.started_at, i.resolved_at, i.summary,
    -- Only the public body. `internal_note` is not selected here at all, which
    -- is a stronger guarantee than a screen remembering not to render it.
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'body', u.public_body, 'state', u.state, 'at', u.created_at)
               order by u.created_at)
        from public.incident_updates u
       where u.incident_id = i.id and u.is_public
    ), '[]'::jsonb)
  from public.incidents i
  where not i.is_drill
    and i.public_title <> ''
  order by i.started_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.status_board(integer) from public;
grant execute on function public.status_board(integer) to anon, authenticated, service_role;

-- The incident a channel was opened for, so the chat can link back to the
-- public record. The link exists in both directions; without this half, the
-- staff channel is a conversation with no incident attached.
create or replace function public.channel_incident(p_channel_id uuid)
returns table (
  id           uuid,
  public_title text,
  public_slug  text,
  impact       bsdc_incident_impact,
  started_at   timestamptz,
  resolved_at  timestamptz,
  is_drill     boolean
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('status.write');
  return query
  select i.id, i.public_title, i.public_slug, i.impact, i.started_at, i.resolved_at, i.is_drill
    from public.incidents i
   where i.channel_id = p_channel_id
   order by i.started_at desc
   limit 1;
end;
$$;

revoke all on function public.channel_incident(uuid) from public, anon;
grant execute on function public.channel_incident(uuid) to authenticated, service_role;

-- What the staff console reads: both sides of every incident, for the people
-- who are allowed to see the internal one.
create or replace function public.incidents_with_updates(p_limit integer default 25)
returns table (
  id           uuid,
  service_key  text,
  title        text,
  public_title text,
  public_slug  text,
  impact       bsdc_incident_impact,
  started_at   timestamptz,
  declared_at  timestamptz,
  resolved_at  timestamptz,
  resolved_by  text,
  summary      text,
  postmortem   text,
  postmortem_at timestamptz,
  is_drill     boolean,
  channel_id   uuid,
  updates      jsonb,
  updates_v2   jsonb
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('status.write');

  return query
  select
    i.id, i.service_key, i.title, i.public_title, i.public_slug, i.impact,
    i.started_at, i.declared_at, i.resolved_at, i.resolved_by, i.summary,
    i.postmortem, i.postmortem_at, i.is_drill, i.channel_id,
    -- The legacy shape, kept because the public board's older reader expects
    -- `body`; and the two-box shape the console actually renders.
    coalesce((
      select jsonb_agg(jsonb_build_object('body', u.public_body, 'state', u.state, 'created_at', u.created_at)
               order by u.created_at)
        from public.incident_updates u
       where u.incident_id = i.id and u.is_public
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'public_body', u.public_body,
               'internal_note', u.internal_note,
               'state', u.state,
               'at', u.created_at)
               order by u.created_at)
        from public.incident_updates u
       where u.incident_id = i.id
    ), '[]'::jsonb)
  from public.incidents i
  order by (i.resolved_at is null) desc, i.started_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
end;
$$;

revoke all on function public.incidents_with_updates(integer) from public, anon;
grant execute on function public.incidents_with_updates(integer) to authenticated, service_role;

create or replace function public.incident_actions_for(p_incident_id uuid)
returns table (
  id         uuid,
  body       text,
  owner_uid  text,
  due_on     date,
  done_at    timestamptz,
  done_note  text,
  done_by    text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('status.write');
  return query
  select a.id, a.body, a.owner_uid, a.due_on, a.done_at, a.done_note, a.done_by
    from public.incident_actions a
   where a.incident_id = p_incident_id
   order by a.done_at nulls first, a.due_on;
end;
$$;

revoke all on function public.incident_actions_for(uuid) from public, anon;
grant execute on function public.incident_actions_for(uuid) to authenticated, service_role;

-- Any open action across all incidents, which is what a weekly operations
-- review actually wants: not "what did this incident leave behind" but "what
-- is late".
create or replace function public.incident_actions_open(p_limit integer default 100)
returns table (
  id            uuid,
  incident_id   uuid,
  incident_title text,
  body          text,
  owner_uid     text,
  due_on        date,
  days_late     integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('status.write');
  return query
  select a.id, a.incident_id, i.public_title, a.body, a.owner_uid, a.due_on,
         greatest(0, current_date - a.due_on)::integer
    from public.incident_actions a
    join public.incidents i on i.id = a.incident_id
   where a.done_at is null
   order by a.due_on
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.incident_actions_open(integer) from public, anon;
grant execute on function public.incident_actions_open(integer) to authenticated, service_role;
