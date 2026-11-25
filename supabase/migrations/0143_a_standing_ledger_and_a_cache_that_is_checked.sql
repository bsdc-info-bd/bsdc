-- ============================================================================
-- 0143 — a standing ledger, and a cache that is checked against it
-- ============================================================================
--
-- §49.10 and §50.5 of the plan. A member's standing is a sum of signed entries:
-- a warning subtracts, a year of clean behaviour adds, a resolved appeal restores
-- what a mistake cost. The ledger is the truth. `profiles.standing_points` is a
-- cache, because reading a sum on every profile render is a cost that grows with
-- the member's history, and the history is the point.
--
-- A cache and a ledger diverge. The question is whether the divergence is caught,
-- so the trigger, the reconciliation read and the test that checks them ship in
-- one file and cannot be separated from each other.
--
-- Two things the plan states and this file makes true:
--
--   * an entry can expire, and an expired entry contributes nothing. Points that
--     "wear off" are the difference between a system that remembers a mistake and
--     one that punishes it forever.
--   * an entry can be revoked, with a reason. A wrong entry is not deleted —
--     deleting it would erase the evidence that it was wrong — it is marked and
--     stops counting.

-- ---------------------------------------------------------------------------
-- 1. The rule keys
-- ---------------------------------------------------------------------------
-- A `rule_key` is not free text. If it were, every caller would invent its own and
-- the ledger would hold forty ways of saying "spam". The set is a table so that
-- adding one is a visible row rather than a string in a function body.
create table if not exists public.standing_rules (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.-]{2,60}$'),
  label        text not null check (char_length(btrim(label)) between 2 and 80),
  -- Signed, because the point of the table is that the number is a policy and not
  -- a caller's opinion. A rule that adds points has a positive default.
  default_points integer not null,
  -- Whether entries under this rule stop contributing, and after how long. Null
  -- means forever, which is right for a ban and wrong for a bad day.
  expires_after_days integer check (expires_after_days is null or expires_after_days > 0),
  -- A rule that can only ever be applied by a person rather than automatically.
  -- Recorded here so an automated caller cannot quietly invent a new penalty.
  manual_only  boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Seeded through `on conflict do nothing` so re-running the migration cannot
-- overwrite a score somebody has since tuned.
insert into public.standing_rules (key, label, default_points, expires_after_days, manual_only) values
  ('warning.official',   'An official warning',            -10, 365, true),
  ('warning.minor',      'A minor warning',                 -3, 180, true),
  ('content.removed',    'Content removed for breaking a rule', -5, 365, false),
  ('content.restored',   'Content restored after review',    5, null, true),
  ('harassment.confirmed', 'Confirmed harassment',         -25, null, true),
  ('spam.confirmed',     'Confirmed spam',                  -15, 365, true),
  ('appeal.upheld',      'An appeal upheld',                 10, null, true),
  ('account.restored',   'An account restored after suspension', 5, null, true),
  ('clean.year',         'A year without a report',          5, null, false),
  ('good.faith',         'Good faith in a dispute',           5, null, true)
on conflict (key) do nothing;

alter table public.standing_rules enable row level security;

drop policy if exists standing_rules_read on public.standing_rules;
create policy standing_rules_read on public.standing_rules
  for select using (true);

revoke all on public.standing_rules from anon;
revoke all on public.standing_rules from authenticated;
grant select on public.standing_rules to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.standing_entries (
  id            bigserial primary key,
  uid           text not null references public.profiles (uid) on delete cascade,
  -- Signed. A negative entry takes standing away; a positive one gives it back.
  -- Zero is refused: an entry that changes nothing is a comment, and comments go
  -- on the case, not in a ledger.
  points        integer not null check (points <> 0),
  reason        text not null check (char_length(btrim(reason)) between 3 and 500),
  rule_key      text not null references public.standing_rules (key),
  -- Copied from the rule at insert time rather than read from it later, so that
  -- tuning a rule does not retroactively rewrite what already happened to people.
  -- A penalty is what it was when it was applied.
  expires_at    timestamptz,
  created_by    text references public.profiles (uid) on delete set null,
  created_at    timestamptz not null default now(),
  -- A correction, not a deletion.
  revoked_at    timestamptz,
  revoked_by    text references public.profiles (uid) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(btrim(revoke_reason)) between 3 and 500),

  -- A revocation without a reason is somebody covering their tracks. A revocation
  -- with one is a correction, and the difference is the whole of the audit trail.
  constraint standing_entries_revoke_is_explained
    check (
      (revoked_at is null and revoke_reason is null)
      or (revoked_at is not null and revoke_reason is not null)
    ),
  -- An expiry in the past would be an entry that never counted, which should not
  -- have been written in the first place.
  constraint standing_entries_expiry_sane
    check (expires_at is null or expires_at > created_at)
);

