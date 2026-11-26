-- ============================================================================
-- 0142 — a case joins the reports that belong together, and cannot be edited
-- ============================================================================
--
-- §49.9 of the plan. Today a report is handled one at a time: three complaints
-- about the same member from three people are three rows, each with its own
-- moderator, and nobody can see that they are one incident. A case is the thing
-- those rows belong to.
--
-- Two properties make a case worth keeping:
--
--   * its timeline is append-only. A case that can be edited proves nothing, so a
--     correction is a new event that says what changed, not a rewrite of the one
--     before it. The trigger that enforces this raises on update and on delete,
--     for every role including the owner of the function.
--   * a case and its reports are joined many-to-many. The same report can matter to
--     two cases — a post that breaks a rule about one member and harasses another —
--     and a unique constraint on the pair makes joining it twice a no-op rather
--     than a duplicate.

-- ---------------------------------------------------------------------------
-- 1. The outcome vocabulary
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_case_outcome') then
    create type bsdc_case_outcome as enum (
      'no_action',
      'content_removed',
      'account_suspended',
      'account_banned',
      'warned',
      'referred',
      'duplicate'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_case_status') then
    create type bsdc_case_status as enum ('open', 'pending', 'closed');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The case
-- ---------------------------------------------------------------------------
create table if not exists public.cases (
  id             uuid primary key default gen_random_uuid(),
  -- Whoever the case is about. Nullable, because a case can be opened about a
  -- pattern of spam that has no single author yet, and refusing to open one until
  -- a name is known would mean the pattern goes unrecorded.
  subject_uid    text references public.profiles (uid) on delete set null,
  status         bsdc_case_status not null default 'open',
  opened_by      text references public.profiles (uid) on delete set null,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  closed_by      text references public.profiles (uid) on delete set null,
  outcome        bsdc_case_outcome,
  -- What the member is told, as a key rather than a sentence: the same outcome
  -- reads differently to a member and to an appeal reviewer, and a key lets both
  -- be written later without storing the case twice.
  outcome_message_key text not null default '' check (char_length(outcome_message_key) <= 80),
  -- How many times it was closed and opened again. A case that keeps coming back is
  -- a case that was closed too early, and the count is the only evidence of that.
  reopened_count integer not null default 0 check (reopened_count >= 0),
  -- A case under legal hold cannot be deleted by any sweep and says so in the row,
  -- so a future retention job reads one column rather than a policy document.
  legal_hold     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- The states have to agree with the timestamps. A closed case without a closing
  -- time is a case whose duration nobody can measure.
  constraint cases_closed_is_dated
    check (
      (status = 'closed' and closed_at is not null and outcome is not null)
      or (status <> 'closed' and closed_at is null)
    )
);

create index if not exists cases_subject_idx on public.cases (subject_uid, opened_at desc);
create index if not exists cases_open_idx on public.cases (status, opened_at) where status <> 'closed';

drop trigger if exists cases_touch on public.cases;
create trigger cases_touch before update on public.cases
  for each row execute function bsdc.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Reports joined to a case
-- ---------------------------------------------------------------------------
create table if not exists public.case_reports (
  case_id    uuid not null references public.cases (id) on delete cascade,
  report_id  uuid not null references public.reports (id) on delete cascade,
  added_by   text references public.profiles (uid) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (case_id, report_id)
);

create index if not exists case_reports_report_idx on public.case_reports (report_id);

-- ---------------------------------------------------------------------------
-- 4. The timeline
-- ---------------------------------------------------------------------------
create table if not exists public.case_events (
  -- A bigserial rather than a uuid: a timeline is read in order, and a monotonic
  -- id makes "what happened after this" a range scan rather than a sort on a
  -- timestamp that two events can share.
  id         bigserial primary key,
  case_id    uuid not null references public.cases (id) on delete cascade,
  kind       text not null check (kind in (
    'opened', 'report_linked', 'report_unlinked', 'note', 'status',
    'outcome', 'reopened', 'closed', 'hold', 'release', 'assignment')),
  actor_uid  text references public.profiles (uid) on delete set null,
  -- What was said or done. Never rewritten; a correction is a new event.
  body       text not null default '' check (char_length(body) <= 2000),
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists case_events_timeline_idx on public.case_events (case_id, id);
create index if not exists case_events_actor_idx on public.case_events (actor_uid, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. The append-only guarantee
-- ---------------------------------------------------------------------------
-- This is the mechanism the whole migration is for. It is a trigger rather than a
-- privilege because staff hold `delete` on tables elsewhere in this schema for
-- legitimate reasons, and a case timeline must not be one of them — including for
-- whoever is signed in as the owner of the database.
create or replace function bsdc.case_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'A case timeline cannot be edited. Add an event saying what changed instead.'
      using errcode = '42501';
  elsif tg_op = 'DELETE' then
    raise exception
      'A case timeline cannot be deleted, including by closing the case.'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

revoke all on function bsdc.case_events_append_only() from public, anon, authenticated;

drop trigger if exists case_events_no_update on public.case_events;
create trigger case_events_no_update
  before update on public.case_events
  for each row execute function bsdc.case_events_append_only();

drop trigger if exists case_events_no_delete on public.case_events;
create trigger case_events_no_delete
  before delete on public.case_events
  for each row execute function bsdc.case_events_append_only();

comment on table public.case_events is
  'Append-only case timeline. A trigger refuses update and delete for every role; corrections are new events.';

-- ---------------------------------------------------------------------------
-- 6. Policies
-- ---------------------------------------------------------------------------
alter table public.cases enable row level security;
alter table public.case_reports enable row level security;
alter table public.case_events enable row level security;

-- A member sees the cases about themselves, and only the timeline, not the notes
-- staff wrote to each other. `moderation.read` sees everything.
drop policy if exists cases_read_own on public.cases;
create policy cases_read_own on public.cases
  for select using (subject_uid = bsdc.current_uid());

drop policy if exists cases_read_staff on public.cases;
create policy cases_read_staff on public.cases
  for select using (bsdc.has_permission('moderation.read'));

drop policy if exists case_reports_read_own on public.case_reports;
create policy case_reports_read_own on public.case_reports
  for select using (exists (
    select 1 from public.cases c
     where c.id = case_reports.case_id and c.subject_uid = bsdc.current_uid()
  ));

drop policy if exists case_reports_read_staff on public.case_reports;
create policy case_reports_read_staff on public.case_reports
  for select using (bsdc.has_permission('moderation.read'));

drop policy if exists case_events_read_own on public.case_events;
create policy case_events_read_own on public.case_events
  for select using (
    -- The member sees what happened, but not the internal note staff leave for each
    -- other. A case a member can read end to end is a case they can answer, and one
    -- they can read the staffroom chatter from is a case that turns into a leak.
    kind <> 'note'
    and exists (
      select 1 from public.cases c
       where c.id = case_events.case_id and c.subject_uid = bsdc.current_uid()
    )
  );

drop policy if exists case_events_read_staff on public.case_events;
create policy case_events_read_staff on public.case_events
  for select using (bsdc.has_permission('moderation.read'));

-- No insert, update or delete policy anywhere: every write goes through a
-- security-definer RPC that checks `moderation.resolve` and writes the event that
-- describes what it did, in the same transaction.

revoke all on public.cases from anon;
revoke all on public.cases from authenticated;
grant select on public.cases to authenticated;

revoke all on public.case_reports from anon;
revoke all on public.case_reports from authenticated;
grant select on public.case_reports to authenticated;

revoke all on public.case_events from anon;
revoke all on public.case_events from authenticated;
grant select on public.case_events to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The five RPCs
-- ---------------------------------------------------------------------------

-- Open a case. A report can be attached in the same call, because a case usually
-- starts as one report and an extra round trip is an extra chance to forget.
create or replace function public.open_case(
  p_subject_uid text default null,
  p_report_id   uuid default null,
  p_note        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me   text := bsdc.current_uid();
  v_id   uuid;
begin
  perform bsdc.require_permission('moderation.resolve');
  if v_me is null then
    raise exception 'Sign in to open a case' using errcode = '42501';
  end if;

  if p_subject_uid is not null
     and not exists (select 1 from public.profiles where uid = p_subject_uid) then
    raise exception 'No such member' using errcode = 'P0002';
  end if;

  insert into public.cases (subject_uid, opened_by) values (p_subject_uid, v_me)
  returning id into v_id;

  insert into public.case_events (case_id, kind, actor_uid, body)
  values (v_id, 'opened', v_me, left(coalesce(p_note, ''), 2000));

  if p_report_id is not null then
    perform public.attach_report_to_case(v_id, p_report_id);
  end if;

  perform bsdc.audit('case.open', 'case:' || v_id::text,
    jsonb_build_object('subject_uid', p_subject_uid, 'report_id', p_report_id));

  return v_id;
end;
$$;

revoke all on function public.open_case(text, uuid, text) from public, anon;
grant execute on function public.open_case(text, uuid, text) to authenticated, service_role;

-- Join a report to a case. Idempotent: the second call says so rather than
-- raising, because a bulk attach should not stop at the row that was already there.
create or replace function public.attach_report_to_case(p_case_id uuid, p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me     text := bsdc.current_uid();
  v_case   public.cases;
  v_report public.reports;
  -- An integer, because `GET DIAGNOSTICS <var> = row_count` assigns a count and
  -- will not narrow it to a boolean. The first version declared this as boolean and
  -- every attach failed with "operator does not exist: boolean > integer".
  v_rows   integer := 0;
begin
  perform bsdc.require_permission('moderation.resolve');

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'No such case' using errcode = 'P0002';
  end if;
  if v_case.status = 'closed' then
    raise exception 'This case is closed. Reopen it before adding to it.' using errcode = '22023';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if v_report.id is null then
    raise exception 'No such report' using errcode = 'P0002';
  end if;

  insert into public.case_reports (case_id, report_id, added_by)
  values (p_case_id, p_report_id, v_me)
  on conflict (case_id, report_id) do nothing;

  get diagnostics v_rows = row_count;

  -- An event only when something changed. A timeline that records the same link
  -- twice is a timeline that makes a case look busier than it was.
  if v_rows > 0 then
    insert into public.case_events (case_id, kind, actor_uid, body, metadata)
    values (p_case_id, 'report_linked', v_me, '',
      jsonb_build_object('report_id', p_report_id,
                         'report_reason', left(v_report.reason, 200)));
  end if;

  return v_rows > 0;
end;
$$;

revoke all on function public.attach_report_to_case(uuid, uuid) from public, anon;
grant execute on function public.attach_report_to_case(uuid, uuid) to authenticated, service_role;

-- A note on the case. The only writer a moderator needs most of the time.
create or replace function public.add_case_note(
  p_case_id   uuid,
  p_body      text,
  p_kind      text default 'note',
  p_metadata  jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me   text := bsdc.current_uid();
  v_case public.cases;
  v_id   bigint;
begin
  perform bsdc.require_permission('moderation.resolve');

  if p_kind not in ('note', 'assignment', 'hold', 'release') then
    raise exception 'That is not a note a person can write; use the verb that does it' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 2 then
    raise exception 'A note needs something in it' using errcode = '22023';
  end if;

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'No such case' using errcode = 'P0002';
  end if;
  if v_case.status = 'closed' then
    raise exception 'This case is closed. Reopen it before writing on it.' using errcode = '22023';
  end if;

  insert into public.case_events (case_id, kind, actor_uid, body, metadata)
  values (p_case_id, p_kind, v_me, left(btrim(p_body), 2000), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.add_case_note(uuid, text, text, jsonb) from public, anon;
grant execute on function public.add_case_note(uuid, text, text, jsonb) to authenticated, service_role;

-- Close a case. The outcome is required, because a closed case with no outcome is
-- a case nobody can learn from.
create or replace function public.close_case(
  p_case_id         uuid,
  p_outcome         text,
  p_outcome_message_key text default '',
  p_note            text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me   text := bsdc.current_uid();
  v_case public.cases;
  v_out  bsdc_case_outcome;
begin
  perform bsdc.require_permission('moderation.resolve');

  begin
    v_out := p_outcome::bsdc_case_outcome;
  exception
    when others then
      raise exception 'Unknown outcome %. A case ends as one of: %.',
        p_outcome,
        (select string_agg(e::text, ', ' order by e::text)
           from unnest(enum_range(null::bsdc_case_outcome)) e)
        using errcode = '22023';
  end;

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'No such case' using errcode = 'P0002';
  end if;
  if v_case.status = 'closed' then
    raise exception 'This case is already closed' using errcode = '22023';
  end if;

  update public.cases
     set status = 'closed',
         closed_at = now(),
         closed_by = v_me,
         outcome = v_out,
         outcome_message_key = left(coalesce(p_outcome_message_key, ''), 80)
   where id = p_case_id;

  insert into public.case_events (case_id, kind, actor_uid, body, metadata)
  values (p_case_id, 'closed', v_me, left(coalesce(p_note, ''), 2000),
          jsonb_build_object('outcome', v_out::text,
                             'message_key', coalesce(p_outcome_message_key, '')));

  perform bsdc.audit('case.close', 'case:' || p_case_id::text,
    jsonb_build_object('outcome', v_out::text));

  -- The member is told, through the same channel every other decision uses.
  --
  -- `notify_report_outcome` takes `(uid, resolved, note)` — a boolean, not a
  -- category — so the case maps onto it: an outcome of `no_action` or `duplicate`
  -- is not a resolution of anything, and every other outcome is. The note carries
  -- the message key and the staff member's words, because the console owns the
  -- copy and the key is what it looks the copy up by.
  if v_case.subject_uid is not null then
    perform bsdc.notify_report_outcome(
      v_case.subject_uid,
      v_out not in ('no_action', 'duplicate'),
      coalesce(nullif(btrim(p_outcome_message_key), ''), v_out::text)
        || case when btrim(coalesce(p_note, '')) <> '' then ': ' || btrim(p_note) else '' end
    );
  end if;
end;
$$;

revoke all on function public.close_case(uuid, text, text, text) from public, anon;
grant execute on function public.close_case(uuid, text, text, text) to authenticated, service_role;

-- Reopen. Counted, because a case that keeps returning is the signal.
create or replace function public.reopen_case(p_case_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me   text := bsdc.current_uid();
  v_case public.cases;
begin
  perform bsdc.require_permission('moderation.resolve');

  if char_length(btrim(coalesce(p_reason, ''))) < 12 then
    raise exception 'Reopening a closed case needs a reason of at least 12 characters'
      using errcode = '22023';
  end if;

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'No such case' using errcode = 'P0002';
  end if;
  if v_case.status <> 'closed' then
    raise exception 'This case is not closed, so there is nothing to reopen' using errcode = '22023';
  end if;

  update public.cases
     set status = 'open',
         closed_at = null,
         outcome = null,
         outcome_message_key = '',
         reopened_count = reopened_count + 1
   where id = p_case_id;

  insert into public.case_events (case_id, kind, actor_uid, body)
  values (p_case_id, 'reopened', v_me, left(btrim(p_reason), 2000));

  perform bsdc.audit('case.reopen', 'case:' || p_case_id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.reopen_case(uuid, text) from public, anon;
grant execute on function public.reopen_case(uuid, text) to authenticated, service_role;

-- The read the console shows: one case, its reports, its timeline.
create or replace function public.admin_case(p_case_id uuid)
returns table (
  id             uuid,
  subject_uid    text,
  subject_name   text,
  status         text,
  outcome        text,
  outcome_message_key text,
  reopened_count integer,
  legal_hold     boolean,
  opened_by      text,
  opened_at      timestamptz,
  closed_at      timestamptz,
  reports        jsonb,
  events         jsonb
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('moderation.read');

  return query
    select c.id, c.subject_uid,
           coalesce(p.display_name, p.username, ''),
           c.status::text,
           coalesce(c.outcome::text, ''),
           c.outcome_message_key,
           c.reopened_count,
           c.legal_hold,
           c.opened_by,
           c.opened_at,
           c.closed_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'report_id', r.id,
                      'reason', r.reason,
                      'status', r.status::text,
                      'reporter_uid', r.reporter_uid,
                      'added_at', cr.added_at) order by cr.added_at)
               from public.case_reports cr
               join public.reports r on r.id = cr.report_id
              where cr.case_id = c.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', e.id,
                      'kind', e.kind,
                      'actor_uid', e.actor_uid,
                      'body', e.body,
                      'metadata', e.metadata,
                      'created_at', e.created_at) order by e.id)
               from public.case_events e
              where e.case_id = c.id
           ), '[]'::jsonb)
      from public.cases c
      left join public.profiles p on p.uid = c.subject_uid
     where c.id = p_case_id;
end;
$$;

revoke all on function public.admin_case(uuid) from public, anon;
grant execute on function public.admin_case(uuid) to authenticated, service_role;

-- The queue: open cases, oldest first, with how many reports each one joins and
-- how long it has been open.
create or replace function public.case_queue(
  p_status text default 'open',
  p_limit  integer default 50
)
returns table (
  id            uuid,
  subject_uid   text,
  subject_name  text,
  status        text,
  reports       integer,
  reopened_count integer,
  age_hours     integer,
  opened_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('moderation.read');
  if p_status is not null and p_status not in ('open', 'pending', 'closed') then
    raise exception 'A queue is open, pending or closed' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'A queue page holds between 1 and 200 cases' using errcode = '22023';
  end if;

  return query
    select c.id, c.subject_uid,
           coalesce(p.display_name, p.username, ''),
           c.status::text,
           (select count(*)::int from public.case_reports cr where cr.case_id = c.id),
           c.reopened_count,
           greatest(0, floor(extract(epoch from (now() - c.opened_at)) / 3600))::int,
           c.opened_at
      from public.cases c
      left join public.profiles p on p.uid = c.subject_uid
     where p_status is null or c.status = p_status::bsdc_case_status
     -- Oldest first, and a legal hold ahead of everything: a case that cannot be
     -- deleted is a case whose deadline is not negotiable.
     order by c.legal_hold desc, c.opened_at asc
     limit p_limit;
end;
$$;

revoke all on function public.case_queue(text, integer) from public, anon;
grant execute on function public.case_queue(text, integer) to authenticated, service_role;
