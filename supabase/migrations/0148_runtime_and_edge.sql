-- ===========================================================================
-- 0148 — Runtime and edge (§12).
--
-- Response 7. Three consoles that each answer "why is the platform behaving
-- like this", and each of them currently answers it badly in the same way: the
-- screen shows a value and nothing about where it came from, who else it
-- affects, or what it looked like before. A setting, a page and a firewall
-- rule are all decisions, and a decision with no provenance is a rumour.
--
--   §12.1 settings that cannot be wrong
--   §12.2 custom pages that are real
--   §12.3 IP rules with a reason
--
-- The two sentences this migration is built around:
--
--   "A setting nobody reads is a setting that should not exist."
--   "A permanent block added during an incident is how a platform loses a
--    customer six months later."
-- ===========================================================================

-- Extensions live where the deployment put them (§0028's note, applied again).
-- This file names `citext` for the page slug, and inheriting a search path that
-- happened to include where PGlite put it is exactly the bug t48 exists to catch:
-- it passes here and fails in production. Said once, at the top, for the whole file.
set search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Every setting gets a schema (§12.1)
-- ---------------------------------------------------------------------------
-- `site_config` already declares a type, a range and an option list, and
-- `set_site_config` already calls `bsdc.config_value_valid`. What it does not
-- declare is an owner, a description longer than the help text, or the fact
-- that its value is a secret. Those three are what the console needs to be
-- able to say "this is on because the ops team set it, this is what it does,
-- and this value must never be returned to a browser".
alter table public.site_config
  add column if not exists owner_area text not null default 'platform'
    check (char_length(owner_area) between 2 and 40),
  -- Where the value came from on the last read. 'default' means the seeded
  -- value has never been overridden, which is a different thing from "an
  -- operator looked at it and chose it".
  add column if not exists source text not null default 'default'
    check (source in ('default', 'database', 'environment', 'override')),
  add column if not exists is_secret boolean not null default false,
  add column if not exists secret_set_at timestamptz,
  add column if not exists secret_rotated_at timestamptz,
  add column if not exists requires_approval boolean not null default false,
  -- §12.1: "a setting nobody reads is flagged for removal". Nullable so that a
  -- row nobody has mapped is distinguishable from one mapped to nothing.
  add column if not exists reader_count integer,
  add column if not exists removal_proposed boolean not null default false;

comment on column public.site_config.source is
  'default = never overridden · database = set by an operator · environment = supplied by the deploy · override = forced by a flag file';
comment on column public.site_config.is_secret is
  'A secret is write-only. Reads return whether it is set and when it was rotated, never a value.';
comment on column public.site_config.reader_count is
  'How many screens and jobs read this key, from the usage map generated at build time. NULL = not yet mapped.';

-- The provenance of a value cannot be inferred from the value. A row seeded as
-- 'default' that an operator then saved is 'database', even if they saved the
-- same value — that is the whole point of the column.
comment on column public.site_config.requires_approval is
  'A change to a production setting needs a second person. Set by the seed data, not by the editor.';

create index if not exists site_config_owner_idx on public.site_config (owner_area);

-- §12.1's blast radius, built at build time and shipped with the migration
-- rather than scraped at request time. One row per (key, reader).
create table if not exists public.config_usage (
  id        bigserial primary key,
  key       text not null,
  reader    text not null check (char_length(reader) between 2 and 120),
  kind      text not null default 'screen'
    check (kind in ('screen', 'job', 'edge', 'app', 'test')),
  note      text not null default '' check (char_length(note) <= 200),
  unique (key, reader)
);

create index if not exists config_usage_key_idx on public.config_usage (key);

alter table public.config_usage enable row level security;

drop policy if exists config_usage_staff_read on public.config_usage;
create policy config_usage_staff_read on public.config_usage
  for select using (bsdc.has_permission('settings.read'));

revoke all on public.config_usage from anon, authenticated;
grant select on public.config_usage to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Value validation, one definition (§12.1)
-- ---------------------------------------------------------------------------
-- "The validator is one function used by the UI, the RPC, and a test, so there
-- is one definition of valid."
--
-- The UI already has `validateConfigValue` in the kit. This is its server-side
-- twin, and it is deliberately a second implementation of the same rules
-- rather than a second set of rules: the kit cannot be trusted as the only
-- check because the RPC is reachable without the kit.
create or replace function bsdc.config_value_problem(
  p_type   bsdc_config_type,
  p_value  jsonb,
  p_min    numeric,
  p_max    numeric,
  p_options text[]
)
returns text
language plpgsql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_num   numeric;
  v_text  text;
begin
  if p_value is null then
    return 'A setting cannot be set to null. Use the type''s empty value instead.';
  end if;

  -- The JSON-type check comes first, because `config_value_valid` already rejects a
  -- string that should be a number and would return the generic message. "Send a
  -- number, not a string" is a different instruction from "that number is too big",
  -- and an operator reading the first one fixes it in a second.
  if p_type = 'number' and jsonb_typeof(p_value) <> 'number' then
    return format('A numeric setting must be a JSON number, not %s.', jsonb_typeof(p_value));
  end if;

  if not bsdc.config_value_valid(p_type, p_value, p_min, p_max) then
    if p_min is not null and p_max is not null then
      return format('Expected a %s between %s and %s.', p_type, p_min, p_max);
    elsif p_min is not null then
      return format('Expected a %s of at least %s.', p_type, p_min);
    elsif p_max is not null then
      return format('Expected a %s of at most %s.', p_type, p_max);
    else
      return format('Expected a value of type %s.', p_type);
    end if;
  end if;

  if p_options is not null and cardinality(p_options) > 0 then
    v_text := p_value #>> '{}';
    if v_text is null or not (v_text = any (p_options)) then
      return format('Must be one of: %s', array_to_string(p_options, ', '));
    end if;
  end if;


  return null;
end;
$$;

revoke all on function bsdc.config_value_problem(bsdc_config_type, jsonb, numeric, numeric, text[]) from public;

--------------------------------------------------------------------------------
-- 3. Provenance, secrets and the read the console actually needs (§12.1)
--------------------------------------------------------------------------------
-- The existing `site_config_list()` returns the value and nothing else. It
-- cannot answer "where did this come from", and it returns secrets, which is
-- worse. This is a v2 rather than a replacement for the same reason as the
-- registries in 0147: the shape changes, so the name changes.
create or replace function public.site_config_console()
returns table (
  key              text,
  value            jsonb,
  value_type       bsdc_config_type,
  group_name       text,
  label            text,
  help             text,
  min_value        numeric,
  max_value        numeric,
  options          text[],
  is_public        boolean,
  is_secret        boolean,
  secret_is_set    boolean,
  secret_set_at    timestamptz,
  secret_rotated_at timestamptz,
  source           text,
  owner_area       text,
  requires_approval boolean,
  reader_count     integer,
  removal_proposed boolean,
  sort_order       integer,
  updated_by       text,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    c.key,
    -- The redaction happens here, in the only place a value leaves the table.
    -- A boolean is returned instead: "set" or "not set" is the whole truth an
    -- editor needs, and a secret shown once is a secret in a screenshot.
    case when c.is_secret then to_jsonb(c.secret_set_at is not null) else c.value end,
    c.value_type,
    c.group_name,
    c.label,
    c.help,
    c.min_value,
    c.max_value,
    c.options,
    c.is_public,
    c.is_secret,
    c.secret_set_at is not null,
    c.secret_set_at,
    c.secret_rotated_at,
    c.source,
    c.owner_area,
    c.requires_approval,
    c.reader_count,
    c.removal_proposed,
    c.sort_order,
    c.updated_by,
    c.updated_at
  from public.site_config c
  where bsdc.has_permission('settings.read')
  order by c.group_name, c.sort_order, c.key;
$$;

revoke all on function public.site_config_console() from public, anon;
grant execute on function public.site_config_console() to authenticated, service_role;

-- What reads this key. §12.1's blast radius, from the table in §1, with the
-- count kept in step so `reader_count` cannot disagree with the list.
create or replace function public.config_blast_radius(p_key text)
returns table (reader text, kind text, note text)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select u.reader, u.kind, u.note
    from public.config_usage u
   where u.key = p_key
     and bsdc.has_permission('settings.read')
   order by u.kind, u.reader;
$$;

revoke all on function public.config_blast_radius(text) from public, anon;
grant execute on function public.config_blast_radius(text) to authenticated, service_role;

create or replace function public.config_refresh_reader_counts()
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_touched integer;
begin
  perform bsdc.require_permission('settings.write');

  update public.site_config c
     set reader_count = (select count(*)::integer from public.config_usage u where u.key = c.key);

  get diagnostics v_touched = row_count;
  return v_touched;
end;
$$;

revoke all on function public.config_refresh_reader_counts() from public, anon;
grant execute on function public.config_refresh_reader_counts() to authenticated, service_role;

-- A key nobody reads is proposed for removal rather than removed. The proposal
-- is the review: a settings table is a history of things somebody once needed,
-- and deleting on a count alone would delete a key whose reader has not been
-- mapped yet — which is indistinguishable from a key nobody reads.
create or replace function public.propose_config_removal(p_key text, p_propose boolean default true)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.site_config%rowtype;
  v_readers integer;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.site_config where key = p_key for update;
  if not found then
    raise exception 'No such configuration key: %', p_key using errcode = 'P0002';
  end if;
  if v_row.is_public then
    raise exception 'This key is public, so something outside this repository reads it. It cannot be proposed for removal here.'
      using errcode = '22023';
  end if;

  v_readers := coalesce(
    (select count(*)::integer from public.config_usage u where u.key = p_key),
    (select reader_count from public.site_config where key = p_key),
    0);

  if p_propose and v_readers > 0 then
    raise exception 'This setting is read by % place(s), so it cannot be proposed for removal. Remove the readers first.',
      v_readers using errcode = '22023';
  end if;

  update public.site_config set removal_proposed = p_propose where key = p_key;

  perform bsdc.audit(
    case when p_propose then 'config.removal.proposed' else 'config.removal.withdrawn' end,
    p_key, jsonb_build_object('readers', v_readers));
end;
$$;

revoke all on function public.propose_config_removal(text, boolean) from public, anon;
grant execute on function public.propose_config_removal(text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Writing a setting, with two people when it matters (§12.1)
-- ---------------------------------------------------------------------------
-- `set_site_config` stays as it is and this wraps it, so nothing that already
-- calls the old function changes behaviour. What this adds:
--
--   * a secret is written without ever being readable afterwards;
--   * a setting flagged `requires_approval` produces a *staged* change, not a
--     value, and applying it needs a different person;
--   * scheduling applies at a time instead of at a click;
--   * the history row records which of those routes was taken, because "who
--     changed this" and "who approved this" are two different questions.
create table if not exists public.config_staged_changes (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,
  proposed_value jsonb not null,
  reason         text not null check (char_length(btrim(reason)) between 10 and 300),
  status         text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'cancelled')),
  apply_at       timestamptz,
  proposed_by    text not null,
  proposed_at    timestamptz not null default now(),
  decided_by     text,
  decided_at     timestamptz,
  decision_note  text not null default '' check (char_length(decision_note) <= 300),
  applied_value  jsonb,
  -- A staged change that has not been decided must be decidable exactly once.
  constraint config_staged_decided check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending')
  ),
  -- The second-person rule applies to *decisions*, not to housekeeping. The
  -- proposer may cancel or reject their own staging — that makes it go away, which
  -- needs no check. What they may not do is apply it: `status = 'applied'` with the
  -- proposer as decider is the shape of an approval bypassed.
  constraint config_staged_not_self check (
    status <> 'applied' or decided_by is null or decided_by <> proposed_by
  )
);