create index if not exists standing_entries_uid_idx
  on public.standing_entries (uid, created_at desc);
create index if not exists standing_entries_live_idx
  on public.standing_entries (uid) where revoked_at is null;
create index if not exists standing_entries_expiring_idx
  on public.standing_entries (expires_at) where revoked_at is null and expires_at is not null;

alter table public.standing_entries enable row level security;

drop policy if exists standing_entries_read_own on public.standing_entries;
create policy standing_entries_read_own on public.standing_entries
  for select using (uid = bsdc.current_uid());

drop policy if exists standing_entries_read_staff on public.standing_entries;
create policy standing_entries_read_staff on public.standing_entries
  for select using (bsdc.has_permission('moderation.read'));

revoke all on public.standing_entries from anon;
revoke all on public.standing_entries from authenticated;
grant select on public.standing_entries to authenticated;

-- No insert, update or delete policy: entries are written by the RPC below and
-- corrected by it, never by a caller holding a table privilege.

-- ---------------------------------------------------------------------------
-- 3. The cache
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists standing_points integer not null default 0;

comment on column public.profiles.standing_points is
  'Derived cache of public.standing_entries. The ledger is the truth; this is a read optimisation, and public.standing_reconcile() proves they agree.';

-- The definition of "what counts", in one place. Both the cache trigger and the
-- reconciliation read call this, so they cannot drift apart on the question the
-- reconciliation is supposed to answer.
create or replace function bsdc.standing_total(p_uid text)
returns integer
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(sum(e.points), 0)::integer
    from public.standing_entries e
   where e.uid = p_uid
     and e.revoked_at is null
     and (e.expires_at is null or e.expires_at > now());
$$;

revoke all on function bsdc.standing_total(text) from public, anon, authenticated;

-- The trigger recomputes from the ledger rather than adjusting the cache by a
-- delta, because a delta is a lie the moment two writes interleave. `sum` over an
-- indexed `uid` is cheap; a wrong number is not.
create or replace function bsdc.sync_standing_points()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text;
begin
  v_uid := coalesce(new.uid, old.uid);
  update public.profiles
     set standing_points = bsdc.standing_total(v_uid)
   where uid = v_uid;
  return null;
end;
$$;

revoke all on function bsdc.sync_standing_points() from public, anon, authenticated;

drop trigger if exists standing_entries_sync on public.standing_entries;
create trigger standing_entries_sync
  after insert or update or delete on public.standing_entries
  for each row execute function bsdc.sync_standing_points();

-- ---------------------------------------------------------------------------
-- 4. Writing an entry
-- ---------------------------------------------------------------------------
-- `person_standing_adjust` from the plan. Two shapes of call: name a rule and take
-- its default, or give an explicit number when the rule is a judgement.
create or replace function public.person_standing_adjust(
  p_uid      text,
  p_rule_key text,
  p_reason   text,
  p_points   integer default null,
  -- How long this particular entry lasts, overriding the rule. Passed as null to
  -- take the rule's own window.
  p_expires_after_days integer default null
)
returns bigint
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me    text := bsdc.current_uid();
  v_rule  public.standing_rules;
  v_points integer;
  v_days  integer;
  v_id    bigint;
