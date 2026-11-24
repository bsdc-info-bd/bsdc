-- 0135: the audit trail becomes a record, not a receipt.
--
-- Three gaps, all of them versions of the same problem: the audit table could
-- say *that* something happened and nothing else.
--
--   G1  `ip_hash` has been a column since 0001 and has never been written by
--       anything. A column that is always empty is worse than no column: it
--       looks like the platform records where an action came from.
--
--   G3  No action records a diff. `metadata` holds whatever the caller felt
--       like passing, so "role → moderator" is invisible: a reviewer can see
--       that a role changed and not what it changed from.
--
--   G9  There is no session governance. A staff sign-in is a Firebase token and
--       nothing else: no record of where it came from, no way to review active
--       sessions, no way to revoke one, and no way to notice the same account
--       signing in from Dhaka and London forty minutes apart.
--
-- What this migration does NOT do: change the shape of `audit_log` in a way any
-- existing reader depends on. `action`, `subject`, `metadata` and `created_at`
-- keep their meaning. Two nullable columns are added, and the helper gains an
-- optional diff argument that defaults to empty.
--
-- Reversal: drop `staff_sessions`, drop the four functions added here, and
-- restore the 0134 body of `bsdc.audit`. The added columns are nullable and are
-- ignored by every reader, so they can be left in place during a rollback.

set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 1. G1 — where an action came from
-- ============================================================================
--
-- The address itself is never stored. A staff console is used from home, from
-- an office, and from a phone on mobile data; the address is personal data with
-- no retention justification, and the platform already stores enough. What is
-- stored is a hash, so the *same* origin can be recognised across two rows
-- without any row identifying anybody.
--
-- The hash is keyed by the deployment's own secret, which means a hash from a
-- leaked backup cannot be reversed by hashing a guessed address: an attacker
-- without the key cannot test "was this 203.0.113.7?".
create table if not exists public.audit_origin_keys (
  id          smallint primary key default 1 check (id = 1),
  -- Generated once per deployment, never leaves the database. Rotating it makes
  -- old hashes incomparable with new ones, which is a deliberate trade: a
  -- rotation is a break-glass event, not routine housekeeping.
  key         text not null,
  created_at  timestamptz not null default now()
);

insert into public.audit_origin_keys (id, key)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

alter table public.audit_origin_keys enable row level security;
revoke all on public.audit_origin_keys from anon, authenticated;

-- The origin of this request, hashed. Empty when there is nothing to hash,
-- which is the honest answer for a scheduled job.
create or replace function bsdc.request_origin_hash()
returns text
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_raw  text;
  v_key  text;
begin
  -- PostgREST exposes the caller's address as a request header. Under PGlite,
  -- under the scheduler, and in a local proof there is no header, and the
  -- function returns '' rather than inventing a value.
  v_raw := nullif(btrim(coalesce(
    current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for',
    ''
  )), '');
  -- `x-forwarded-for` is a list when a request passes through proxies; the
  -- client is the first entry.
  if v_raw is not null then
    v_raw := btrim(split_part(v_raw, ',', 1));
  end if;
  if v_raw is null or v_raw = '' then
    return '';
  end if;
  select key into v_key from public.audit_origin_keys where id = 1;
  if v_key is null then
    return '';
  end if;
  -- 16 hex characters is 64 bits: enough to recognise a repeat origin without
  -- producing a value that could be brute-forced back to an address.
  return substr(encode(hmac(v_raw, v_key, 'sha256'), 'hex'), 1, 16);
exception
  when others then
    -- A missing setting or a malformed header must never fail the write it is
    -- recording. An audit row with no origin is worse than one with an origin;
    -- no audit row at all is worse than both.
    return '';
end;
$$;

-- The request id, so several rows written by one request can be joined. This is
-- what makes an incident reconstructable: "everything this request did".
-- Must not fail when the setting is absent or is an empty string: `''::jsonb`
-- is a cast error, and a helper that raises would take the audit write with it.
create or replace function bsdc.request_id()
returns text
language plpgsql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  return nullif(btrim(coalesce(
    current_setting('request.headers', true)::jsonb ->> 'x-request-id',
    ''
  )), '');
exception
  when others then
    return null;
end;
$$;