create index if not exists config_staged_pending_idx
  on public.config_staged_changes (status, coalesce(apply_at, proposed_at));

alter table public.config_staged_changes enable row level security;

drop policy if exists config_staged_staff_read on public.config_staged_changes;
create policy config_staged_staff_read on public.config_staged_changes
  for select using (bsdc.has_permission('settings.read'));

revoke all on public.config_staged_changes from anon, authenticated;
grant select on public.config_staged_changes to authenticated;

comment on constraint config_staged_not_self on public.config_staged_changes is
  'A second approver is the point of staging. Without this constraint the same person is a second approver.';

alter table public.site_config_history
  add column if not exists route text not null default 'direct'
    check (route in ('direct', 'staged', 'scheduled', 'reverted', 'environment')),
  add column if not exists staged_id uuid,
  add column if not exists approved_by text;

-- The single write path. `p_route` is not caller-controlled: it is derived from
-- whether the key needs approval and whether a time was supplied, so the
-- history cannot be made to say a change was approved when it was not.
create or replace function public.save_config_setting(
  p_key        text,
  p_value      jsonb,
  p_reason     text default '',
  p_apply_at   timestamptz default null,
  p_secret     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row     public.site_config%rowtype;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_problem text;
  v_id      uuid;
  v_route   text;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.site_config where key = p_key for update;
  if not found then
    raise exception 'No such configuration key: %', p_key using errcode = 'P0002';
  end if;

  if v_row.is_secret <> p_secret then
    raise exception 'This key is %, and the write % say so. A secret written as a plain setting is a secret in the history table.',
      case when v_row.is_secret then 'a secret' else 'not a secret' end,
      case when p_secret then 'does' else 'does not' end
      using errcode = '22023';
  end if;

  -- A secret has no meaningful "current value" to compare against, so its
  -- validation is only that something was supplied.
  if v_row.is_secret then
    if p_value is null or (p_value #>> '{}') = '' then
      raise exception 'A secret must have a value. Use retire_config_secret to clear one.'
        using errcode = '22023';
    end if;
  else
    v_problem := bsdc.config_value_problem(
      v_row.value_type, p_value, v_row.min_value, v_row.max_value, v_row.options);
    if v_problem is not null then
      raise exception 'Value rejected for %: %', p_key, v_problem using errcode = '22023';
    end if;
  end if;

  if char_length(v_reason) < 10 then
    raise exception 'A configuration change needs a reason of at least ten characters — it is read during an incident.'
      using errcode = '22023';
  end if;

  -- Staging, or scheduling, or neither. The order matters: a key that needs
  -- approval is staged even if a time was supplied, and the time becomes when
  -- the staged change may be applied.
  if v_row.requires_approval then
    insert into public.config_staged_changes
      (key, proposed_value, reason, apply_at, proposed_by)
    values (p_key, p_value, v_reason, p_apply_at, bsdc.current_uid())
    returning id into v_id;

    perform bsdc.audit('config.staged', p_key,
      jsonb_build_object('reason', v_reason, 'apply_at', p_apply_at, 'staged', v_id));
    return jsonb_build_object(
      'route', 'staged', 'staged_id', v_id, 'needs_approval', true);
  end if;

  if p_apply_at is not null and p_apply_at > now() then
    insert into public.config_staged_changes
      (key, proposed_value, reason, apply_at, proposed_by, status)
    values (p_key, p_value, v_reason, p_apply_at, bsdc.current_uid(), 'pending')
    returning id into v_id;

    -- A scheduled change is its own proposal, so it can be cancelled without
    -- touching the live value, and it carries the time it will fire.
    perform bsdc.audit('config.scheduled', p_key,
      jsonb_build_object('reason', v_reason, 'apply_at', p_apply_at, 'staged', v_id));
    return jsonb_build_object(
      'route', 'scheduled', 'staged_id', v_id, 'apply_at', p_apply_at);
  end if;

  v_route := case when v_row.is_secret then 'direct' else 'direct' end;

  if not v_row.is_secret then
    insert into public.site_config_history (key, old_value, new_value, changed_by, route)
    values (p_key, v_row.value, p_value, bsdc.current_uid(), v_route);
  else
    -- The history records that a secret changed, not what it changed to. A
    -- secret in an append-only table is a secret that outlives its rotation.
    insert into public.site_config_history (key, old_value, new_value, changed_by, route)
    values (p_key, null, to_jsonb(format('[rotated %s]', now()::date)::text), bsdc.current_uid(), v_route);
  end if;

  update public.site_config
     set value = case when is_secret then jsonb_build_object('set', true) else p_value end,
         source = 'database',
         secret_set_at = case when is_secret then now() else secret_set_at end,
         secret_rotated_at = case when is_secret and secret_set_at is not null then now() else secret_rotated_at end,
         updated_by = bsdc.current_uid()
   where key = p_key;

  -- Both branches of this CASE must be jsonb. A text branch beside a jsonb branch
  -- makes Postgres coerce the *text* to jsonb, which parses '[secret]' as JSON and
  -- fails — the kind of bug that only appears on the secret path, i.e. never in
  -- development.
  perform bsdc.audit('config.write', p_key,
    jsonb_build_object(
      'reason', v_reason,
      'from', to_jsonb(case when v_row.is_secret then '[secret]' else v_row.value::text end),
      'to', to_jsonb(case when v_row.is_secret then '[secret]' else p_value::text end)));

  return jsonb_build_object('route', 'direct', 'value',
    case when v_row.is_secret then to_jsonb(true) else p_value end);
end;
$$;

revoke all on function public.save_config_setting(text, jsonb, text, timestamptz, boolean) from public, anon;
grant execute on function public.save_config_setting(text, jsonb, text, timestamptz, boolean) to authenticated, service_role;

-- Applying a staged change needs a second person and a reason. The constraint
-- on the table is the guarantee; this is the error message that explains it.
create or replace function public.decide_config_change(
  p_id     uuid,
  p_approve boolean,
  p_note   text default ''
)
returns public.config_staged_changes
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row    public.config_staged_changes%rowtype;
  v_note   text := btrim(coalesce(p_note, ''));
  v_cfg    public.site_config%rowtype;
  v_problem text;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.config_staged_changes where id = p_id for update;
  if not found then
    raise exception 'No such staged change' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This change was already %', v_row.status using errcode = '22023';
  end if;
  if v_row.proposed_by = bsdc.current_uid() then
    raise exception 'A staged change needs a second person. You proposed this one, so somebody else has to approve it.'
      using errcode = '42501';
  end if;
  if char_length(v_note) < 3 then
    raise exception 'Say why, in at least three characters.' using errcode = '22023';
  end if;

  if not p_approve then
    update public.config_staged_changes
       set status = 'rejected', decided_by = bsdc.current_uid(),
           decided_at = now(), decision_note = left(v_note, 300)
     where id = p_id
    returning * into v_row;

    perform bsdc.audit('config.rejected', v_row.key, jsonb_build_object('note', v_note, 'staged', p_id));
    return v_row;
  end if;

  -- Re-validate at apply time. The schema can have tightened between the
  -- proposal and the approval, and approving a value that no longer fits is
  -- not an approval of anything.
  select * into v_cfg from public.site_config where key = v_row.key;
  if not found then
    raise exception 'The setting % no longer exists', v_row.key using errcode = 'P0002';
  end if;
  if not v_cfg.is_secret then
    v_problem := bsdc.config_value_problem(
      v_cfg.value_type, v_row.proposed_value, v_cfg.min_value, v_cfg.max_value, v_cfg.options);
    if v_problem is not null then
      raise exception 'The proposed value no longer fits %: %', v_row.key, v_problem
        using errcode = '22023';
    end if;

    insert into public.site_config_history
      (key, old_value, new_value, changed_by, route, staged_id, approved_by)
    values
      (v_row.key, v_cfg.value, v_row.proposed_value, v_row.proposed_by, 'staged',
       v_row.id, bsdc.current_uid());

    update public.site_config
       set value = v_row.proposed_value, source = 'database', updated_by = bsdc.current_uid()
     where key = v_row.key;
  else
    insert into public.site_config_history
      (key, old_value, new_value, changed_by, route, staged_id, approved_by)
    values
      (v_row.key, null, to_jsonb(format('[rotated %s]', now()::date)::text), v_row.proposed_by,
       'staged', v_row.id, bsdc.current_uid());

    update public.site_config
       set value = jsonb_build_object('set', true),
           source = 'database',
           secret_set_at = now(),
           secret_rotated_at = case when secret_set_at is not null then now() else secret_rotated_at end,
           updated_by = bsdc.current_uid()
     where key = v_row.key;
  end if;

  update public.config_staged_changes
     set status = 'applied', decided_by = bsdc.current_uid(), decided_at = now(),
         decision_note = left(v_note, 300), applied_value = proposed_value
   where id = p_id
  returning * into v_row;

  perform bsdc.audit('config.applied', v_row.key,
    jsonb_build_object('note', v_note, 'staged', p_id, 'proposed_by', v_row.proposed_by));
  return v_row;
end;
$$;

revoke all on function public.decide_config_change(uuid, boolean, text) from public, anon;
grant execute on function public.decide_config_change(uuid, boolean, text) to authenticated, service_role;

-- Applying whatever is due. Called by the scheduler; idempotent because the
-- status transition is the lock.
create or replace function public.apply_due_config_changes()
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row   record;
  v_count integer := 0;
  v_cfg   public.site_config%rowtype;
begin
  perform bsdc.require_permission('settings.write');

  for v_row in
    select * from public.config_staged_changes
     where status = 'pending'
       and apply_at is not null
       and apply_at <= now()
     order by apply_at
     for update skip locked
  loop
    select * into v_cfg from public.site_config where key = v_row.key;
    if not found then
      update public.config_staged_changes
         set status = 'cancelled', decided_by = bsdc.current_uid(), decided_at = now(),
             decision_note = 'The setting no longer exists'
       where id = v_row.id;
      continue;
    end if;

    -- A staged change that needed approval does not become a value because the
    -- clock reached it. That would be the approval bypassed by a timer.
    if v_cfg.requires_approval then
      continue;
    end if;

    insert into public.site_config_history
      (key, old_value, new_value, changed_by, route, staged_id)
    values
      (v_row.key, v_cfg.value, v_row.proposed_value, v_row.proposed_by, 'scheduled', v_row.id);

    update public.site_config
       set value = v_row.proposed_value, source = 'database', updated_by = v_row.proposed_by
     where key = v_row.key;

    update public.config_staged_changes
       set status = 'applied', decided_at = now(), decision_note = 'Applied at the scheduled time'
     where id = v_row.id;

    perform bsdc.audit('config.scheduled.applied', v_row.key,
      jsonb_build_object('staged', v_row.id, 'proposed_by', v_row.proposed_by));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.apply_due_config_changes() from public, anon;
grant execute on function public.apply_due_config_changes() to authenticated, service_role;

-- Cancelling a scheduled change before it fires. Separate from rejecting a
-- staged one because it needs no second person: nothing was approved.
create or replace function public.cancel_config_change(p_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.config_staged_changes%rowtype;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.config_staged_changes where id = p_id for update;
  if not found then
    raise exception 'No such staged change' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This change was already %', v_row.status using errcode = '22023';
  end if;

  -- `decided_by` is left null when the proposer cancels their own change: a
  -- cancellation is not a decision by a second person, and recording it as one
  -- would make the audit trail claim a review that never happened.
  update public.config_staged_changes
     set status = 'cancelled',
         decided_by = case when v_row.proposed_by = bsdc.current_uid() then null
                           else bsdc.current_uid() end,
         decided_at = now(),
         decision_note = left(coalesce(nullif(btrim(p_reason), ''), 'Cancelled'), 300)
   where id = p_id;

  perform bsdc.audit('config.cancelled', v_row.key, jsonb_build_object('staged', p_id));
end;
$$;

revoke all on function public.cancel_config_change(uuid, text) from public, anon;
grant execute on function public.cancel_config_change(uuid, text) to authenticated, service_role;

--------------------------------------------------------------------------------
-- 5. Rollback that is itself revertible (§12.1)
--------------------------------------------------------------------------------
-- "Rollback restores the previous value and is itself revertible, which makes
-- two rollbacks a return to the original."
--
-- `revert_site_config(history_id)` already restores the old value, but the
-- revert writes a history row through `set_site_config`, which does not record
-- the route — so a revert and an edit look identical afterwards. This routes it
-- through `save_config_setting` and marks it.
create or replace function public.rollback_config(p_history_id bigint, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_entry public.site_config_history%rowtype;
  v_note  text := btrim(coalesce(p_reason, ''));
begin
  perform bsdc.require_permission('settings.write');

  select * into v_entry from public.site_config_history where id = p_history_id;
  if not found then
    raise exception 'No such history entry' using errcode = 'P0002';
  end if;
  -- The secret check comes first, and deliberately: a secret is never
  -- rollbackable at any point in its history, so telling an operator "that was
  -- the first value" when the real answer is "we do not keep secrets" would send
  -- them looking for an earlier entry that also cannot help them.
  if v_entry.key in (select c.key from public.site_config c where c.is_secret) then
    raise exception 'A secret cannot be rolled back, because the old value was never stored. Rotate it instead.'
      using errcode = '22023';
  end if;
  if v_entry.old_value is null then
    raise exception 'That was the first value, so there is nothing before it to roll back to.'
      using errcode = 'P0002';
  end if;

  if char_length(v_note) < 10 then
    v_note := format('Rolled back history entry %s by hand', p_history_id);
  end if;

  -- The revert writes a new history row whose old_value is the current value,
  -- so rolling back the rollback returns to where we started.
  return public.save_config_setting(v_entry.key, v_entry.old_value, v_note);
end;
$$;

revoke all on function public.rollback_config(bigint, text) from public, anon;
grant execute on function public.rollback_config(bigint, text) to authenticated, service_role;

-- Retiring a secret: the value goes, the fact that one existed stays.
create or replace function public.retire_config_secret(p_key text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.site_config%rowtype;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.site_config where key = p_key for update;
  if not found then
    raise exception 'No such configuration key: %', p_key using errcode = 'P0002';
  end if;
  if not v_row.is_secret then
    raise exception 'That key is not a secret.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say why the secret is being retired, in at least ten characters.' using errcode = '22023';
  end if;

  insert into public.site_config_history (key, old_value, new_value, changed_by, route)
  values (p_key, null, to_jsonb('[retired]'::text), bsdc.current_uid(), 'direct');

  update public.site_config
     set value = 'false'::jsonb, secret_set_at = null, source = 'database',
         updated_by = bsdc.current_uid()
   where key = p_key;

  perform bsdc.audit('config.secret.retired', p_key, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke all on function public.retire_config_secret(text, text) from public, anon;
grant execute on function public.retire_config_secret(text, text) to authenticated, service_role;
-- ---------------------------------------------------------------------------
-- 6. Pages that are real (§12.2)
-- ---------------------------------------------------------------------------
-- The builder already has typed sections and a production-rendering preview.
-- What it lacks is the four things that stop "it looked fine in the editor"
-- from being a sentence:
--
--   * sections validated on publish, with the failing section named;
--   * a reserved-path guard, so a custom page cannot shadow /settings;
--   * version history that reverts by writing a new version;
--   * scheduling with an end, which unpublishes itself.
alter table public.custom_pages
  add column if not exists published_at timestamptz,
  add column if not exists publish_at timestamptz,
  add column if not exists unpublish_at timestamptz,
  add column if not exists current_version integer not null default 0,
  add column if not exists reserved_conflict text not null default '';

comment on column public.custom_pages.reserved_conflict is
  'The route this slug would shadow. Empty when the slug is free. Set by the guard, read by the editor.';

-- The routes this site already owns. A custom page that took one of these would
-- not add a page, it would remove one — and the failure would show up as a
-- missing settings screen rather than as a bad slug.
create table if not exists public.reserved_paths (
  path   text primary key check (path ~ '^/([a-z0-9][a-z0-9/.-]{0,60})?$'),
  owner  text not null default 'core' check (char_length(owner) between 2 and 40),
  note   text not null default '' check (char_length(note) <= 160)
);

alter table public.reserved_paths enable row level security;

drop policy if exists reserved_paths_read on public.reserved_paths;
create policy reserved_paths_read on public.reserved_paths
  for select using (true);

revoke all on public.reserved_paths from anon, authenticated;
grant select on public.reserved_paths to anon, authenticated;

insert into public.reserved_paths (path, owner, note) values
  ('/',                     'core', 'The home page'),
  ('/about',                'core', 'About'),
  ('/guidelines',           'core', 'Community guidelines'),
  ('/privacy',              'legal', 'Required by Google Play'),
  ('/terms',                'legal', 'Terms of service'),
  ('/account-deletion',     'legal', 'Required by Google Play'),
  ('/contact',              'core', 'Contact'),
  ('/system-check',         'core', 'System status for a supporter'),
  ('/auth',                 'core', 'Sign in and sign up'),
  ('/auth/login',           'core', 'Sign in'),
  ('/auth/signup',          'core', 'Sign up'),
  ('/auth/reset',           'core', 'Password reset'),
  ('/auth/verify',          'core', 'Verify an address'),
  ('/onboarding',           'core', 'First-run flow'),
  ('/settings',             'core', 'Settings'),
  ('/settings/account',     'core', 'Settings panel'),
  ('/settings/appearance',  'core', 'Settings panel'),
  ('/settings/language',    'core', 'Settings panel'),
  ('/settings/notifications','core','Settings panel'),
  ('/settings/feed',        'core', 'Settings panel'),
  ('/settings/privacy',     'core', 'Settings panel'),
  ('/settings/security',    'core', 'Settings panel'),
  ('/settings/danger',      'core', 'Settings panel'),
  ('/compose',              'core', 'Compose'),
  ('/create',               'core', 'Create'),
  ('/notifications',        'core', 'Notifications'),
  ('/bookmarks',            'core', 'Bookmarks'),
  ('/trash',                'core', 'Trash'),
  ('/messages',             'core', 'Messages'),
  ('/groups',               'core', 'Groups'),
  ('/events',               'core', 'Events'),
  ('/jobs',                 'core', 'Jobs'),
  ('/freelance',            'core', 'Freelance'),
  ('/projects',             'core', 'Projects'),
  ('/playground',           'core', 'Playground'),
  ('/shop',                 'core', 'Shop'),
  ('/cart',                 'core', 'Cart'),
  ('/checkout',             'core', 'Checkout'),
  ('/orders',               'core', 'Orders'),
  ('/admin',                'core', 'The admin landing page'),
  ('/verify',               'core', 'The verification desk'),
  ('/search',               'core', 'Search'),
  ('/feed',                 'core', 'The feed'),
  ('/profile',              'core', 'A member profile'),
  ('/g',                    'core', 'A group, by slug'),
  ('/marketplace',          'core', 'The marketplace'),
  ('/api',                  'edge', 'Never a page'),
  ('/sitemap.xml',          'edge', 'Generated'),
  ('/robots.txt',           'edge', 'Generated')
on conflict (path) do nothing;

-- The guard is a function so the editor can ask before saving and the save can
-- refuse afterwards, from the same definition. Checking a prefix and checking an
-- exact path are different questions: `/auth/anything` belongs to the auth flow
-- even though only the exact routes are listed.
create or replace function bsdc.reserved_path_conflict(p_slug text)
returns text
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  with candidate as (select '/' || lower(btrim(coalesce(p_slug, ''))) as path)
  select r.path
    from public.reserved_paths r, candidate c
   where c.path = r.path
      or c.path like r.path || '/%'
      or (r.path <> '/' and c.path like '%/' || ltrim(r.path, '/'))
   limit 1;
$$;

revoke all on function bsdc.reserved_path_conflict(text) from public;

create or replace function public.check_custom_page_slug(p_slug text)
returns table (slug text, available boolean, conflict text)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  perform bsdc.require_permission('settings.read');
  return query select
    v_slug,
    (v_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'
      and bsdc.reserved_path_conflict(v_slug) is null
      and not exists (select 1 from public.custom_pages p where p.slug::text = v_slug)),
    coalesce(bsdc.reserved_path_conflict(v_slug), '');
end;
$$;

revoke all on function public.check_custom_page_slug(text) from public, anon;
grant execute on function public.check_custom_page_slug(text) to authenticated, service_role;

create table if not exists public.page_versions (
  id         bigserial primary key,
  page_id    uuid not null references public.custom_pages (id) on delete cascade,
  version    integer not null check (version > 0),
  title      text not null,
  description text not null default '',
  slug       text not null,
  noindex    boolean not null default false,
  sections   jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  note       text not null default '' check (char_length(note) <= 300),
  unique (page_id, version)
);

create index if not exists page_versions_page_idx on public.page_versions (page_id, version desc);

alter table public.page_versions enable row level security;

drop policy if exists page_versions_staff_read on public.page_versions;
create policy page_versions_staff_read on public.page_versions
  for select using (bsdc.has_permission('settings.read'));

revoke all on public.page_versions from anon, authenticated;
grant select on public.page_versions to authenticated;

-- Section validation, one definition, used by publish and by the editor.
-- §12.2: "a section that fails its own validation cannot be published", and the
-- failure names the section rather than the page.
create or replace function bsdc.section_problem(p_kind bsdc_section_kind, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_heading text := btrim(coalesce(p_payload ->> 'heading', ''));
  v_body    text := btrim(coalesce(p_payload ->> 'body', ''));
  v_alt     text := btrim(coalesce(p_payload ->> 'alt', ''));
  v_src     text := btrim(coalesce(p_payload ->> 'src', p_payload ->> 'url', ''));
  v_color   text := btrim(coalesce(p_payload ->> 'color', ''));
  v_items   jsonb := coalesce(p_payload -> 'items', '[]'::jsonb);
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'The section has no content.';
  end if;

  case p_kind
    when 'hero' then
      if char_length(v_heading) < 2 then
        return 'A hero needs a heading of at least two characters.';
      end if;
      if char_length(v_heading) > 120 then
        return 'A hero heading must be at most 120 characters.';
      end if;
      if v_src <> '' and v_alt = '' then
        return 'A hero image needs alt text. A picture with no description is a picture half the audience cannot see.';
      end if;
    when 'rich_text' then
      if char_length(v_body) < 2 then
        return 'A text section needs some text.';
      end if;
      if char_length(v_body) > 8000 then
        return 'A text section must be at most 8000 characters.';
      end if;
    when 'cards' then
      if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
        return 'A cards section needs at least one card.';
      end if;
      if jsonb_array_length(v_items) > 12 then
        return 'A cards section holds at most twelve cards.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_items) e
         where char_length(btrim(coalesce(e ->> 'title', ''))) < 2
      ) then
        return 'Every card needs a title of at least two characters.';
      end if;
    when 'faq' then
      if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
        return 'An FAQ section needs at least one question.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_items) e
         where char_length(btrim(coalesce(e ->> 'q', e ->> 'question', ''))) < 3
            or char_length(btrim(coalesce(e ->> 'a', e ->> 'answer', ''))) < 3
      ) then
        return 'Every question needs both a question and an answer.';
      end if;
    when 'cta' then
      if char_length(v_heading) < 2 then
        return 'A call to action needs a heading.';
      end if;
      if btrim(coalesce(p_payload ->> 'href', '')) = '' then
        return 'A call to action needs somewhere to go.';
      end if;
    when 'gallery' then
      if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
        return 'A gallery needs at least one picture.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_items) e
         where btrim(coalesce(e ->> 'src', '')) = ''
      ) then
        return 'Every gallery picture needs a source.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_items) e
         where btrim(coalesce(e ->> 'alt', '')) = ''
      ) then
        return 'Every gallery picture needs alt text.';
      end if;
    when 'embed' then
      if btrim(coalesce(p_payload ->> 'url', '')) = '' then
        return 'An embed needs a URL.';
      end if;
      if coalesce(p_payload ->> 'url', '') !~ '^https://' then
        return 'An embed URL must start with https:// so the page cannot be served insecurely.';
      end if;
    else
      return null;
  end case;

  -- Any custom colour on any section is contrast-checked at publish, and the
  -- failure names the section. The page surface is white, so the comparison is
  -- against #ffffff rather than against a luminance band: a band would pass a
  -- mid-grey that reads fine on black and is invisible on white.
  if v_color <> '' then
    if v_color !~ '^#[0-9a-fA-F]{6}$' then
      return 'Colour must be a six-digit hex value like #0F766E.';
    end if;
    if public.brand_contrast(v_color, '#ffffff') < 4.5 then
      return format('That colour reaches only %s:1 against a white page, below the 4.5:1 AA floor for text.',
        public.brand_contrast(v_color, '#ffffff'));
    end if;
  end if;

  return null;
end;
$$;

revoke all on function bsdc.section_problem(bsdc_section_kind, jsonb) from public;

-- The publish path, with every failure collected rather than the first one, so
-- an editor with four broken sections sees four.
create or replace function public.publish_custom_page(
  p_page_id uuid,
  p_publish_at timestamptz default null,
  p_unpublish_at timestamptz default null
)
returns public.custom_pages
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_page     public.custom_pages%rowtype;
  v_problem  text;
  v_conflict text;
  v_count    integer;
  v_version  integer;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_page from public.custom_pages where id = p_page_id for update;
  if not found then
    raise exception 'No such page' using errcode = 'P0002';
  end if;

  v_conflict := bsdc.reserved_path_conflict(v_page.slug::text);
  if v_conflict is not null then
    raise exception 'The slug "%" would shadow the route %. Choose another.', v_page.slug, v_conflict
      using errcode = '22023';
  end if;

  select count(*)::integer into v_count
    from public.page_sections s where s.page_id = p_page_id;
  if v_count = 0 then
    raise exception 'A page with no sections has nothing to publish.' using errcode = '22023';
  end if;

  for v_problem in
    select format('Section %s: %s', s."position" + 1, bsdc.section_problem(s.kind, s.payload))
      from public.page_sections s
     where s.page_id = p_page_id
       and s.is_visible
       and bsdc.section_problem(s.kind, s.payload) is not null
     order by s."position"
  loop
    raise exception '%', v_problem using errcode = '22023';
  end loop;

  if p_unpublish_at is not null and p_publish_at is not null
     and p_unpublish_at <= p_publish_at then
    raise exception 'A page cannot stop being published before it starts.' using errcode = '22023';
  end if;

  -- §12.2: version history reverts by creating a new version. The version is a
  -- snapshot of the page as it was published, so a revert is a copy forward.
  v_version := v_page.current_version + 1;

  insert into public.page_versions (page_id, version, title, description, slug, noindex, sections, created_by, note)
  values (
    p_page_id, v_version, v_page.title, v_page.description, v_page.slug::text, v_page.noindex,
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'position', s."position",
        'payload', s.payload, 'is_visible', s.is_visible) order by s."position")
      from public.page_sections s where s.page_id = p_page_id), '[]'::jsonb),
    bsdc.current_uid(),
    format('Published version %s', v_version));

  update public.custom_pages
     set status = 'published',
         current_version = v_version,
         publish_at = coalesce(p_publish_at, now()),
         unpublish_at = p_unpublish_at,
         published_at = now(),
         reserved_conflict = '',
         updated_by = bsdc.current_uid()
   where id = p_page_id
  returning * into v_page;

  perform bsdc.audit('page.publish', v_page.slug::text,
    jsonb_build_object('version', v_version, 'sections', v_count, 'unpublish_at', p_unpublish_at));
  return v_page;