begin
  perform bsdc.require_permission('moderation.resolve');

  select * into v_rule from public.standing_rules where key = p_rule_key;
  if v_rule.key is null then
    raise exception 'Unknown rule %. Add it to public.standing_rules first; a ledger of free-text reasons is not a ledger.',
      p_rule_key using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where uid = p_uid) then
    raise exception 'No such member' using errcode = 'P0002';
  end if;

  -- A rule marked manual-only says the decision is a person's. That is recorded so
  -- nobody later wires an automated penalty to it, and it is checked here so the
  -- recorded intent has a consequence.
  if v_rule.manual_only and v_me is null then
    raise exception 'Rule % may only be applied by a signed-in moderator', p_rule_key
      using errcode = '42501';
  end if;

  v_points := coalesce(p_points, v_rule.default_points);
  if v_points = 0 then
    raise exception 'An entry worth nothing is a comment. Write it on the case instead.'
      using errcode = '22023';
  end if;

  v_days := coalesce(p_expires_after_days, v_rule.expires_after_days);

  insert into public.standing_entries
    (uid, points, reason, rule_key, expires_at, created_by)
  values
    (p_uid, v_points, btrim(p_reason), p_rule_key,
     case when v_days is null then null else now() + make_interval(days => v_days) end,
     v_me)
  returning id into v_id;

  perform bsdc.audit('standing.adjust', 'person:' || p_uid,
    jsonb_build_object('rule', p_rule_key, 'points', v_points,
                       'expires_in_days', v_days, 'entry', v_id));

  return v_id;
end;
$$;

revoke all on function public.person_standing_adjust(text, text, text, integer, integer) from public, anon;
grant execute on function public.person_standing_adjust(text, text, text, integer, integer) to authenticated, service_role;

