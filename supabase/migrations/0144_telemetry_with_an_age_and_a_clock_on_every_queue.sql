-- ============================================================================
-- 0144 — telemetry that is honest about itself, and a clock on every queue
-- ============================================================================
--
-- §8.1 and §8.2 of the plan, as database work.
--
-- A count with no age and no comparison cannot answer the question an operator is
-- actually asking, which is "is this normal?". Three things make a number honest:
--
--   * **age** — the timestamp of the query that produced it, so a stale panel
--     announces itself instead of looking like now;
--   * **delta** — the same measurement over the preceding window, so a number has
--     a direction;
--   * **provenance** — the object each number came from, so "where does this come
--     from" is one lookup and not an afternoon.
--
-- The first two are numbers; the third is the reason this migration has a table
-- rather than a comment. A KPI whose source is recorded in a function body drifts
-- from the function, and a metric registry that a test can check is the only kind
-- that stays true.

-- ---------------------------------------------------------------------------
-- 1. The metric registry
-- ---------------------------------------------------------------------------
-- Every number the console shows names a key here. `admin_telemetry_delta` reads
-- this table to decide what to measure, so adding a KPI is a row — and a test can
-- assert that no key is used that is not defined.
create table if not exists public.metric_definitions (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  label        text not null check (char_length(btrim(label)) between 2 and 80),
  -- One sentence a reader can check the number against. Not a marketing line: it
  -- has to say what is counted and what is excluded.
  definition   text not null check (char_length(btrim(definition)) between 10 and 400),
  -- Where the number comes from, as a real object name. `source_table` is set for a
  -- plain count; `source_rpc` for anything computed.
  source_table text,
  source_rpc   text,
  unit         text not null default 'count' check (unit in ('count', 'bytes', 'seconds', 'percent')),
  -- What happens when a number goes the wrong way. 'neutral' means a reader has to
  -- think about it, which is honest for most counts.
  direction    text not null default 'neutral' check (direction in ('up_is_bad', 'up_is_good', 'neutral')),
  -- The threshold at which this number stops being worth a glance. Null means
  -- never: the panel shows it and colours nothing.
  alert_above  numeric,
  owner_uid    text references public.profiles (uid) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.metric_definitions enable row level security;

drop policy if exists metric_definitions_read_staff on public.metric_definitions;
create policy metric_definitions_read_staff on public.metric_definitions
  for select using (bsdc.is_staff());

revoke all on public.metric_definitions from anon;
revoke all on public.metric_definitions from authenticated;
grant select on public.metric_definitions to authenticated;

-- The eleven numbers the existing snapshot returns, plus the two the plan adds.
-- `on conflict do nothing` so re-running cannot overwrite a definition somebody has
-- since corrected — including the definition being the thing that was wrong.
insert into public.metric_definitions (key, label, definition, source_table, unit, direction, alert_above) values
  ('staff.active', 'Staff signed in',
   'Rows in staff_records marked active. Not the same as people currently signed in to a console; that is admin_staff_sessions.',
   'staff_records', 'count', 'neutral', null),
  ('certificates.issued', 'Certificates issued',
   'issued_certificates with status issued. A revoked certificate moves out of this count.',
   'issued_certificates', 'count', 'neutral', null),
  ('certificates.revoked', 'Certificates revoked',
   'issued_certificates with status revoked. A revocation is permanent, so this only grows.',
   'issued_certificates', 'count', 'up_is_bad', null),
  ('notices.live', 'Notices live',
   'notices published with publish_at in the past and no expiry, or an expiry still in the future.',
   'notices', 'count', 'neutral', null),
  ('notices.draft', 'Notices in draft',
   'notices with status draft. A draft that sits here for weeks is usually forgotten rather than pending.',
   'notices', 'count', 'neutral', null),
  ('ip.rules', 'IP rules in force',
   'ip_rules that have not expired. An expired rule stays in the table and stops counting here.',
   'ip_rules', 'count', 'neutral', null),
  ('pages.live', 'Custom pages live',
   'custom_pages with status published.',
   'custom_pages', 'count', 'neutral', null),
  ('seo.overrides', 'SEO overrides',
   'Rows in seo_overrides. A row is not the same as a good one; seo_coverage judges that.',
   'seo_overrides', 'count', 'neutral', null),
  ('redirects.live', 'Redirects enabled',
   'redirects with is_enabled true. A disabled redirect is kept, so this is not the row count.',
   'redirects', 'count', 'neutral', null),
  ('errors.unresolved', 'Unresolved client errors',
   'client_errors with is_resolved false. This is the number that should make somebody open the errors screen.',
   'client_errors', 'count', 'up_is_bad', 0),
  ('incidents.open', 'Incidents open',
   'incidents with resolved_at null. A platform-wide outage is one row here regardless of how many people were affected.',
   'incidents', 'count', 'up_is_bad', 0),
  ('audit.events_24h', 'Audit events, last 24 hours',
   'audit_log rows in the trailing 24 hours. A sudden drop is as interesting as a spike: it can mean writes are being refused.',
   'audit_log', 'count', 'neutral', null),
  ('cases.open', 'Cases open',
   'cases whose status is not closed. A case is one incident, however many reports it joins.',
   'cases', 'count', 'up_is_bad', null),
  ('standing.below_zero', 'Members with negative standing',
   'profiles whose standing_points is below zero. The ledger is the truth; this read uses the cache, which standing_reconcile checks.',
   'profiles', 'count', 'up_is_bad', null)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Where a measurement is taken from
-- ---------------------------------------------------------------------------
-- One function, so the current read and the delta read cannot disagree about what
-- a key means. `p_since` and `p_until` are the window; a null window means "now" for
-- the end and "the beginning" for the start, which is what a total count wants.
create or replace function bsdc.metric_value(p_key text, p_since timestamptz, p_until timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_n integer;
begin
  -- The windows are applied only to the tables that have a meaningful created_at.
  -- A count of live notices is a count of what is live now; asking how many were
  -- live in the week before last is a different question, and one nobody asked.
  case p_key
    when 'staff.active' then
      select count(*) into v_n from public.staff_records where is_active;
    when 'certificates.issued' then
      select count(*) into v_n from public.issued_certificates where status = 'issued';
    when 'certificates.revoked' then
      select count(*) into v_n
        from public.issued_certificates
       where status = 'revoked'
         and (p_since is null or revoked_at >= p_since)
         and (p_until is null or revoked_at < p_until);
    when 'notices.live' then
      select count(*) into v_n from public.notices
       where status = 'published' and publish_at <= now()
         and (expires_at is null or expires_at > now());
    when 'notices.draft' then
      select count(*) into v_n from public.notices where status = 'draft';
    when 'ip.rules' then
      select count(*) into v_n from public.ip_rules
       where expires_at is null or expires_at > now();
    when 'pages.live' then
      select count(*) into v_n from public.custom_pages where status = 'published';
    when 'seo.overrides' then
      select count(*) into v_n from public.seo_overrides;
    when 'redirects.live' then
      select count(*) into v_n from public.redirects where is_enabled;
    when 'errors.unresolved' then
      -- Unresolved now, windowed by when it was *last seen*, because this table is
      -- keyed by fingerprint and has no `created_at` — a repeated error bumps
      -- `last_seen` rather than adding a row. The first attempt used `created_at`
      -- and the whole read failed, which is the cost of guessing a column name
      -- instead of probing the migration.
      select count(*) into v_n from public.client_errors
       where not is_resolved
         and (p_since is null or last_seen >= p_since)
         and (p_until is null or last_seen < p_until);
    when 'incidents.open' then
      select count(*) into v_n from public.incidents
       where resolved_at is null
         and (p_since is null or started_at >= p_since)
         and (p_until is null or started_at < p_until);
    when 'audit.events_24h' then
      select count(*) into v_n from public.audit_log
       where created_at >= coalesce(p_since, now() - interval '24 hours')
         and (p_until is null or created_at < p_until);
    when 'cases.open' then
      select count(*) into v_n from public.cases where status <> 'closed';
    when 'standing.below_zero' then
      select count(*) into v_n from public.profiles where standing_points < 0;
    else
      raise exception 'Unknown metric %. Add it to public.metric_definitions and to bsdc.metric_value.',
        p_key using errcode = 'P0002';
  end case;

  return coalesce(v_n, 0);
end;
$$;

revoke all on function bsdc.metric_value(text, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The delta read
-- ---------------------------------------------------------------------------
-- The plan asks for the snapshot computed twice in one RPC. Two round trips would
-- let the two halves land in different seconds, and a delta computed from two
-- different moments is a delta with an error bar nobody can see.
create or replace function public.admin_telemetry_delta(p_window_minutes integer default 60)
returns table (
  key           text,
  label         text,
  unit          text,
  direction     text,
  alert_above   numeric,
  source_table  text,
  source_rpc    text,
  current_value integer,
  previous_value integer,
  delta         integer,
  measured_at   timestamptz,
  window_minutes integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_now   timestamptz := now();
  v_begin timestamptz;
  v_prev  timestamptz;
begin
  if not (bsdc.has_permission('audit.read') or bsdc.is_staff()) then
    raise exception 'Telemetry needs audit.read' using errcode = '42501';
  end if;
  if p_window_minutes is null or p_window_minutes < 1 or p_window_minutes > 10080 then
    raise exception 'A window is between 1 minute and 7 days' using errcode = '22023';
  end if;

  v_begin := v_now - make_interval(mins => p_window_minutes);
  v_prev  := v_begin - make_interval(mins => p_window_minutes);

  return query
    select
      m.key, m.label, m.unit, m.direction, m.alert_above,
      m.source_table, m.source_rpc,
      bsdc.metric_value(m.key, v_begin, v_now) as current_value,
      bsdc.metric_value(m.key, v_prev, v_begin) as previous_value,
      bsdc.metric_value(m.key, v_begin, v_now)
        - bsdc.metric_value(m.key, v_prev, v_begin) as delta,
      -- One timestamp for the whole page, so two rows cannot disagree about when
      -- they were taken.
      v_now,
      p_window_minutes
      from public.metric_definitions m
     order by m.key;
end;
$$;

revoke all on function public.admin_telemetry_delta(integer) from public, anon;
grant execute on function public.admin_telemetry_delta(integer) to authenticated, service_role;

-- The old snapshot keeps its signature and its eleven columns, because a console
-- that has not been upgraded still calls it. Rewritten to read through
-- `metric_value`, so the two can never disagree about what a number means — which
-- is exactly the drift the plan warns about when it says the upgrade is depth, not
-- replacement.
create or replace function public.admin_telemetry_snapshot()
returns table (
  staff_active          integer,
  issued_certificates   integer,
  revoked_certificates  integer,
  live_notices          integer,
  draft_notices         integer,
  active_ip_rules       integer,
  custom_pages_live     integer,
  seo_overrides_count   integer,
  redirects_count       integer,
  unresolved_errors     integer,
  open_incidents        integer,
  audit_events_24h      integer
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    bsdc.metric_value('staff.active', null, null),
    bsdc.metric_value('certificates.issued', null, null),
    bsdc.metric_value('certificates.revoked', null, null),
    bsdc.metric_value('notices.live', null, null),
    bsdc.metric_value('notices.draft', null, null),
    bsdc.metric_value('ip.rules', null, null),
    bsdc.metric_value('pages.live', null, null),
    bsdc.metric_value('seo.overrides', null, null),
    bsdc.metric_value('redirects.live', null, null),
    bsdc.metric_value('errors.unresolved', null, null),
    bsdc.metric_value('incidents.open', null, null),
    bsdc.metric_value('audit.events_24h', null, null)
  where bsdc.has_permission('audit.read') or bsdc.is_staff();
$$;

revoke all on function public.admin_telemetry_snapshot() from public, anon;
grant execute on function public.admin_telemetry_snapshot() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The SLA clock
-- ---------------------------------------------------------------------------
-- A queue with no target is a queue nobody is late for. The clock starts at the
-- item's own `created_at`, not at the moment somebody noticed it, because a row
-- that waited a week before a moderator looked at it is a week late however it is
-- dressed up.
create table if not exists public.sla_policies (
  queue                text not null check (queue in ('approvals', 'moderation', 'cases', 'appeals')),
  severity             text not null check (severity in ('critical', 'high', 'normal', 'low')),
  respond_within_minutes integer not null check (respond_within_minutes between 1 and 43200),
  resolve_within_minutes integer not null check (resolve_within_minutes between 1 and 100800),
  owner_uid            text references public.profiles (uid) on delete set null,
  updated_by           text references public.profiles (uid) on delete set null,
  updated_at           timestamptz not null default now(),
  primary key (queue, severity),
  -- A resolve target shorter than the respond target is a policy that guarantees
  -- failure before the first step.
  constraint sla_policies_order check (resolve_within_minutes >= respond_within_minutes)
);

alter table public.sla_policies enable row level security;

drop policy if exists sla_policies_read_staff on public.sla_policies;
create policy sla_policies_read_staff on public.sla_policies
  for select using (bsdc.is_staff());

revoke all on public.sla_policies from anon;
revoke all on public.sla_policies from authenticated;
grant select on public.sla_policies to authenticated;

-- Seeded for the four queues that exist. `on conflict do nothing` so a tuned target
-- survives a re-run.
insert into public.sla_policies (queue, severity, respond_within_minutes, resolve_within_minutes) values
  ('approvals',  'critical',   60,   240),
  ('approvals',  'high',      240,  1440),
  ('approvals',  'normal',    1440,  4320),
  ('approvals',  'low',       4320, 10080),
  ('moderation', 'critical',   30,   120),
  ('moderation', 'high',      120,   720),
  ('moderation', 'normal',    720,  2880),
  ('moderation', 'low',      1440,  7200),
  ('cases',      'critical',   60,   480),
  ('cases',      'high',      240,  1440),
  ('cases',      'normal',    1440,  5760),
  ('cases',      'low',       2880, 10080),
  ('appeals',    'critical',  120,   720),
  ('appeals',    'high',      480,  2880),
  ('appeals',    'normal',   1440,  5760),
  ('appeals',    'low',       2880, 10080)
on conflict (queue, severity) do nothing;

-- Writing one is a settings change, and a settings change is audited.
create or replace function public.set_sla_target(
  p_queue     text,
  p_severity  text,
  p_respond   integer,
  p_resolve   integer,
  p_owner     text default null
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_before public.sla_policies;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_before from public.sla_policies
   where queue = p_queue and severity = p_severity;

  insert into public.sla_policies
    (queue, severity, respond_within_minutes, resolve_within_minutes, owner_uid, updated_by, updated_at)
  values
    (p_queue, p_severity, p_respond, p_resolve, p_owner, bsdc.current_uid(), now())
  on conflict (queue, severity) do update
    set respond_within_minutes = excluded.respond_within_minutes,
        resolve_within_minutes = excluded.resolve_within_minutes,
        owner_uid   = excluded.owner_uid,
        updated_by  = excluded.updated_by,
        updated_at  = now();

  perform bsdc.audit_full(
    'sla.set',
    'sla:' || p_queue || ':' || p_severity,
    jsonb_build_object('queue', p_queue, 'severity', p_severity),
    jsonb_build_object(
      'before', jsonb_build_object(
        'respond', v_before.respond_within_minutes,
        'resolve', v_before.resolve_within_minutes,
        'owner', v_before.owner_uid),
      'after', jsonb_build_object(
        'respond', p_respond,
        'resolve', p_resolve,
        'owner', p_owner)),
    format('Targets changed for the %s queue at %s severity', p_queue, p_severity)
  );
end;
$$;

revoke all on function public.set_sla_target(text, text, integer, integer, text) from public, anon;
grant execute on function public.set_sla_target(text, text, integer, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. How late is this row
-- ---------------------------------------------------------------------------
-- One function the console calls per row, so the countdown on the screen and the
-- sort order in the queue cannot disagree. It returns the state a reader needs and
-- no more: how long since it arrived, how long is allowed, and how that compares.
create or replace function public.sla_status(
  p_queue    text,
  p_severity text,
  p_created_at timestamptz
)
returns table (
  severity       text,
  age_minutes    integer,
  respond_within integer,
  resolve_within integer,
  respond_state  text,
  resolve_state  text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- The output column `severity` has the same name as a column of `sla_policies`, and
-- an unqualified reference inside this body is ambiguous — `t104` reported
-- "column reference severity is ambiguous" for every clock question. Every
-- reference below is qualified with its own alias.
#variable_conflict use_column
declare
  v_policy public.sla_policies;
  v_age    integer;
begin
  select * into v_policy from public.sla_policies sp
   where sp.queue = p_queue and sp.severity = p_severity;
  if v_policy.queue is null then
    raise exception 'No SLA policy for the %s queue at %s severity', p_queue, p_severity
      using errcode = 'P0002';
  end if;

  v_age := greatest(0, floor(extract(epoch from (now() - p_created_at)) / 60))::integer;

  return query
    select
      p_severity,
      v_age,
      v_policy.respond_within_minutes,
      v_policy.resolve_within_minutes,
      case
        -- Half the budget spent is 'watching', not 'late'. A screen that only has
        -- two colours cannot show somebody that a clock is running.
        when v_age >= v_policy.respond_within_minutes then 'breached'
        when v_age >= v_policy.respond_within_minutes / 2 then 'watching'
        else 'ok'
      end,
      case
        when v_age >= v_policy.resolve_within_minutes then 'breached'
        when v_age >= v_policy.resolve_within_minutes / 2 then 'watching'
        else 'ok'
      end;
end;
$$;

revoke all on function public.sla_status(text, text, timestamptz) from public, anon;
grant execute on function public.sla_status(text, text, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The approvals queue, with its clock attached
-- ---------------------------------------------------------------------------
-- The console's Approvals tab currently reads three separate lists. One read with
-- the age and the target beside each row is what lets the screen sort by lateness
-- rather than by arrival, which is the whole point of a clock.
create or replace function public.approvals_with_sla(p_limit integer default 100)
returns table (
  kind          text,
  id            uuid,
  title         text,
  who           text,
  status        text,
  severity      text,
  age_minutes   integer,
  respond_within integer,
  resolve_within integer,
  respond_state text,
  resolve_state text,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('moderation.read');
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'A page holds between 1 and 500 rows' using errcode = '22023';
  end if;

  return query
  with pending as (
    select 'shop'::text as kind, a.id, a.shop_name as title,
           coalesce(p.display_name, a.owner_uid) as who,
           a.status::text as status, a.submitted_at as created_at
      from public.mk_vendor_applications a
      left join public.profiles p on p.uid = a.owner_uid
     where a.status = 'submitted'
    union all
    select 'campaign', c.id, c.name,
           coalesce(p.display_name, c.owner_uid),
           c.status::text, c.created_at
      from public.ad_campaigns c
      left join public.profiles p on p.uid = c.owner_uid
     -- `pending_review`, not `pending`: the ad status enum is
     -- draft, pending_review, active, paused, rejected, completed.
     where c.status = 'pending_review'
  ),
  judged as (
    select d.*, sla.severity, sla.age_minutes, sla.respond_within,
           sla.resolve_within, sla.respond_state, sla.resolve_state
      from pending d
      cross join lateral (
        select * from public.sla_status(
          'approvals',
          -- Every item in this queue is normal severity until a policy says
          -- otherwise; a severity column on the item is a later migration, and
          -- inventing one here would be a column the console cannot set.
          'normal',
          d.created_at)
      ) sla
  )
  select j.kind, j.id, j.title, j.who, j.status, j.severity, j.age_minutes,
         j.respond_within, j.resolve_within, j.respond_state, j.resolve_state,
         j.created_at
    from judged j
   -- Breached first, then the oldest. A row that is nearly late outranks a row
   -- that arrived a minute ago and is nowhere near its target.
   order by (j.respond_state = 'breached') desc,
            (j.resolve_state = 'breached') desc,
            j.age_minutes desc,
            j.created_at asc
   limit p_limit;
end;
$$;

revoke all on function public.approvals_with_sla(integer) from public, anon;
grant execute on function public.approvals_with_sla(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. A case queue that carries its clock
-- ---------------------------------------------------------------------------
-- 0142's `case_queue` returns the age but not the target. Rather than change its
-- signature — other things call it — this is a second read that joins the policy.
create or replace function public.case_queue_with_sla(p_limit integer default 100)
returns table (
  id             uuid,
  subject_uid    text,
  subject_name   text,
  status         text,
  reports        integer,
  reopened_count integer,
  age_hours      integer,
  respond_within integer,
  respond_state  text,
  resolve_state  text,
  legal_hold     boolean,
  opened_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('moderation.read');
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'A queue page holds between 1 and 200 cases' using errcode = '22023';
  end if;

  return query
    select c.id, c.subject_uid,
           coalesce(p.display_name, p.username, ''),
           c.status::text,
           (select count(*)::int from public.case_reports cr where cr.case_id = c.id),
           c.reopened_count,
           greatest(0, floor(extract(epoch from (now() - c.opened_at)) / 3600))::integer,
           s.respond_within,
           case c.status when 'closed' then 'met' else s.respond_state end,
           case c.status when 'closed' then 'met' else s.resolve_state end,
           c.legal_hold,
           c.opened_at
      from public.cases c
      left join public.profiles p on p.uid = c.subject_uid
      cross join lateral (
        select * from public.sla_status('cases', 'normal', c.opened_at)
      ) s
     where c.status <> 'closed'
     order by c.legal_hold desc,
              (s.respond_state = 'breached') desc,
              c.opened_at asc
     limit p_limit;
end;
$$;

revoke all on function public.case_queue_with_sla(integer) from public, anon;
grant execute on function public.case_queue_with_sla(integer) to authenticated, service_role;