end;
$$;

revoke all on function public.publish_custom_page(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.publish_custom_page(uuid, timestamptz, timestamptz) to authenticated, service_role;


-- Reverting writes a new version rather than deleting the ones after it, so the
-- history never rewrites itself and a wrong revert is itself revertible.
create or replace function public.revert_custom_page(p_page_id uuid, p_version integer, p_reason text)
returns public.custom_pages
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_snap public.page_versions%rowtype;
  v_page public.custom_pages%rowtype;
  v_next integer;
begin
  perform bsdc.require_permission('settings.write');

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say why the page is being reverted, in at least ten characters.' using errcode = '22023';
  end if;

  select * into v_page from public.custom_pages where id = p_page_id for update;
  if not found then
    raise exception 'No such page' using errcode = 'P0002';
  end if;

  select * into v_snap from public.page_versions where page_id = p_page_id and version = p_version;
  if not found then
    raise exception 'Version % of that page does not exist', p_version using errcode = 'P0002';
  end if;

  v_next := v_page.current_version + 1;

  -- The sections are replaced from the snapshot, and the page is republished
  -- through the same validator as a first publish: a version that was valid in
  -- March is not automatically valid now, and reverting to it must not be a way
  -- around the checks.
  delete from public.page_sections where page_id = p_page_id;
  insert into public.page_sections (page_id, kind, "position", payload, is_visible)
  select p_page_id, (e ->> 'kind')::bsdc_section_kind, (e ->> 'position')::integer,
         e -> 'payload', coalesce((e ->> 'is_visible')::boolean, true)
    from jsonb_array_elements(v_snap.sections) e;

  update public.custom_pages
     set title = v_snap.title, description = v_snap.description, noindex = v_snap.noindex,
         current_version = v_next, updated_by = bsdc.current_uid()
   where id = p_page_id;

  insert into public.page_versions (page_id, version, title, description, slug, noindex, sections, created_by, note)
  values (p_page_id, v_next, v_snap.title, v_snap.description, v_page.slug::text, v_snap.noindex,
          v_snap.sections, bsdc.current_uid(),
          format('Reverted to version %s: %s', p_version, left(btrim(p_reason), 240)));

  update public.custom_pages set status = 'draft' where id = p_page_id;

  perform bsdc.audit('page.revert', v_page.slug::text,
    jsonb_build_object('from_version', p_version, 'new_version', v_next, 'reason', btrim(p_reason)));

  select * into v_page from public.custom_pages where id = p_page_id;
  return v_page;
end;
$$;

revoke all on function public.revert_custom_page(uuid, integer, text) from public, anon;
grant execute on function public.revert_custom_page(uuid, integer, text) to authenticated, service_role;

-- Scheduling with an end: a page whose unpublish time has passed goes back to
-- draft by itself. Called by the scheduler, idempotent by the status predicate.
create or replace function public.expire_scheduled_pages()
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_n integer;
begin
  perform bsdc.require_permission('settings.write');

  update public.custom_pages
     set status = 'draft'
   where status = 'published'
     and unpublish_at is not null
     and unpublish_at <= now();
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform bsdc.audit('page.expired', format('%s pages', v_n), jsonb_build_object('count', v_n));
  end if;
  return v_n;
end;
$$;

revoke all on function public.expire_scheduled_pages() from public, anon;
grant execute on function public.expire_scheduled_pages() to authenticated, service_role;

-- JSON round-trip, byte for byte. §12.2 asks for it, and the only way to prove
-- byte-for-byte is to write back through the same function that reads.
create or replace function public.export_custom_page(p_page_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select jsonb_build_object(
    'format', 'bsdc-page-v1',
    'slug', p.slug::text,
    'title', p.title,
    'description', p.description,
    'noindex', p.noindex,
    'status', p.status,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', s.kind,
        'position', s."position",
        'payload', s.payload,
        'is_visible', s.is_visible) order by s."position")
      from public.page_sections s where s.page_id = p.id), '[]'::jsonb)
  )
  from public.custom_pages p
  where p.id = p_page_id
    and bsdc.has_permission('settings.read');