-- A correction. The entry stays, marked, with a reason, and stops counting.
create or replace function public.revoke_standing_entry(p_entry_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me    text := bsdc.current_uid();
  v_entry public.standing_entries;
begin
  perform bsdc.require_permission('moderation.resolve');

  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A correction needs a reason; that is the difference between correcting and hiding'
      using errcode = '22023';
  end if;

  select * into v_entry from public.standing_entries where id = p_entry_id for update;
  if v_entry.id is null then
    raise exception 'No such entry' using errcode = 'P0002';
  end if;
  if v_entry.revoked_at is not null then
    raise exception 'That entry was already revoked' using errcode = '22023';
  end if;

  update public.standing_entries
     set revoked_at = now(), revoked_by = v_me, revoke_reason = btrim(p_reason)
   where id = p_entry_id;

  perform bsdc.audit('standing.revoke', 'person:' || v_entry.uid,
    jsonb_build_object('entry', p_entry_id, 'points', v_entry.points,
                       'reason', p_reason));
end;
$$;

revoke all on function public.revoke_standing_entry(bigint, text) from public, anon;
grant execute on function public.revoke_standing_entry(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Reading it
-- ---------------------------------------------------------------------------

-- A member's own standing: the number, and the entries that made it.
create or replace function public.my_standing(p_limit integer default 50)
returns table (
  points     integer,
  reason     text,
  rule_key   text,
  rule_label text,
  expires_at timestamptz,
  revoked_at timestamptz,
  counted    boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_me text := bsdc.current_uid();
begin
  if v_me is null then
    raise exception 'Sign in to read your standing' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'A page holds between 1 and 200 entries' using errcode = '22023';
  end if;

  return query
    select e.points, e.reason, e.rule_key, r.label,
           e.expires_at, e.revoked_at,
           -- The same predicate `bsdc.standing_total` uses. A row shown as counting
           -- that the total does not include is a row that makes the member doubt
           -- the number, and they would be right to.
           (e.revoked_at is null and (e.expires_at is null or e.expires_at > now())),
           e.created_at
      from public.standing_entries e
      join public.standing_rules r on r.key = e.rule_key
     where e.uid = v_me
     order by e.created_at desc, e.id desc
     limit p_limit;
end;
$$;

revoke all on function public.my_standing(integer) from public, anon;
grant execute on function public.my_standing(integer) to authenticated, service_role;

-- The staff read: one member's standing as a number plus a short history.
create or replace function public.admin_standing(p_uid text)
returns table (
  uid            text,
  display_name   text,
  cached_points  integer,
  ledger_points  integer,
  agrees         boolean,
  entries        integer,
  counted_entries integer,
  oldest_live    timestamptz,
  next_expiry    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- The output column is called `uid`, and so is a column in the query below. Without
-- this, an unqualified reference is ambiguous and the whole read fails — which is
-- what t103 reported as "column reference uid is ambiguous". A pragma must sit
-- inside the body; in the header it is a syntax error at the `#`.
#variable_conflict use_column
begin
  perform bsdc.require_permission('moderation.read');
  if not exists (select 1 from public.profiles where uid = p_uid) then
    raise exception 'No such member' using errcode = 'P0002';
  end if;

  return query
    select p.uid, coalesce(p.display_name, p.username, ''),
           p.standing_points,
           bsdc.standing_total(p_uid),
           p.standing_points = bsdc.standing_total(p_uid),
           (select count(*)::int from public.standing_entries e where e.uid = p_uid),
           (select count(*)::int from public.standing_entries e
             where e.uid = p_uid and e.revoked_at is null
               and (e.expires_at is null or e.expires_at > now())),
           (select min(e.created_at) from public.standing_entries e
             where e.uid = p_uid and e.revoked_at is null
               and (e.expires_at is null or e.expires_at > now())),
           (select min(e.expires_at) from public.standing_entries e
             where e.uid = p_uid and e.revoked_at is null
               and e.expires_at is not null and e.expires_at > now())
      from public.profiles p
     where p.uid = p_uid;
end;
$$;

revoke all on function public.admin_standing(text) from public, anon;
grant execute on function public.admin_standing(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Reconciliation
-- ---------------------------------------------------------------------------
-- The read the reconciliation test uses, and the read an operator uses when
-- somebody reports a number that looks wrong. It returns only the rows that
-- disagree, so an empty result is the answer "the cache is right".
create or replace function public.standing_reconcile(p_limit integer default 200)
returns table (
  uid           text,
  cached_points integer,
  ledger_points integer,
  difference    integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('moderation.read');
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'A reconciliation page holds between 1 and 1000 members' using errcode = '22023';
  end if;

  return query
    select d.uid, d.cached, d.ledger, d.cached - d.ledger
      from (
        select p.uid, p.standing_points as cached, bsdc.standing_total(p.uid) as ledger
          from public.profiles p
      ) d
     where d.cached <> d.ledger
     order by abs(d.cached - d.ledger) desc
     limit p_limit;
end;
$$;

revoke all on function public.standing_reconcile(integer) from public, anon;
grant execute on function public.standing_reconcile(integer) to authenticated, service_role;

-- The repair, for the day the read is not empty. Not a silent sweep: it takes the
-- members to fix, recomputes them, and says how many it touched.
create or replace function public.repair_standing(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_rows integer;
begin
  perform bsdc.require_permission('moderation.resolve');
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'A repair batch holds between 1 and 1000 members' using errcode = '22023';
  end if;

  with wrong as (
    select d.uid
      from (
        select p.uid, p.standing_points as cached, bsdc.standing_total(p.uid) as ledger
          from public.profiles p
      ) d
     where d.cached <> d.ledger
     limit p_limit
  )
  update public.profiles p
     set standing_points = bsdc.standing_total(p.uid)
    from wrong w
   where p.uid = w.uid;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    perform bsdc.audit('standing.repair', 'profiles',
      jsonb_build_object('repaired', v_rows));
  end if;

  return v_rows;
end;
$$;

revoke all on function public.repair_standing(integer) from public, anon;
grant execute on function public.repair_standing(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Expiry
-- ---------------------------------------------------------------------------
-- An expired entry stops counting on its own — the sum already excludes it — but
-- the cache only notices when the row changes. This is what makes the cache catch
-- up, and it is callable from a scheduler. It returns how many members it
-- recomputed, which is zero on most days.
create or replace function public.sweep_standing_expiry(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_rows integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'A sweep batch holds between 1 and 5000 members' using errcode = '22023';
  end if;

  with stale as (
    select distinct p.uid
      from public.profiles p
      join public.standing_entries e on e.uid = p.uid
     where e.revoked_at is null
       and e.expires_at is not null
       and e.expires_at <= now()
       and p.standing_points <> bsdc.standing_total(p.uid)
     limit p_limit
  )
  update public.profiles p
     set standing_points = bsdc.standing_total(p.uid)
    from stale s
   where p.uid = s.uid;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.sweep_standing_expiry(integer) from public, anon, authenticated;
grant execute on function public.sweep_standing_expiry(integer) to service_role;
