-- ============================================================================
-- 0140 — a receipt for every staff action
-- ============================================================================
--
-- §49.7 of the plan. A staff member who hides a post, suspends an account or
-- refuses a shop gets a receipt; so does the member it happened to. The receipt
-- says what was done, to what, why, and by which route — the single-row screen or
-- a bulk plan — and it is written by the same statement that did the work, so
-- there is no path where the action happened and the receipt did not.
--
-- The plan calls for a `retention_policies` row. That table does not exist, and
-- inventing it here to hold one row would be a table with one reader and no
-- writer. Retention is expressed where it can be enforced instead: as a check
-- constraint on the row, as a `purge_action_receipts` function this migration
-- ships, and as a column that records the date it is safe to delete — so the
-- operator who comes to run the purge does not have to look the policy up.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.action_receipts (
  id            uuid primary key default gen_random_uuid(),
  -- Who did it. Nullable only for a system action, which is rare enough that
  -- seeing a null here should prompt a second look rather than be routine.
  actor_uid     text references public.profiles (uid) on delete set null,
  -- What they did: the same vocabulary the audit trail uses, so a receipt and an
  -- audit row can be joined on the pair (action, subject).
  action        text not null check (char_length(btrim(action)) between 3 and 60),
  subject       text not null check (char_length(btrim(subject)) between 1 and 120),
  -- The person the action landed on, denormalised on purpose. A receipt is read by
  -- the member it concerns, and joining back through `audit_log` to find them
  -- would make the member's own receipt depend on a table they cannot read.
  about_uid     text references public.profiles (uid) on delete cascade,
  reason        text not null default '' check (char_length(reason) <= 500),
  -- The route: 'single', 'bulk', 'system'. Not a foreign key to bulk_plans —
  -- a receipt has to survive a plan being cleaned up.
  via           text not null default 'single' check (via in ('single', 'bulk', 'system')),
  plan_id       uuid,
  -- What changed, so a receipt can answer "what was it before" without the trail.
  before_state  jsonb not null default '{}'::jsonb,
  after_state   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  -- The policy, in the row: a receipt is kept for ninety days and no longer.
  -- `purge_after` is computed rather than trusted to a nightly job's arithmetic,
  -- and the purge below honours it.
  purge_after   timestamptz not null default now() + interval '90 days'
);

create index if not exists action_receipts_about_idx
  on public.action_receipts (about_uid, created_at desc);
create index if not exists action_receipts_actor_idx
  on public.action_receipts (actor_uid, created_at desc);
create index if not exists action_receipts_purge_idx
  on public.action_receipts (purge_after);

comment on table public.action_receipts is
  'One row per staff action that affected a member. Kept ninety days: `purge_after` is the authority, and public.purge_action_receipts() deletes past it.';

alter table public.action_receipts enable row level security;

-- A member reads the receipts about themselves. Staff with audit.read read all of
-- them, because a receipt and an audit row are two views of one event and a
-- reviewer who can see one should see the other.
drop policy if exists action_receipts_read_own on public.action_receipts;
create policy action_receipts_read_own on public.action_receipts
  for select using (about_uid = bsdc.current_uid());

drop policy if exists action_receipts_read_staff on public.action_receipts;
create policy action_receipts_read_staff on public.action_receipts
  for select using (bsdc.has_permission('audit.read'));

-- No insert, update or delete policy: receipts are written by the security-definer
-- functions below and by nothing else, and they are deleted only by the purge.