$$;

revoke all on function public.export_custom_page(uuid) from public, anon;
grant execute on function public.export_custom_page(uuid) to authenticated, service_role;

-- `published_page` becomes time-aware: a page is published only inside its own
-- window. The old version treated `status = 'published'` as the whole answer,
-- so a page scheduled to stop at noon kept serving after noon.
create or replace function public.published_page(p_slug citext)
returns table (
  id          uuid,
  slug        text,
  title       text,
  description text,
  noindex     boolean,
  sections    jsonb
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    p.id, p.slug::text, p.title, p.description, p.noindex,
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', s.kind, 'payload', s.payload)
                       order by s."position")
      from public.page_sections s
      where s.page_id = p.id and s.is_visible
    ), '[]'::jsonb)
  from public.custom_pages p
  where p.slug = p_slug
    and (
      (p.status = 'published'
        and (p.publish_at is null or p.publish_at <= now())
        and (p.unpublish_at is null or p.unpublish_at > now()))
      or bsdc.has_permission('settings.read')
    );
$$;
-- ---------------------------------------------------------------------------
-- 7. IP rules with a reason (§12.3)
-- ---------------------------------------------------------------------------
-- Three things an operator needs that the current rule engine cannot give:
--
--   * "why did this address match" — the simulator, naming the deciding rule;
--   * "what would this rule have blocked" — a dry run over real history;
--   * "should it be armed yet" — shadow mode, and a review date with teeth.
--
-- The engine itself is not replaced. `ip_decision` already orders by prefix
-- length and prefers allow at equal specificity, and that order is the
-- contract. What this adds is the *explanation* of that order, the evidence,
-- and the schedule.
alter table public.ip_rules
  -- A permanent block added during an incident is how a platform loses a
  -- customer six months later. Every rule gets a review date; the date is not
  -- advisory.
  add column if not exists review_at timestamptz,
  add column if not exists shadow boolean not null default false,
  add column if not exists label text not null default '' check (char_length(label) <= 120),
  -- A rule that has decided nothing in its lifetime is a rule nobody needed.
  add column if not exists last_matched_at timestamptz,
  add column if not exists match_count bigint not null default 0,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_reason text not null default '';