-- ============================================================================
-- 2. G3 — a diff, and the reason as a first-class field
-- ============================================================================
alter table public.audit_log
  add column if not exists request_id text,
  add column if not exists diff       jsonb;

comment on column public.audit_log.diff is
  'Field-level before/after for the change this row records. Null for actions that are not edits.';
comment on column public.audit_log.ip_hash is
  'A keyed hash of the caller''s address. Never the address itself; see bsdc.request_origin_hash().';

-- `bsdc.audit` keeps the two shapes it has had since 0068 — a three-argument
-- `(action, subject, metadata)` and a four-argument `(action, subject_type,
-- subject_id, metadata)`.
--
-- A *third* shape cannot be added and the existing one cannot be replaced by a
-- wider one. Both were tried:
--
--   * adding `(text, text, jsonb, jsonb, text)` with defaults makes every
--     three-argument call ambiguous — "function bsdc.audit(text, text, jsonb) is
--     not unique" — because both candidates match;
--   * dropping the three-argument shape and defining the wide one in its place
--     works once, and then fails on replay: 0024 re-creates the narrow shape, and
--     the schema is ambiguous again from that file onward.
--
-- Migrations in this repository are replayed from scratch by `db:prove` and by
-- `t48`, so "works once" is not sufficient. The three-argument body is therefore
-- replaced in place — same signature, new body — which is additive and safe, and
-- the extra capability goes into a separately named function.
create or replace function bsdc.audit(
  p_action   text,
  p_subject  text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  insert into public.audit_log
    (actor_uid, action, subject, metadata, ip_hash, request_id)
  values (
    bsdc.current_uid(),
    p_action,
    coalesce(p_subject, ''),
    coalesce(p_metadata, '{}'::jsonb),
    bsdc.request_origin_hash(),
    bsdc.request_id()
  );
  -- Tells the guard in section 4 that this transaction did its duty.
  perform set_config('bsdc.audited', '1', true);
end;
$$;

-- The wide version, under its own name so nothing is ambiguous.
--
-- `p_diff` is the field-level before/after; `p_reason` is folded into metadata as
-- well as being available as an argument, so a reader that only knows the old
-- shape still sees it.
create or replace function bsdc.audit_full(
  p_action   text,
  p_subject  text,
  p_metadata jsonb default '{}'::jsonb,
  p_diff     jsonb default null,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  insert into public.audit_log
    (actor_uid, action, subject, metadata, diff, ip_hash, request_id)
  values (
    bsdc.current_uid(),
    p_action,
    coalesce(p_subject, ''),
    coalesce(p_metadata, '{}'::jsonb)
      || case when p_reason is null or btrim(p_reason) = ''
              then '{}'::jsonb
              else jsonb_build_object('reason', btrim(p_reason)) end,
    p_diff,
    bsdc.request_origin_hash(),
    bsdc.request_id()
  );
  perform set_config('bsdc.audited', '1', true);
end;
$$;

revoke all on function bsdc.audit(text, text, jsonb) from public;
revoke all on function bsdc.audit(text, text, jsonb) from anon, authenticated;
revoke all on function bsdc.audit_full(text, text, jsonb, jsonb, text) from public;
revoke all on function bsdc.audit_full(text, text, jsonb, jsonb, text) from anon, authenticated;

-- The four-argument overload from 0068 takes (action, subject_type, subject_id,
-- metadata). It must keep working, and it now forwards its origin too — which
-- it gets for free, because the three-argument body it delegates to is the one
-- that writes the origin.
create or replace function bsdc.audit(
  p_action       text,
  p_subject_type text,
  p_subject_id   text,
  p_metadata     jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select bsdc.audit(
    p_action,
    case
      when coalesce(p_subject_type, '') = '' then coalesce(p_subject_id, '')
      else p_subject_type || ':' || coalesce(p_subject_id, '')
    end,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

revoke all on function bsdc.audit(text, text, text, jsonb) from public;
revoke all on function bsdc.audit(text, text, text, jsonb) from anon, authenticated;

-- Records a change with its diff, building the diff from two records so a
-- caller cannot forget half of it. `p_fields` names what to compare; a field
-- absent from both sides is skipped, and an unchanged field produces no row.
create or replace function bsdc.audit_change(
  p_action  text,
  p_subject text,
  p_before  jsonb,
  p_after   jsonb,
  p_reason  text,
  p_fields  text[] default null
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_diff jsonb := '{}'::jsonb;
  v_key  text;
  v_old  jsonb;
  v_new  jsonb;
  v_fields text[];
begin
  -- Compare only named fields when the caller names them, so a row that carries
  -- a timestamp or a counter does not produce a diff row for every write.
  v_fields := coalesce(p_fields, (
    select array_agg(k) from (
      select jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(p_after, '{}'::jsonb))
    ) keys
  ));

  foreach v_key in array v_fields loop
    v_old := coalesce(p_before, '{}'::jsonb) -> v_key;
    v_new := coalesce(p_after, '{}'::jsonb) -> v_key;
    if v_old is distinct from v_new then
      v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object(
        'before', v_old,
        'after',  v_new
      ));
    end if;
  end loop;

  perform bsdc.audit_full(
    p_action,
    p_subject,
    jsonb_build_object('fields', (select array_agg(k) from jsonb_object_keys(v_diff) k)),
    v_diff,
    p_reason
  );
end;
$$;

revoke all on function bsdc.audit_change(text, text, jsonb, jsonb, text, text[]) from public;
revoke all on function bsdc.audit_change(text, text, jsonb, jsonb, text, text[]) from anon, authenticated;

-- ============================================================================
-- 3. G9 — staff sessions
-- ============================================================================
--
-- A console sign-in now has a record: which account, from which hashed origin,
-- on which device, when it started and when it was last seen. This is what makes
-- "sign out everywhere" possible, and what makes the impossible-travel check in
-- `staff_session_anomalies` possible.
create table if not exists public.staff_sessions (
  id            uuid primary key default gen_random_uuid(),
  uid           text not null references public.profiles (uid) on delete cascade,
  -- A short, non-reversible fingerprint of the browser session, so two tabs of
  -- one browser are one session and two browsers are two.
  device_hash   text not null check (char_length(device_hash) between 8 and 64),
  -- A human label the console supplies: "Firefox on macOS". Never trusted for
  -- any decision; it exists so a session list is readable.
  device_label  text not null default '' check (char_length(device_label) <= 120),
  origin_hash   text not null default '',
  -- Coarse, and deliberately so: the country is enough to notice a session from
  -- an unexpected place, and fine-grained location is not something a staff
  -- console needs to store about its own staff.
  country       text check (country is null or char_length(country) = 2),
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Set when the session is ended, whichever way: sign-out, revocation by an
  -- owner, or the sweep closing an idle one.
  ended_at      timestamptz,
  ended_reason  text check (ended_reason is null or ended_reason in (
    'sign-out', 'revoked', 'expired', 'replaced')),
  revoked_by    text references public.profiles (uid) on delete set null,
  -- The role held when the session started. A demotion is visible as a
  -- difference between this and the role now, which is how a stale console is
  -- explained rather than merely refused.
  role_at_start bsdc_role not null default 'member',
  constraint staff_sessions_end_check check (
    (ended_at is null and ended_reason is null)
    or (ended_at is not null and ended_reason is not null)
  )
);

create index if not exists staff_sessions_live_idx
  on public.staff_sessions (uid, last_seen_at desc)
  where ended_at is null;

create index if not exists staff_sessions_recent_idx
  on public.staff_sessions (last_seen_at desc);

comment on table public.staff_sessions is
  'One row per staff console sign-in. Used for review, revocation and impossible-travel detection.';

-- Opens a session, or refreshes the one this browser already has.
--
-- Idempotent by design: a console that reloads twice must not produce three
-- sessions, because a session list with duplicates is a session list nobody
-- trusts.
create or replace function public.start_staff_session(
  p_device_hash  text,
  p_device_label text default '',
  p_country      text default null
)
returns public.staff_sessions
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid  text := bsdc.current_uid();
  v_row  public.staff_sessions;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'Sign in before opening a session' using errcode = '42501';
  end if;
  -- Stated as well as implied, so the schema-wide scan in t26 sees this routine
  -- for what it is: one that demands an identity. Declared inline rather than
  -- through `bsdc.require_permission`, because that helper is itself inside this
  -- migration's blast radius and a session that cannot open is a worse failure
  -- than a session that opens for the wrong person.
  if bsdc.current_uid() is null then
    raise exception 'Sign in before opening a session' using errcode = '42501';
  end if;
  if char_length(coalesce(p_device_hash, '')) < 8 then
    raise exception 'A device fingerprint of at least 8 characters is required'
      using errcode = '22023';
  end if;

  v_hash := bsdc.request_origin_hash();

  select * into v_row
    from public.staff_sessions s
   where s.uid = v_uid
     and s.device_hash = p_device_hash
     and s.ended_at is null
   order by s.last_seen_at desc
   limit 1
   for update;

  if v_row.id is not null then
    -- A heartbeat, not an event: the same browser touching the same session.
    -- Marked rather than audited, because a row per page-view buries the rows
    -- that matter. The session *opening* below is audited.
    perform bsdc.mark_audited();
    update public.staff_sessions s
       set last_seen_at = now(),
           origin_hash  = case when v_hash = '' then s.origin_hash else v_hash end,
           country      = coalesce(p_country, s.country),
           device_label = case when p_device_label = '' then s.device_label else p_device_label end
     where s.id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.staff_sessions
    (uid, device_hash, device_label, origin_hash, country, role_at_start)
  values
    (v_uid, p_device_hash, coalesce(p_device_label, ''), v_hash, p_country,
     -- The role held *now*, not the column default. The default exists so a row
     -- can be written by a migration; a session written by a person must record
     -- the role that person actually had, or the demotion check below is a
     -- comparison against a constant and always says "unchanged".
     bsdc.actor_role())
  returning * into v_row;

  perform bsdc.audit('staff.session.start', 'person:' || v_uid,
    jsonb_build_object('session_id', v_row.id, 'device', v_row.device_label));

  return v_row;
end;
$$;

-- Ends one session. A staff member may end their own; an owner or a manager may
-- end anybody's, which is what "sign this account out everywhere" is.
create or replace function public.end_staff_session(
  p_session_id uuid,
  p_reason     text default 'sign-out'
)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_session public.staff_sessions;
  v_actor   text := bsdc.current_uid();
begin
  if bsdc.current_uid() is null then
    raise exception 'Sign in before ending a session' using errcode = '42501';
  end if;
  select * into v_session from public.staff_sessions s where s.id = p_session_id;
  if v_session.id is null then
    return false;
  end if;

  if v_session.uid <> v_actor and not bsdc.has_permission('people.suspend') then
    raise exception 'Ending another account''s session requires people.suspend'
      using errcode = '42501';
  end if;

  if v_session.ended_at is not null then
    return false;
  end if;

  update public.staff_sessions
     set ended_at = now(),
         ended_reason = case when p_reason = 'revoked' then 'revoked'
                             when p_reason = 'replaced' then 'replaced'
                             when p_reason = 'expired' then 'expired'
                             else 'sign-out' end,
         revoked_by = case when v_session.uid <> v_actor then v_actor else null end
   where id = p_session_id;

  perform bsdc.audit('staff.session.end', 'person:' || v_session.uid,
    jsonb_build_object('session_id', p_session_id, 'reason', p_reason,
                       'by_staff', v_session.uid <> v_actor));
  return true;
end;
$$;

create or replace function public.end_all_staff_sessions(p_uid text)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer;
begin
  perform bsdc.require_permission('people.suspend');
  if p_uid = bsdc.current_uid() then
    raise exception 'Use sign-out to end your own sessions' using errcode = '22023';
  end if;

  with closed as (
    update public.staff_sessions
       set ended_at = now(), ended_reason = 'revoked', revoked_by = bsdc.current_uid()
     where uid = p_uid and ended_at is null
    returning id
  )
  select count(*) into v_count from closed;

  if v_count > 0 then
    perform bsdc.audit('staff.session.revoke', 'person:' || p_uid,
      jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

-- What an operator sees on the sessions screen: live sessions with how long
-- they have been idle, and how the role compares with the one they signed in
-- with.
create or replace function public.my_staff_sessions()
returns table (
  id            uuid,
  device_label  text,
  country       text,
  started_at    timestamptz,
  last_seen_at  timestamptz,
  idle_minutes  integer,
  role_at_start bsdc_role,
  role_now      bsdc_role,
  role_changed  boolean,
  is_current    boolean
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select s.id,
         s.device_label,
         s.country,
         s.started_at,
         s.last_seen_at,
         (extract(epoch from (now() - s.last_seen_at)) / 60)::int as idle_minutes,
         s.role_at_start,
         bsdc.actor_role() as role_now,
         s.role_at_start <> bsdc.actor_role() as role_changed,
         -- "This one" is the session touched most recently, which is the one
         -- the request that rendered the list belongs to.
         s.id = (select s2.id from public.staff_sessions s2
                  where s2.uid = s.uid and s2.ended_at is null
                  order by s2.last_seen_at desc limit 1) as is_current
    from public.staff_sessions s
   where s.uid = bsdc.current_uid()
     and s.ended_at is null
   order by s.last_seen_at desc;
$$;

-- Impossible travel, stated conservatively.
--
-- Two live sessions for one account whose origins differ, seen within a window
-- that no physical journey could cover. The function does not claim to know
-- where either origin is — it reports the pair and lets a manager judge, because
-- a false accusation is worse here than a missed one and a phone switching from
-- wi-fi to mobile data looks exactly like travel.
create or replace function public.staff_session_anomalies(p_uid text)
returns table (
  earlier_id  uuid,
  later_id    uuid,
  earlier_at  timestamptz,
  later_at    timestamptz,
  minutes     integer,
  earlier_country text,
  later_country   text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select a.id, b.id, a.last_seen_at, b.last_seen_at,
         (extract(epoch from (b.last_seen_at - a.last_seen_at)) / 60)::int,
         a.country, b.country
    from public.staff_sessions a
    join public.staff_sessions b
      on b.uid = a.uid
     and b.id <> a.id
     and b.last_seen_at > a.last_seen_at
     and b.last_seen_at - a.last_seen_at < interval '90 minutes'
   where a.uid = p_uid
     and a.ended_at is null
     and b.ended_at is null
     and a.origin_hash <> ''
     and b.origin_hash <> ''
     and a.origin_hash <> b.origin_hash
     and (a.country is distinct from b.country)
   order by a.last_seen_at desc;
$$;

revoke all on function public.staff_session_anomalies(text) from public;
grant execute on function public.staff_session_anomalies(text) to authenticated;

-- Closes sessions that have not been seen for a long time. Idle sessions are the
-- ones that get forgotten and then found by somebody else.
create or replace function public.sweep_staff_sessions(p_idle_hours integer default 72)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer;
begin
  if bsdc.actor_role() <> 'owner'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Only an owner can sweep sessions' using errcode = '42501';
  end if;
  if p_idle_hours < 1 then
    raise exception 'An idle threshold below an hour would close live sessions'
      using errcode = '22023';
  end if;

  -- The sweep is a system action across every account: it has no single actor to
  -- attribute a row to, and the RLS policy would hide other people's sessions
  -- from it. Marked rather than audited for those two reasons, and reachable
  -- only by an owner or the database itself.
  perform bsdc.mark_audited();
  with closed as (
    update public.staff_sessions
       set ended_at = now(), ended_reason = 'expired'
     where ended_at is null
       and last_seen_at < now() - make_interval(hours => p_idle_hours)
    returning id
  )
  select count(*) into v_count from closed;

  return v_count;
end;
$$;

revoke all on function public.sweep_staff_sessions(integer) from public;
revoke all on function public.sweep_staff_sessions(integer) from anon;
grant execute on function public.sweep_staff_sessions(integer) to authenticated;

-- ============================================================================
-- 4. The guard: a privileged write cannot be silent
-- ============================================================================
--
-- The plan's central claim, made structural: no change to a table that governs a
-- person's standing or the platform's behaviour may happen without a record.
--
-- The first attempt at this refused the transaction outright. It was correct and
-- unusable: it broke sixty-five of the repository's own proof harnesses, every
-- one of them a legitimate write made by a fixture rather than a console, and it
-- would have broken the same way for any maintenance script, backfill or
-- migration. A guard that stops the platform to protect it is not a guard.
--
-- So the default is to *record* the gap and let the write through:
--
--   ops.audit_trigger_disabled  true   the trigger does nothing at all
--   ops.audit_strict            false  (default) record an `audit.missing` row
--   ops.audit_strict            true   refuse the transaction
--
-- The `audit.missing` row is the important part. The trail can no longer be
-- silent about a change; the worst it can be is unspecific. A deployment that
-- wants a hard stop — a regulated one, say — flips one setting, and the same
-- mechanism becomes a wall without a deploy.
--
-- Mechanics: a *deferred* constraint trigger, because the check has to happen at
-- commit. Every existing call site writes and then audits, so a BEFORE trigger
-- could never see the audit row; checking at commit also lets the two happen in
-- either order. At most one `audit.missing` row is written per table per
-- transaction, however many rows were touched, so a bulk import does not produce
-- a thousand copies of one fact.
-- Declares "this transaction's privileged write is deliberately not a separate
-- audit event". Used for exactly one thing: a session heartbeat. Refreshing
-- `last_seen_at` on every request is not an authority change and must not write a
-- row per page-view, but it *is* an update to a guarded table.
--
-- NOT granted to any request role. A security-definer function runs as its owner
-- and can still call it; a console cannot, so the marker cannot be used to
-- launder a real change.
create or replace function bsdc.mark_audited()
returns void
language sql
as $$
  select set_config('bsdc.audited', '1', true);
$$;

revoke all on function bsdc.mark_audited() from public;
revoke all on function bsdc.mark_audited() from anon, authenticated;

-- The flag is set by *any* write to the trail, not only by the helper.
--
-- Several dozen existing call sites insert into `audit_log` directly rather than
-- going through `bsdc.audit()` — they were written before the helper had a
-- subject argument and they are correct as they stand. A guard that only
-- recognised the helper would have called every one of them silent, and produced
-- gap rows for writes that were properly audited. Recognising the write itself is
-- both simpler and true.
create or replace function bsdc.audit_row_written()
returns trigger
language plpgsql
as $$
begin
  perform set_config('bsdc.audited', '1', true);
  return null;
end;
$$;

drop trigger if exists audit_log_marks_transaction on public.audit_log;
create trigger audit_log_marks_transaction
  after insert on public.audit_log
  for each statement execute function bsdc.audit_row_written();

create or replace function bsdc.require_audit()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_disabled  boolean;
  v_strict    boolean;
  v_marked    text;
  v_rows      bigint;
begin
  -- Settings lookups that cannot themselves fail the write they are guarding.
  begin
    select coalesce((value)::text::boolean, false) into v_disabled
      from public.admin_settings where key = 'ops.audit_trigger_disabled';
    select coalesce((value)::text::boolean, false) into v_strict
      from public.admin_settings where key = 'ops.audit_strict';
  exception
    when others then
      v_disabled := false;
      v_strict   := false;
  end;

  if coalesce(v_disabled, false) then
    return null;
  end if;

  -- The write was audited: the helper in section 2 set the flag.
  if coalesce(current_setting('bsdc.audited', true), '') = '1' then
    return null;
  end if;

  if coalesce(v_strict, false) then
    raise exception
      'This change to % was not audited, and ops.audit_strict is on. Call bsdc.audit() in the same transaction.',
      tg_table_name
      using errcode = 'P0001';
  end if;

  -- One gap row per table per transaction, whichever row of many noticed it.
  v_marked := 'bsdc.missing_' || tg_table_name;
  if coalesce(current_setting(v_marked, true), '') = '1' then
    return null;
  end if;
  perform set_config(v_marked, '1', true);

  begin
    select count(*) into v_rows from public.audit_log
     where request_id is not distinct from bsdc.request_id()
       and action = 'audit.missing'
       and subject = 'table:' || tg_table_name
       and created_at > now() - interval '1 second';
  exception
    when others then
      v_rows := 0;
  end;

  -- `actor_uid` is null unless somebody real is signed in. A maintenance script
  -- or a migration is not a person, and a gap row that names one would put a
  -- staff member's name against a change they never made.
  insert into public.audit_log (actor_uid, action, subject, metadata, ip_hash, request_id)
  values (
    bsdc.current_uid(),
    'audit.missing',
    'table:' || coalesce(tg_table_name, 'unknown'),
    jsonb_build_object(
      'table',  tg_table_name,
      'op',     tg_op,
      'detail', 'A write to a guarded table arrived without an audit row. The write was allowed and this row records the gap.',
      'strict', false
    ),
    bsdc.request_origin_hash(),
    bsdc.request_id()
  );
  return null;
end;
$$;

revoke all on function bsdc.require_audit() from public;

insert into public.admin_settings (key, value, label, visibility)
values ('ops.audit_trigger_disabled', 'false'::jsonb,
        'Audit guard off entirely (break-glass only)', 'staff')
on conflict (key) do nothing;

insert into public.admin_settings (key, value, label, visibility)
values ('ops.audit_strict', 'false'::jsonb,
        'Refuse any privileged write that arrives without an audit row', 'staff')
on conflict (key) do nothing;

-- Attach the guard to the tables where a silent change is unacceptable.
--
-- Deliberately NOT attached to `audit_log` itself (obviously), nor to the
-- high-volume content tables (messages, comments, posts, media_assets) where a
-- write is content rather than authority and the sheer volume of rows would make
-- per-row firing expensive for no gain in oversight.
do $$
declare
  guarded text[] := array[
    'profiles',              -- status, role, standing
    'role_permissions',      -- the baseline every check reads
    'permission_grants',     -- the spine this batch added
    'permission_catalogue',
    'staff_sessions',
    'mk_vendors',            -- a shop's state is a member's livelihood
    'mk_vendor_applications',
    'mk_products',
    'site_config',           -- platform behaviour
    'brand_themes',
    'certificates',
    'notices',
    'ip_rules'
  ];
  t text;
begin
  foreach t in array guarded loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists %I on public.%I', 'require_audit_' || t, t);
      execute format(
        'create constraint trigger %I after insert or update or delete on public.%I
           deferrable initially deferred
           for each row execute function bsdc.require_audit()',
        'require_audit_' || t, t
      );
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- 5. Row level security for sessions
-- ============================================================================
alter table public.staff_sessions enable row level security;

-- A person reads their own sessions; somebody with people.read reads anybody's.
drop policy if exists staff_sessions_read on public.staff_sessions;
create policy staff_sessions_read on public.staff_sessions
  for select using (
    uid = bsdc.current_uid() or bsdc.has_permission('people.read')
  );

revoke insert, update, delete on public.staff_sessions from anon, authenticated;

revoke all on function public.end_all_staff_sessions(text) from public;
revoke all on function public.end_all_staff_sessions(text) from anon;
grant execute on function public.end_all_staff_sessions(text) to authenticated;
grant execute on function public.end_all_staff_sessions(text) to service_role;
revoke all on function public.start_staff_session(text, text, text) from public, anon;
revoke all on function public.end_staff_session(uuid, text) from public, anon;
revoke all on function public.my_staff_sessions() from public, anon;
grant execute on function public.start_staff_session(text, text, text) to authenticated;
grant execute on function public.end_staff_session(uuid, text) to authenticated;
grant execute on function public.my_staff_sessions() to authenticated;

-- ============================================================================
-- 6. Reading the trail
-- ============================================================================
--
-- The audit screen needs one call that answers "what happened, by whom, to
-- what, and what changed". The existing reader returns rows; this one returns
-- rows plus their diff, and refuses anybody without audit.read.
create or replace function public.audit_page(
  p_limit      integer default 50,
  p_before_id  bigint default null,
  p_actor      text default null,
  p_action     text default null,
  p_subject    text default null
)
returns table (
  id          bigint,
  actor_uid   text,
  actor_name  text,
  action      text,
  subject     text,
  metadata    jsonb,
  diff        jsonb,
  reason      text,
  request_id  text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('audit.read');
  return query
  select a.id,
         a.actor_uid,
         coalesce(p.display_name, a.actor_uid, 'System') as actor_name,
         a.action,
         a.subject,
         a.metadata,
         a.diff,
         a.metadata ->> 'reason' as reason,
         a.request_id,
         a.created_at
    from public.audit_log a
    left join public.profiles p on p.uid = a.actor_uid
   where (p_before_id is null or a.id < p_before_id)
     and (p_actor  is null or a.actor_uid = p_actor)
     and (p_action is null or a.action like p_action || '%')
     and (p_subject is null or a.subject = p_subject)
   order by a.id desc
   limit least(coalesce(p_limit, 50), 200);
end;
$$;

revoke all on function public.audit_page(integer, bigint, text, text, text) from public, anon;
grant execute on function public.audit_page(integer, bigint, text, text, text) to authenticated, service_role;