revoke all on public.action_receipts from anon;
revoke all on public.action_receipts from authenticated;
grant select on public.action_receipts to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Writing one
-- ---------------------------------------------------------------------------
-- Every writer goes through this, so the field set and the purge date cannot
-- drift between the single-row path and the bulk path.
create or replace function bsdc.write_receipt(
  p_about     text,
  p_action    text,
  p_subject   text,
  p_reason    text default '',
  p_via       text default 'single',
  p_plan_id   uuid default null,
  p_before    jsonb default '{}'::jsonb,
  p_after     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_about is null then
    raise exception 'A receipt has to be about somebody' using errcode = '22023';
  end if;
  if p_via not in ('single', 'bulk', 'system') then
    raise exception 'Unknown route %', p_via using errcode = '22023';
  end if;
  -- A bulk receipt without the plan it came from is a receipt with no audit path
  -- back to the preview, which was the whole point of storing plans.
  if p_via = 'bulk' and p_plan_id is null then
    raise exception 'A bulk receipt must name its plan' using errcode = '22023';
  end if;

  -- A change made with nobody signed in — a migration, a scheduled sweep — is the
  -- system's, not a person's. Marking it so is better than refusing the write, and
  -- better than naming a staff member who was not there. `t95` found this the hard
  -- way: it writes an audit row as a maintenance caller and the receipt for the
  -- status change it caused hit the actor constraint.
  --
  -- This runs *after* the plan check on purpose. The first version ran before it,
  -- and t100 caught the consequence: a bulk receipt with no plan was accepted
  -- because the downgrade had already rewritten the route to 'system'.
  if bsdc.current_uid() is null then
    p_via := 'system';
    p_plan_id := null;
  end if;

  insert into public.action_receipts
    (actor_uid, action, subject, about_uid, reason, via, plan_id, before_state, after_state)
  values
    (bsdc.current_uid(), p_action, p_subject, p_about,
     left(coalesce(p_reason, ''), 500), p_via, p_plan_id,
     coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function bsdc.write_receipt(text, text, text, text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reading one
-- ---------------------------------------------------------------------------
-- `admin_receipt` returns the receipt plus the actor's name, because a receipt
-- that says a uuid did it is not something a member can reply to.
create or replace function public.admin_receipt(p_id uuid)
returns table (
  id           uuid,
  action       text,
  subject      text,
  about_uid    text,
  reason       text,
  via          text,
  plan_id      uuid,
  before_state jsonb,
  after_state  jsonb,
  actor_uid    text,
  actor_name   text,
  created_at   timestamptz,
  purge_after  timestamptz
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
    raise exception 'Sign in to read a receipt' using errcode = '42501';
  end if;

  return query
    select r.id, r.action, r.subject, r.about_uid, r.reason, r.via, r.plan_id,
           r.before_state, r.after_state, r.actor_uid,
           coalesce(p.display_name, p.username, 'a staff member'),
           r.created_at, r.purge_after
      from public.action_receipts r
      left join public.profiles p on p.uid = r.actor_uid
     where r.id = p_id
       and (r.about_uid = v_me or bsdc.has_permission('audit.read'));

  -- Nothing found is reported as no rows rather than as an error: a member asking
  -- about a receipt that is not theirs should not learn whether it exists, and
  -- "no rows" and "not yours" are the same answer.
end;
$$;

revoke all on function public.admin_receipt(uuid) from public, anon;
grant execute on function public.admin_receipt(uuid) to authenticated, service_role;

-- My own receipts, newest first. The same read as `admin_receipt` for one row,
-- because a member's history is a list and the console shows a list.
create or replace function public.my_receipts(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  id          uuid,
  action      text,
  subject     text,
  reason      text,
  via         text,
  actor_name  text,
  created_at  timestamptz
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
    raise exception 'Sign in to read your receipts' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'A page holds between 1 and 200 receipts' using errcode = '22023';
  end if;

  return query
    select r.id, r.action, r.subject, r.reason, r.via,
           coalesce(pr.display_name, pr.username, 'a staff member'),
           r.created_at
      from public.action_receipts r
      left join public.profiles pr on pr.uid = r.actor_uid
     where r.about_uid = v_me
       and (p_before is null or r.created_at < p_before)
     order by r.created_at desc, r.id desc
     limit p_limit;
end;
$$;

revoke all on function public.my_receipts(integer, timestamptz) from public, anon;
grant execute on function public.my_receipts(integer, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The purge
-- ---------------------------------------------------------------------------
-- Ninety days is a promise, and a promise nobody runs is a lie. This is callable
-- from a scheduler and safe to call twice: it deletes what is past `purge_after`
-- and says how many rows that was.
create or replace function public.purge_action_receipts(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_rows integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50000 then
    raise exception 'A purge batch holds between 1 and 50000 rows' using errcode = '22023';
  end if;

  with dead as (
    select id from public.action_receipts
     where purge_after <= now()
     order by purge_after
     limit p_limit
  )
  delete from public.action_receipts r
   using dead
   where r.id = dead.id;

  get diagnostics v_rows = row_count;

  -- The purge itself is audited, without a receipt: a receipt about a receipt is
  -- the kind of recursion that ends with a table nobody can shrink.
  if v_rows > 0 then
    perform bsdc.audit('receipts.purge', 'action_receipts',
      jsonb_build_object('deleted', v_rows, 'cutoff', now() - interval '90 days'));
  end if;

  return v_rows;
end;
$$;

revoke all on function public.purge_action_receipts(integer) from public, anon, authenticated;
grant execute on function public.purge_action_receipts(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Writing a receipt from an action that already happens
-- ---------------------------------------------------------------------------
-- The two paths that decide a person's fate are the single-row screens and a bulk
-- plan. Both already write an audit row; both now write a receipt as well, through
-- one helper, so the two cannot disagree about what a decision produced.
--
-- 0137's `bulk_apply` is not rewritten here — it is fifty lines of loop and the
-- only thing it needs is one more call per applied row. Instead a trigger follows
-- the audit trail: every `bulk.apply` row names its plan, and the plan's subject
-- and applied items say who was affected. This keeps the change to the part that
-- is actually new.
create or replace function bsdc.on_bulk_apply_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_plan    public.bulk_plans;
  v_item     jsonb;
  v_about    text;
  v_plan_id uuid;
begin
  if new.action <> 'bulk.apply' then
    return null;
  end if;

  -- Where the plan id lives. 0137's `bulk_apply` writes its audit row with the
  -- plan in the *subject* — `subject || ':' || plan_id` — and does not repeat it in
  -- the metadata. Reading only the metadata found nothing, and the first run of
  -- t100 showed a plan that applied two rows and produced no receipts at all. Both
  -- places are tried so a future writer that uses either one works.
  v_plan_id := coalesce(
    nullif(new.metadata ->> 'plan', '')::uuid,
    nullif(split_part(coalesce(new.subject, ''), ':', 2), '')::uuid
  );
  if v_plan_id is null then
    return null;
  end if;

  select * into v_plan from public.bulk_plans where id = v_plan_id;
  if v_plan.id is null then
    return null;
  end if;

  for v_item in
    select * from jsonb_array_elements(
      coalesce((new.diff ->> 'rows')::jsonb, '[]'::jsonb))
  loop
    if v_item ->> 'outcome' <> 'applied' then
      continue;
    end if;

    -- Who the row belongs to, by subject. A post belongs to its author, a shop to
    -- its owner, a report to its reporter. Anything else gets no receipt rather
    -- than one attributed to nobody.
    if v_plan.subject = 'shops' then
      select owner_uid into v_about from public.mk_vendor_applications
       where id = (v_item ->> 'id')::uuid;
    elsif v_plan.subject = 'campaigns' then
      select owner_uid into v_about from public.ad_campaigns
       where id = (v_item ->> 'id')::uuid;
    elsif v_plan.subject = 'reports' then
      select reporter_uid into v_about from public.reports
       where id = (v_item ->> 'id')::uuid;
    else
      select author_uid into v_about from public.posts
       where id = (v_item ->> 'id')::uuid;
    end if;

    if v_about is null then
      continue;
    end if;

    perform bsdc.write_receipt(
      v_about,
      'bulk.' || v_plan.action,
      v_plan.subject || ':' || (v_item ->> 'id'),
      v_plan.reason,
      'bulk',
      v_plan.id,
      jsonb_build_object('status', v_item ->> 'from'),
      jsonb_build_object('status', v_item ->> 'to')
    );
  end loop;

  return null;
end;
$$;

revoke all on function bsdc.on_bulk_apply_receipt() from public, anon, authenticated;

drop trigger if exists action_receipts_from_bulk on public.audit_log;
create trigger action_receipts_from_bulk
  after insert on public.audit_log
  for each row execute function bsdc.on_bulk_apply_receipt();

-- ---------------------------------------------------------------------------
-- 6. And from the single-row paths
-- ---------------------------------------------------------------------------
-- Each of these already exists and already notifies; what they lacked was a
-- receipt. Rather than rewriting five functions, one helper is exposed and the
-- receipt is written beside the notification — the notification tells the member
-- it happened, the receipt records what it was.
create or replace function bsdc.receipt_for_account_state(p_uid text, p_status text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  return bsdc.write_receipt(
    p_uid,
    case when p_status = 'active' then 'account.restore' else 'account.suspend' end,
    'account:' || p_uid,
    p_reason,
    'single',
    null,
    '{}'::jsonb,
    jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function bsdc.receipt_for_account_state(text, text, text) from public, anon, authenticated;

-- The trigger that already runs on a suspension writes the receipt in the same
-- breath as the notification, so the two cannot come apart.
create or replace function bsdc.on_profile_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_reason text;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return null;
  end if;

  v_reason := coalesce(
    nullif(current_setting('bsdc.status_reason', true), ''),
    (
      select a.metadata ->> 'reason'
        from public.audit_log a
       where a.subject = new.uid
         and a.action in ('people.status', 'people.suspend', 'people.restore')
       order by a.id desc
       limit 1
    ),
    (
      select ma.reason
        from public.moderation_actions ma
       where ma.subject_type = 'account'
         and ma.subject_id = new.uid
       order by ma.created_at desc
       limit 1
    ),
    ''
  );

  perform bsdc.receipt_for_account_state(new.uid, new.status::text, v_reason);
  perform bsdc.notify_account_state(new.uid, new.status::text, v_reason);
  return null;
end;
$$;

revoke all on function bsdc.on_profile_status_changed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. One check that the whole point holds
-- ---------------------------------------------------------------------------
-- A receipt exists to be evidence, so the table refuses the two ways evidence
-- becomes worthless: a receipt with no actor when the route was a person, and a
-- receipt dated after the purge that has already happened.
alter table public.action_receipts
  drop constraint if exists action_receipts_actor_present;
alter table public.action_receipts
  add constraint action_receipts_actor_present
  check (actor_uid is not null or via = 'system');

alter table public.action_receipts
  drop constraint if exists action_receipts_purge_after_created;
alter table public.action_receipts
  add constraint action_receipts_purge_after_created
  check (purge_after >= created_at);