comment on column public.ip_rules.shadow is
  'Logs what it would have blocked and blocks nothing. A new rule proves itself here before it is armed.';
comment on column public.ip_rules.review_at is
  'Mandatory for a block. A rule whose review date has passed is listed as overdue, not silently trusted.';

-- A block created after this migration must carry a review date. The check is
-- added after the column so it applies to new rows without failing on the
-- history that predates it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ip_rules_block_needs_review'
  ) then
    alter table public.ip_rules
      add constraint ip_rules_block_needs_review
      check (kind <> 'block' or review_at is not null or created_at < '2026-11-23');
  end if;
end;
$$;

create index if not exists ip_rules_review_idx on public.ip_rules (review_at) where disabled_at is null;

-- ---------------------------------------------------------------------------
-- 8. The simulator (§12.3)
-- ---------------------------------------------------------------------------
-- "Answers 'why did this address match' by evaluating the rule list in order
-- and naming the rule that decided, with the field that matched."
--
-- Crucially this is the *same* ordering expression as `ip_decision`, written
-- once here as a function so the two cannot drift. A simulator that disagrees
-- with production is worse than no simulator: it turns a five-minute
-- investigation into a wrong answer delivered quickly.
create or replace function bsdc.ip_rule_rank(p_ip inet)
returns table (
  id            uuid,
  range         cidr,
  kind          bsdc_ip_rule_kind,
  reason        text,
  label         text,
  prefix        integer,
  shadow        boolean,
  expires_at    timestamptz,
  review_at     timestamptz,
  expired       boolean,
  matches       boolean,
  disabled      boolean
)
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    r.id, r.range, r.kind, r.reason, r.label, masklen(r.range),
    r.shadow, r.expires_at, r.review_at,
    (r.expires_at is not null and r.expires_at <= now()),
    (r.range >>= p_ip),
    (r.disabled_at is not null)
  from public.ip_rules r
  order by masklen(r.range) desc, (r.kind = 'allow') desc, r.created_at desc;
$$;

revoke all on function bsdc.ip_rule_rank(inet) from public;

create or replace function public.ip_simulate(p_ip inet)
returns table (
  decision      text,
  matched       cidr,
  matched_kind  text,
  matched_label text,
  reason        text,
  shadow        boolean,
  allowlist_only boolean,
  step          integer,
  skipped_why   text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_allowlist boolean;
  v_rules     record;
  v_step      integer := 0;
  v_decided   boolean := false;
begin
  perform bsdc.require_permission('settings.read');

  if p_ip is null then
    raise exception 'Give an address to simulate.' using errcode = '22023';
  end if;

  select coalesce((select (c.value)::boolean from public.site_config c
                    where c.key = 'ops.ip_allowlist_only'), false)
    into v_allowlist;

  -- Every rule is listed in the order the engine considers it, with a reason
  -- for each one that was passed over. An operator reading this should be able
  -- to see *why* the winner won, not only which row it was.
  for v_rules in
    select * from bsdc.ip_rule_rank(p_ip)
  loop
    v_step := v_step + 1;

    if v_rules.disabled then
      return query select null::text, v_rules.range, v_rules.kind::text, v_rules.label,
                          v_rules.reason, v_rules.shadow, v_allowlist, v_step,
                          'disabled'::text;
      continue;
    end if;
    if v_rules.expired then
      return query select null::text, v_rules.range, v_rules.kind::text, v_rules.label,
                          v_rules.reason, v_rules.shadow, v_allowlist, v_step,
                          'expired'::text;
      continue;
    end if;
    if not v_rules.matches then
      return query select null::text, v_rules.range, v_rules.kind::text, v_rules.label,
                          v_rules.reason, v_rules.shadow, v_allowlist, v_step,
                          'address outside the range'::text;
      continue;
    end if;

    if v_decided then
      return query select null::text, v_rules.range, v_rules.kind::text, v_rules.label,
                          v_rules.reason, v_rules.shadow, v_allowlist, v_step,
                          'a more specific rule already decided'::text;
      continue;
    end if;

    -- The winner. A shadow rule reports what it *would* do without deciding.
    if v_rules.shadow then
      return query select
        (case when v_rules.kind = 'block' then 'would block' else 'would allow' end)::text,
        v_rules.range, v_rules.kind::text, v_rules.label, v_rules.reason,
        true, v_allowlist, v_step, 'shadow: reported, not enforced'::text;
      continue;
    end if;

    if v_rules.kind in ('block', 'allow') then
      v_decided := true;
      return query select v_rules.kind::text, v_rules.range, v_rules.kind::text,
                          v_rules.label, v_rules.reason, v_rules.shadow, v_allowlist,
                          v_step, null::text;
    else
      return query select null::text, v_rules.range, v_rules.kind::text, v_rules.label,
                          v_rules.reason, v_rules.shadow, v_allowlist, v_step,
                          'watch rules record but never decide'::text;
    end if;
  end loop;

  if v_decided then
    return;
  end if;

  -- No rule matched at all. In allowlist mode that is a block, and saying so is
  -- the difference between "the firewall is broken" and "you are not on the
  -- list yet".
  return query select
    (case when v_allowlist then 'block' else 'allow' end)::text,
    null::cidr, 'default'::text, ''::text,
    (case when v_allowlist
      then 'Allowlist mode is on and no allow rule covers this address.'
      else 'No rule matches, so the default applies.' end)::text,
    false, v_allowlist, v_step + 1,
    (case when v_allowlist then 'default: allowlist mode blocks everything else'
      else 'default: no rule matched' end)::text;
end;
$$;

revoke all on function public.ip_simulate(inet) from public, anon;
grant execute on function public.ip_simulate(inet) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. A dry run against real history (§12.3)
-- ---------------------------------------------------------------------------
-- "A block that would have taken out a payment callback is visible before it
-- is saved."
--
-- The evidence is `ip_events`, which records an address and an action for
-- every edge request worth remembering. This answers: for the last N days,
-- which requests would this candidate rule have changed the outcome of, and
-- what were they doing.
create or replace function public.ip_dry_run(
  p_range cidr,
  p_kind  bsdc_ip_rule_kind,
  p_days  integer default 7,
  p_limit integer default 50
)
returns table (
  ip            inet,
  hits          bigint,
  last_seen     timestamptz,
  actions       text[],
  would_change  bigint
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
begin
  perform bsdc.require_permission('settings.read');

  if p_range is null then
    raise exception 'Give a range to test.' using errcode = '22023';
  end if;

  return query
  select
    e.ip,
    count(*)::bigint,
    max(e.created_at),
    (select array_agg(distinct x.action order by x.action)
       from public.ip_events x
      where x.ip = e.ip and x.created_at > now() - make_interval(days => v_days)),
    -- "Would change" is the number this exists to produce: how many of those
    -- requests would have been decided differently by the candidate rule.
    sum(case
          when (select d.decision from public.ip_decision_for(e.ip, p_range, p_kind) d) is distinct from
               (select d.decision from public.ip_decision(e.ip) d)
          then 1 else 0
        end)::bigint
  from public.ip_events e
  where e.ip <<= p_range
    and e.created_at > now() - make_interval(days => v_days)
  group by e.ip
  having sum(case
          when (select d.decision from public.ip_decision_for(e.ip, p_range, p_kind) d) is distinct from
               (select d.decision from public.ip_decision(e.ip) d)
          then 1 else 0
        end) > 0
  order by 5 desc, 2 desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke all on function public.ip_dry_run(cidr, bsdc_ip_rule_kind, integer, integer) from public, anon;
grant execute on function public.ip_dry_run(cidr, bsdc_ip_rule_kind, integer, integer) to authenticated, service_role;

-- The candidate rule, evaluated as though it existed. Kept separate from
-- `ip_decision` so neither can be edited into agreeing with the other by
-- accident: this one takes the rule as an argument and never reads the table.
create or replace function public.ip_decision_for(p_ip inet, p_range cidr, p_kind bsdc_ip_rule_kind)
returns table (decision text, matched cidr, reason text)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with candidate as (
    select p_kind as kind, p_range as range
    where p_range >>= p_ip and p_kind in ('block', 'allow')
  ),
  -- The candidate competes on the same terms as a real rule: it only wins if
  -- nothing more specific, and no allow at the same prefix, is already there.
  existing as (
    select r.kind, r.range, r.reason
      from public.ip_rules r
     where r.range >>= p_ip
       and (r.expires_at is null or r.expires_at > now())
       and r.disabled_at is null
       and r.kind in ('block', 'allow')
       and (
         masklen(r.range) > masklen(p_range)
         or (masklen(r.range) = masklen(p_range) and r.kind = 'allow' and p_kind = 'block')
       )
     order by masklen(r.range) desc
     limit 1
  )
  select
    case
      when exists (select 1 from existing e where e.kind = 'block') then 'block'
      when exists (select 1 from existing) then 'allow'
      when exists (select 1 from candidate) then p_kind::text
      when coalesce((select (c.value)::boolean from public.site_config c
                      where c.key = 'ops.ip_allowlist_only'), false) then 'block'
      else 'allow'
    end,
    (select range from existing limit 1),
    ''::text;
$$;

revoke all on function public.ip_decision_for(inet, cidr, bsdc_ip_rule_kind) from public, anon;
grant execute on function public.ip_decision_for(inet, cidr, bsdc_ip_rule_kind) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. The request tracer (§12.3)
-- ---------------------------------------------------------------------------
-- "By request id, listing every rule evaluated and the outcome, which is what
-- an incident review asks for."
--
-- `ip_events` has no request id today, so this adds one and backfills nothing:
-- a trace starts when a trace exists, and pretending otherwise would produce
-- incident reviews built on partial evidence.
alter table public.ip_events
  add column if not exists request_id text,
  add column if not exists decision text,
  add column if not exists matched_rule uuid;

create index if not exists ip_events_request_idx on public.ip_events (request_id)
  where request_id is not null;

create or replace function public.ip_trace(p_request_id text)
returns table (
  at         timestamptz,
  ip         inet,
  action     text,
  decision   text,
  rule_range cidr,
  rule_kind  bsdc_ip_rule_kind,
  rule_reason text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
begin
  perform bsdc.require_permission('settings.read');

  if btrim(coalesce(p_request_id, '')) = '' then
    raise exception 'Give a request id to trace.' using errcode = '22023';
  end if;

  return query
  select e.created_at, e.ip, e.action, coalesce(e.decision, 'unknown'),
         r.range, r.kind, coalesce(r.reason, '')
    from public.ip_events e
    left join public.ip_rules r on r.id = e.matched_rule
   where e.request_id = btrim(p_request_id)
   order by e.created_at;
end;
$$;

revoke all on function public.ip_trace(text) from public, anon;
grant execute on function public.ip_trace(text) to authenticated, service_role;

-- Recording a decision. §12.3's shadow mode needs somewhere to put "we would
-- have blocked this", and the tracer needs the rule that decided, so this is
-- the single write path for an edge decision.
create or replace function public.record_ip_decision(
  p_ip         inet,
  p_action     text,
  p_request_id text default null,
  p_uid        text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_decision text;
  v_matched  cidr;
  v_reason   text;
  v_rule     uuid;
  -- `ip_events.id` is a bigserial, not a uuid. Declaring the out-parameter as
  -- uuid made every call fail at `returning id into v_id` with a cast error that
  -- names a number rather than a column.
  v_id       bigint;
  v_shadow   uuid;
begin
  -- This is called by the edge on every request, so it deliberately does not
  -- require a staff permission: the caller is the platform, not a person.
  if p_ip is null then
    raise exception 'An edge decision needs an address.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_action, ''))) < 2 then
    raise exception 'An edge decision needs an action.' using errcode = '22023';
  end if;

  -- The decision and the rule are read in one statement. Reading them separately
  -- means a decision taken between the two reads can leave the row claiming a rule
  -- that no longer explains it.
  select d.decision, d.matched, coalesce(r.id, null) as rule_id
    into v_decision, v_matched, v_rule
    from public.ip_decision(p_ip) d
    left join lateral (
      select r.id
        from public.ip_rules r
       where d.matched is not null
         and r.range = d.matched
         and (r.expires_at is null or r.expires_at > now())
         and r.disabled_at is null
       order by (r.kind = 'allow') desc
       limit 1
    ) r on true
   limit 1;

  if v_rule is not null then
    update public.ip_rules
       set last_matched_at = now(), match_count = match_count + 1
     where id = v_rule;
  end if;

  -- Shadow rules are recorded as what they would have done, which is the whole
  -- point: a day of evidence before the rule is armed.
  select r.id into v_shadow
    from public.ip_rules r
   where r.range >>= p_ip
     and r.shadow
     and r.disabled_at is null
     and (r.expires_at is null or r.expires_at > now())
   order by masklen(r.range) desc
   limit 1;

  insert into public.ip_events (ip, uid, action, request_id, decision, matched_rule)
  values (p_ip, nullif(btrim(coalesce(p_uid, '')), ''), btrim(p_action),
          nullif(btrim(coalesce(p_request_id, '')), ''), v_decision, v_rule)
  returning id into v_id;

  if v_shadow is not null then
    insert into public.ip_events (ip, uid, action, request_id, decision, matched_rule)
    values (p_ip, nullif(btrim(coalesce(p_uid, '')), ''), btrim(p_action) || ' [shadow]',
            nullif(btrim(coalesce(p_request_id, '')), ''), 'would-' || v_decision, v_shadow);
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_ip_decision(inet, text, text, text) from public, anon;
grant execute on function public.record_ip_decision(inet, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Expiry and review with teeth (§12.3)
-- ---------------------------------------------------------------------------
-- A rule past its review date is reported rather than trusted, and a block
-- with no review date cannot be created at all.
create or replace function public.ip_rules_needing_review(p_limit integer default 100)
returns table (
  id          uuid,
  range       cidr,
  kind        bsdc_ip_rule_kind,
  label       text,
  reason      text,
  review_at   timestamptz,
  overdue_by  interval,
  shadow      boolean,
  match_count bigint,
  last_matched_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select r.id, r.range, r.kind, r.label, r.reason, r.review_at,
         (now() - r.review_at),
         r.shadow, r.match_count, r.last_matched_at
    from public.ip_rules r
   where bsdc.has_permission('settings.read')
     and r.disabled_at is null
     and r.review_at is not null
     and r.review_at <= now()
   order by r.review_at
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.ip_rules_needing_review(integer) from public, anon;
grant execute on function public.ip_rules_needing_review(integer) to authenticated, service_role;

-- The rule writer, replaced to demand a review date, carry a label, and allow a
-- shadow rule that blocks nothing. The signature grows, so this is a new
-- function rather than a replacement of `set_ip_rule`: every existing caller
-- keeps working, and the console calls this one.
create or replace function public.save_ip_rule(
  p_range     cidr,
  p_kind      bsdc_ip_rule_kind,
  p_reason    text,
  p_label     text default '',
  p_review_at timestamptz default null,
  p_hours     integer default null,
  p_shadow    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_label    text := btrim(coalesce(p_label, ''));
  v_review   timestamptz := p_review_at;
  v_id       uuid;
  v_existing public.ip_rules%rowtype;
  v_hits     bigint;
begin
  perform bsdc.require_permission('settings.write');

  if p_range is null then
    raise exception 'Give a range.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'A rule needs a reason of at least ten characters. An unexplained block is a block nobody dares remove.'
      using errcode = '22023';
  end if;
  if char_length(v_label) < 2 then
    raise exception 'A rule needs a short label, so a list of rules is readable at a glance.'
      using errcode = '22023';
  end if;

  -- The floor is the whole point of §12.3: a block is temporary unless somebody
  -- deliberately extends it.
  if v_review is null and p_kind in ('block', 'watch') then
    if p_hours is not null then
      v_review := now() + make_interval(hours => greatest(1, least(p_hours, 8760)));
    else
      v_review := now() + interval '30 days';
    end if;
  end if;
  if v_review is not null and v_review <= now() then
    raise exception 'A review date in the past is not a review. Choose a future date, or disable the rule instead.'
      using errcode = '22023';
  end if;

  select * into v_existing from public.ip_rules where range = p_range and kind = p_kind;

  -- A new block is armed in shadow unless the caller says otherwise. This is the
  -- default that makes §12.3 real rather than a checkbox nobody ticks.
  insert into public.ip_rules (range, kind, reason, expires_at, created_by, review_at, shadow, label)
  values (p_range, p_kind, v_reason,
          case when p_hours is null then null else now() + make_interval(hours => greatest(1, p_hours)) end,
          bsdc.current_uid(), v_review, p_shadow, v_label)
  on conflict (range, kind) do update
    set reason = excluded.reason,
        expires_at = excluded.expires_at,
        review_at = excluded.review_at,
        shadow = excluded.shadow,
        label = excluded.label,
        disabled_at = null,
        disabled_reason = ''
  returning id into v_id;

  -- The dry run is evidence, so it is recorded alongside the rule: "when this
  -- was armed, it would have affected N requests in the last week".
  select coalesce(sum(d.would_change), 0) into v_hits
    from public.ip_dry_run(p_range, p_kind, 7, 500) d;

  perform bsdc.audit(
    case when v_existing.id is null then 'ip.rule.created' else 'ip.rule.updated' end,
    host(p_range),
    jsonb_build_object(
      'kind', p_kind, 'label', v_label, 'shadow', p_shadow,
      'review_at', v_review, 'would_affect', v_hits,
      'previous_kind', v_existing.kind));

  return v_id;
end;
$$;

revoke all on function public.save_ip_rule(cidr, bsdc_ip_rule_kind, text, text, timestamptz, integer, boolean) from public, anon;
grant execute on function public.save_ip_rule(cidr, bsdc_ip_rule_kind, text, text, timestamptz, integer, boolean) to authenticated, service_role;

-- Arming a shadow rule is its own decision, with the evidence in front of it.
create or replace function public.arm_ip_rule(p_id uuid, p_note text default '')
returns public.ip_rules
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row  public.ip_rules%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.ip_rules where id = p_id for update;
  if not found then
    raise exception 'No such rule' using errcode = 'P0002';
  end if;
  if not v_row.shadow then
    raise exception 'That rule is already armed.' using errcode = '22023';
  end if;
  if v_row.review_at is null or v_row.review_at <= now() then
    raise exception 'Arm a rule only with a future review date, so it cannot become permanent by being forgotten.'
      using errcode = '22023';
  end if;
  if char_length(v_note) < 3 then
    raise exception 'Say what the shadow period showed, in at least three characters.' using errcode = '22023';
  end if;

  update public.ip_rules
     set shadow = false
   where id = p_id
  returning * into v_row;

  perform bsdc.audit('ip.rule.armed', host(v_row.range),
    jsonb_build_object('note', v_note, 'matches_seen', v_row.match_count));
  return v_row;
end;
$$;

revoke all on function public.arm_ip_rule(uuid, text) from public, anon;
grant execute on function public.arm_ip_rule(uuid, text) to authenticated, service_role;

create or replace function public.disable_ip_rule(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row public.ip_rules%rowtype;
begin
  perform bsdc.require_permission('settings.write');

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Say why the rule is being disabled, in at least ten characters.' using errcode = '22023';
  end if;

  select * into v_row from public.ip_rules where id = p_id for update;
  if not found then
    raise exception 'No such rule' using errcode = 'P0002';
  end if;

  update public.ip_rules
     set disabled_at = now(), disabled_reason = left(btrim(p_reason), 300)
   where id = p_id;

  perform bsdc.audit('ip.rule.disabled', host(v_row.range),
    jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke all on function public.disable_ip_rule(uuid, text) from public, anon;
grant execute on function public.disable_ip_rule(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. The pending list, with the decision already worked out (§12.1)
-- ---------------------------------------------------------------------------
-- The console needs to know, before it renders a button, whether the person looking
-- may press it. That is a fact about the session, and the session lives on the
-- server — a screen that computes it from a uid it fetched separately can disagree
-- with the function that enforces it.
create or replace function public.config_pending_changes(p_limit integer default 100)
returns table (
  id            uuid,
  key           text,
  proposed_value jsonb,
  reason        text,
  status        text,
  apply_at      timestamptz,
  proposed_by   text,
  proposed_at   timestamptz,
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,
  scheduled     boolean,
  can_decide    boolean,
  blocker       text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    s.id, s.key, s.proposed_value, s.reason, s.status, s.apply_at,
    s.proposed_by, s.proposed_at, s.decided_by, s.decided_at, s.decision_note,
    (s.apply_at is not null),
    -- A schedule is cancellable by anybody; a staged proposal is decidable only by
    -- somebody who did not propose it.
    case when s.apply_at is not null then true
         else s.proposed_by <> bsdc.current_uid() end,
    case when s.apply_at is not null then 'scheduled'
         when s.proposed_by = bsdc.current_uid() then 'You proposed this, so a second person has to decide it.'
         else '' end
  from public.config_staged_changes s
  where bsdc.has_permission('settings.read')
    and s.status = 'pending'
  order by coalesce(s.apply_at, s.proposed_at)
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.config_pending_changes(integer) from public, anon;
grant execute on function public.config_pending_changes(integer) to authenticated, service_role;

-- The version list the composer reads. `page_versions` is staff-readable under RLS,
-- but a plain select cannot mark which version is current without a second read of
-- `custom_pages` — and a screen doing that can show a "revert" button beside the
-- version it is already on.
create or replace function public.custom_page_versions(p_page_id uuid)
returns table (
  version   integer,
  title     text,
  note      text,
  created_at timestamptz,
  created_by text,
  section_count integer,
  current   boolean
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    v.version, v.title, v.note, v.created_at, v.created_by,
    jsonb_array_length(v.sections),
    v.version = p.current_version
  from public.page_versions v
  join public.custom_pages p on p.id = v.page_id
  where v.page_id = p_page_id
    and bsdc.has_permission('settings.read')
  order by v.version desc;
$$;

revoke all on function public.custom_page_versions(uuid) from public, anon;
grant execute on function public.custom_page_versions(uuid) to authenticated, service_role;
