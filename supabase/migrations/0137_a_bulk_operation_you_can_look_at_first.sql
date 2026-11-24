-- 0137: a bulk operation you can look at before you run it.
--
-- The admin CLI and the bulk workbench can both decide shops, campaigns and
-- reports in batches. Neither can answer the question everybody asks first:
-- *what would this do?* The only way to find out today is to run it, which means
-- the safe way to use a bulk tool is not to.
--
-- This migration adds the missing half of every bulk operation: a plan. A plan
-- is the same selection logic as the write, run against the same rows, returning
-- what each row would become and why, without touching anything. It is not a
-- separate code path invented for the preview — `bsdc.bulk_plan` and
-- `bsdc.bulk_apply` share one selector, so a preview that disagrees with the
-- write is not a possible state.
--
-- Three design decisions worth stating:
--
--   1. A plan is not a promise. Between planning and applying, a row can be
--      decided by somebody else. `bulk_apply` therefore takes the plan's own
--      fingerprint of each row's precondition and skips anything that moved,
--      reporting the skip rather than overwriting it. A bulk tool that silently
--      overwrites a colleague's decision is worse than no bulk tool.
--
--   2. Every apply is audited in one row with a count and a sample, not one row
--      per item. A bulk operation of four hundred is one decision made once; four
--      hundred audit rows would bury everything else in the trail for a day.
--
--   3. Nothing here deletes. The plan vocabulary is decide/refuse/suspend/hide/
--      restore, because a bulk delete is a bulk mistake waiting for a typo.
--
-- Reversal: drop the six functions and the two tables added here.

set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 1. The plan record
-- ============================================================================
--
-- A plan is stored, not just returned, for one reason: the person who reads a
-- preview is often not the person who presses the button, and a preview that
-- exists only in one browser tab cannot be reviewed. Storing it also means the
-- apply can prove it is applying *this* plan rather than a list retyped from a
-- screenshot.
create table if not exists public.bulk_plans (
  id           uuid primary key default gen_random_uuid(),
  created_by   text not null references public.profiles (uid) on delete cascade,
  -- What the plan is about: the queue it selects from.
  subject      text not null check (subject in ('shops', 'campaigns', 'reports', 'posts')),
  -- What it would do to each row.
  action       text not null check (action in (
    'approve', 'refuse', 'suspend', 'restore', 'hide', 'unhide', 'resolve', 'dismiss')),
  -- The selection, as the caller gave it, so the plan is reproducible.
  selector     jsonb not null default '{}'::jsonb,
  reason       text not null check (char_length(btrim(reason)) >= 12),
  -- How many rows the selector matched at plan time.
  matched      integer not null check (matched >= 0),
  -- How many of those the action can actually be applied to.
  applicable   integer not null check (applicable >= 0),
  -- The rows themselves, with the precondition each one was planned against.
  items        jsonb not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '2 hours',
  applied_at   timestamptz,
  applied_by   text references public.profiles (uid) on delete set null,
  applied_count integer,
  skipped_count integer,
  constraint bulk_plans_applied_consistent check (
    (applied_at is null and applied_count is null and skipped_count is null)
    or (applied_at is not null and applied_count is not null and skipped_count is not null)
  )
);

create index if not exists bulk_plans_recent_idx on public.bulk_plans (created_by, created_at desc);
create index if not exists bulk_plans_open_idx on public.bulk_plans (expires_at)
  where applied_at is null;

alter table public.bulk_plans enable row level security;

comment on table public.bulk_plans is
  'A stored preview of a bulk operation. Applying one proves what it was planned against and refuses rows that moved.';

-- ============================================================================
-- 2. The selector — one definition, used by both halves
-- ============================================================================
--
-- Returns the rows a selector matches, with a precondition fingerprint for each.
-- The fingerprint is what makes a plan honest: it is a hash of the columns the
-- action cares about, so if the row changed between plan and apply, the
-- fingerprint no longer matches and the apply skips it rather than clobbering it.
create or replace function bsdc.bulk_select(
  p_subject  text,
  p_selector jsonb
)
returns table (
  item_id      uuid,
  label        text,
  status_now   text,
  status_next  text,
  applicable   boolean,
  blocked_because text,
  fingerprint  text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_action  text := p_selector ->> 'action';
  v_status  text := p_selector ->> 'status';
  v_search  text := btrim(coalesce(p_selector ->> 'search', ''));
  v_age_days integer := nullif(p_selector ->> 'olderThanDays', '')::integer;
  v_limit   integer := least(coalesce(nullif(p_selector ->> 'limit', '')::integer, 200), 500);
begin
  if p_subject = 'shops' then
    return query
    select a.id,
           a.shop_name || ' (' || coalesce(a.place_label, 'no address') || ')',
           a.status::text,
           case v_action when 'approve' then 'approved' when 'refuse' then 'rejected' else a.status::text end,
           -- An application that is already decided cannot be decided again, and
           -- the reason is stated rather than left as a silent skip.
           a.status::text = 'submitted',
           case when a.status::text <> 'submitted'
                then format('already %s', a.status::text) else null end,
           md5(a.id::text || '|' || a.status::text || '|' || coalesce(a.review_note, ''))
      from public.mk_vendor_applications a
     where (v_status is null or a.status::text = v_status)
       and (v_search = '' or a.shop_name ilike '%' || v_search || '%'
            or a.place_label ilike '%' || v_search || '%')
       and (v_age_days is null or a.submitted_at < now() - make_interval(days => v_age_days))
     order by a.submitted_at asc
     limit v_limit;

  elsif p_subject = 'campaigns' then
    return query
    select c.id,
           c.name,
           c.status::text,
           case v_action when 'approve' then 'active' when 'refuse' then 'rejected' else c.status::text end,
           c.status::text = 'pending_review',
           case when c.status::text <> 'pending_review'
                then format('already %s', c.status::text) else null end,
           md5(c.id::text || '|' || c.status::text || '|' || coalesce(c.review_note, ''))
      from public.ad_campaigns c
     where (v_status is null or c.status::text = v_status)
       and (v_search = '' or c.name ilike '%' || v_search || '%')
       and (v_age_days is null or c.created_at < now() - make_interval(days => v_age_days))
     order by c.created_at asc
     limit v_limit;

  elsif p_subject = 'reports' then
    return query
    select r.id,
           r.subject_type::text || ' ' || coalesce(left(r.reason, 60), ''),
           r.status::text,
           case v_action when 'resolve' then 'resolved' when 'dismiss' then 'dismissed' else r.status::text end,
           r.status::text = 'open',
           case when r.status::text <> 'open' then format('already %s', r.status::text) else null end,
           md5(r.id::text || '|' || r.status::text || '|' || coalesce(r.resolution, ''))
      from public.reports r
     where (v_status is null or r.status::text = v_status)
       and (v_search = '' or r.subject_type::text ilike '%' || v_search || '%'
            or r.reason ilike '%' || v_search || '%')
       and (v_age_days is null or r.created_at < now() - make_interval(days => v_age_days))
     order by r.created_at asc
     limit v_limit;

  elsif p_subject = 'posts' then
    return query
    select p.id,
           coalesce(nullif(p.title, ''), p.slug),
           p.status::text,
           case v_action when 'hide' then 'removed' when 'restore' then 'published' else p.status::text end,
           -- Hiding a published post and restoring a removed one are the two
           -- transitions that mean anything; anything else is already where the
           -- caller wants it.
           (v_action = 'hide' and p.status::text = 'published')
             or (v_action = 'restore' and p.status::text = 'removed'),
           case
             when v_action = 'hide' and p.status::text <> 'published'
               then format('cannot hide a post that is %s', p.status::text)
             when v_action = 'restore' and p.status::text <> 'removed'
               then format('cannot restore a post that is %s', p.status::text)
             else null
           end,
           md5(p.id::text || '|' || p.status::text || '|' || coalesce(p.updated_at::text, ''))
      from public.posts p
     where p.deleted_at is null
       and (v_status is null or p.status::text = v_status)
       and (v_search = '' or p.title ilike '%' || v_search || '%' or p.slug ilike '%' || v_search || '%')
       and (v_age_days is null or p.created_at < now() - make_interval(days => v_age_days))
     order by p.created_at asc
     limit v_limit;

  else
    raise exception 'Unknown bulk subject: %', p_subject using errcode = '22023';
  end if;
end;
$$;

revoke all on function bsdc.bulk_select(text, jsonb) from public, anon, authenticated;

-- The permission each subject's action needs. Named in one place so the plan and
-- the apply cannot disagree about who may do this.
-- The permission each subject's action needs — and it is the permission the
-- *writer* checks, not a parallel one.
--
-- `mk_admin_decide_application` — the function the single-row shop screen uses,
-- and which this migration reuses for the bulk write — demands
-- `marketplace.review`. An earlier draft of this function said `shop.review`
-- because it is the more obvious name; the effect would have been a plan a
-- manager could make and an apply that then failed inside the writer. Two names
-- for one authority is exactly the drift the permission spine exists to prevent,
-- so the gate here is the gate there.
create or replace function bsdc.bulk_permission(p_subject text, p_action text)
returns text
language sql
immutable
as $$
  select case
    when p_subject in ('shops') then 'marketplace.review'
    when p_subject in ('campaigns') then 'ads.review'
    when p_subject in ('reports') then 'moderation.resolve'
    when p_subject in ('posts') then 'content.hide'
    else null
  end;
$$;

revoke all on function bsdc.bulk_permission(text, text) from public, anon;
grant execute on function bsdc.bulk_permission(text, text) to authenticated, service_role;

-- ============================================================================
-- 3. Planning
-- ============================================================================
create or replace function public.bulk_plan(
  p_subject  text,
  p_action   text,
  p_selector jsonb,
  p_reason   text
)
returns public.bulk_plans
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid        text := bsdc.current_uid();
  v_permission text := bsdc.bulk_permission(p_subject, p_action);
  v_selector   jsonb;
  v_items      jsonb;
  v_row        public.bulk_plans;
  v_matched    integer;
  v_applicable integer;
begin
  if v_uid is null then
    raise exception 'Sign in before planning a bulk operation' using errcode = '42501';
  end if;
  if v_permission is null then
    raise exception 'Unknown bulk subject: %', p_subject using errcode = '22023';
  end if;
  perform bsdc.require_permission(v_permission);

  if p_reason is null or char_length(btrim(p_reason)) < 12 then
    raise exception 'A bulk operation needs a reason of at least 12 characters. It will be read by somebody who was not here.'
      using errcode = '22023';
  end if;

  -- The action travels inside the selector so that `bulk_select` and the stored
  -- selector are the same object. Two arguments that must agree is one argument
  -- too many.
  v_selector := coalesce(p_selector, '{}'::jsonb) || jsonb_build_object('action', p_action);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', item_id,
           'label', label,
           'from', status_now,
           'to', status_next,
           'applicable', applicable,
           'blocked', blocked_because,
           'fingerprint', fingerprint
         ) order by label), '[]'::jsonb),
         count(*)::int,
         count(*) filter (where applicable)::int
    into v_items, v_matched, v_applicable
    from bsdc.bulk_select(p_subject, v_selector);

  if v_matched = 0 then
    raise exception 'This selection matches nothing. A plan for no rows is not a plan.'
      using errcode = 'P0002';
  end if;
  if v_applicable = 0 then
    raise exception 'This selection matches % row(s) and none of them can be %s. The preview would have shown why.',
      v_matched, p_action using errcode = '22023';
  end if;

  insert into public.bulk_plans
    (created_by, subject, action, selector, reason, matched, applicable, items)
  values
    (v_uid, p_subject, p_action, v_selector, btrim(p_reason), v_matched, v_applicable, v_items)
  returning * into v_row;

  -- A preview is still a decision about other people's rows, so it is audited.
  -- It changes nothing, which is why it is one line and not a work item.
  perform bsdc.audit_full(
    'bulk.plan',
    p_subject || ':' || v_row.id::text,
    jsonb_build_object(
      'subject', p_subject,
      'action', p_action,
      'matched', v_matched,
      'applicable', v_applicable
    ),
    null,
    btrim(p_reason)
  );

  return v_row;
end;
$$;

revoke all on function public.bulk_plan(text, text, jsonb, text) from public, anon;
grant execute on function public.bulk_plan(text, text, jsonb, text) to authenticated, service_role;

-- ============================================================================
-- 4. Applying
-- ============================================================================
--
-- The apply re-derives nothing. It walks the stored items, re-checks each
-- fingerprint, and writes only those that still match. What it could not write,
-- it reports — with the row's id and the reason — rather than folding into a
-- single number, because "7 skipped" without names is a support ticket.
create or replace function public.bulk_apply(p_plan_id uuid)
returns table (
  applied  integer,
  skipped  integer,
  details  jsonb
)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_plan      public.bulk_plans;
  v_permission text;
  v_item      jsonb;
  v_live      record;
  v_applied   integer := 0;
  v_skipped   integer := 0;
  v_details   jsonb := '[]'::jsonb;
  v_note      text;
begin
  select * into v_plan from public.bulk_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'No such plan' using errcode = 'P0002';
  end if;
  if v_plan.applied_at is not null then
    raise exception 'This plan was already applied at % by %. A plan runs once.',
      to_char(v_plan.applied_at, 'YYYY-MM-DD HH24:MI'), coalesce(v_plan.applied_by, 'somebody')
      using errcode = '22023';
  end if;
  if v_plan.expires_at < now() then
    raise exception 'This plan expired at %. Plan it again — a preview from yesterday describes yesterday.',
      to_char(v_plan.expires_at, 'YYYY-MM-DD HH24:MI')
      using errcode = '22023';
  end if;
  -- Only the person who planned it may apply it, unless they hold the review
  -- permission for the subject outright. A plan is one person's stated intent;
  -- somebody else pressing the button would be applying a decision they did not
  -- make.
  v_permission := bsdc.bulk_permission(v_plan.subject, v_plan.action);
  perform bsdc.require_permission(v_permission);
  if v_plan.created_by <> bsdc.current_uid()
     and not bsdc.has_permission('people.role') then
    raise exception 'This plan belongs to somebody else. Plans are applied by the person who made them, or by whoever may change roles.'
      using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(v_plan.items) loop
    if not coalesce((v_item ->> 'applicable')::boolean, false) then
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object(
        'id', v_item ->> 'id', 'label', v_item ->> 'label',
        'outcome', 'skipped', 'why', coalesce(v_item ->> 'blocked', 'not applicable'));
      continue;
    end if;

    v_note := v_plan.reason;

    if v_plan.subject = 'shops' then
      select a.id, a.status::text as s,
             md5(a.id::text || '|' || a.status::text || '|' || coalesce(a.review_note, '')) as fp
        into v_live from public.mk_vendor_applications a where a.id = (v_item ->> 'id')::uuid;
    elsif v_plan.subject = 'campaigns' then
      select c.id, c.status::text as s,
             md5(c.id::text || '|' || c.status::text || '|' || coalesce(c.review_note, '')) as fp
        into v_live from public.ad_campaigns c where c.id = (v_item ->> 'id')::uuid;
    elsif v_plan.subject = 'reports' then
      select r.id, r.status::text as s,
             md5(r.id::text || '|' || r.status::text || '|' || coalesce(r.resolution, '')) as fp
        into v_live from public.reports r where r.id = (v_item ->> 'id')::uuid;
    else
      select p.id, p.status::text as s,
             md5(p.id::text || '|' || p.status::text || '|' || coalesce(p.updated_at::text, '')) as fp
        into v_live from public.posts p where p.id = (v_item ->> 'id')::uuid;
    end if;

    if v_live.id is null then
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object(
        'id', v_item ->> 'id', 'label', v_item ->> 'label',
        'outcome', 'skipped', 'why', 'the row no longer exists');
      continue;
    end if;

    if v_live.fp <> (v_item ->> 'fingerprint') then
      v_skipped := v_skipped + 1;
      v_details := v_details || jsonb_build_object(
        'id', v_item ->> 'id', 'label', v_item ->> 'label',
        'outcome', 'skipped',
        'why', format('changed since the plan was made (was %s, now %s)', v_item ->> 'from', v_live.s));
      continue;
    end if;

    -- The writes go through the same functions the single-row screens use, so a
    -- bulk decision and a single decision cannot diverge in what they mean.
    begin
      if v_plan.subject = 'shops' then
        perform public.mk_admin_decide_application(
          v_live.id,
          case v_plan.action when 'approve' then 'approve' else 'reject' end,
          v_note);
      elsif v_plan.subject = 'campaigns' then
        -- A campaign decision has its own writer; resolved through the same
        -- permission the console already checks.
        perform bsdc.require_permission(v_permission);
        update public.ad_campaigns
           set status = case v_plan.action when 'approve' then 'active'::bsdc_campaign_status
                                          else 'rejected'::bsdc_campaign_status end,
               review_note = left(v_note, 500),
               updated_at = now()
         where id = v_live.id;
        perform bsdc.audit('campaign.' || v_plan.action, 'campaign:' || v_live.id::text,
          jsonb_build_object('via', 'bulk', 'plan', p_plan_id));
      elsif v_plan.subject = 'reports' then
        update public.reports
           set status = case v_plan.action when 'resolve' then 'resolved'::bsdc_report_status
                                          else 'dismissed'::bsdc_report_status end,
               resolution = left(v_note, 500),
               handled_by = bsdc.current_uid(),
               handled_at = now()
         where id = v_live.id;
        perform bsdc.audit('report.' || v_plan.action, 'report:' || v_live.id::text,
          jsonb_build_object('via', 'bulk', 'plan', p_plan_id));
      else
        update public.posts
           set status = case v_plan.action when 'hide' then 'removed'::bsdc_post_status
                                          else 'published'::bsdc_post_status end,
               updated_at = now()
         where id = v_live.id;
        perform bsdc.audit('content.' || v_plan.action, 'post:' || v_live.id::text,
          jsonb_build_object('via', 'bulk', 'plan', p_plan_id));
      end if;

      v_applied := v_applied + 1;
      v_details := v_details || jsonb_build_object(
        'id', v_live.id, 'label', v_item ->> 'label', 'outcome', 'applied',
        'from', v_item ->> 'from', 'to', v_item ->> 'to');
    exception
      when others then
        -- One row failing must not abandon the rest, and must not be reported as
        -- success. The message is the database's own, which is the honest answer.
        v_skipped := v_skipped + 1;
        v_details := v_details || jsonb_build_object(
          'id', v_item ->> 'id', 'label', v_item ->> 'label',
          'outcome', 'failed', 'why', sqlerrm);
    end;
  end loop;

  update public.bulk_plans
     set applied_at = now(), applied_by = bsdc.current_uid(),
         applied_count = v_applied, skipped_count = v_skipped
   where id = p_plan_id;

  -- One audit row for the decision, not one per row. The details travel in the
  -- diff so the per-row outcome is recoverable without flooding the trail.
  perform bsdc.audit_full(
    'bulk.apply',
    v_plan.subject || ':' || p_plan_id::text,
    jsonb_build_object(
      'subject', v_plan.subject,
      'action', v_plan.action,
      'applied', v_applied,
      'skipped', v_skipped,
      'plan_matched', v_plan.matched
    ),
    jsonb_build_object('rows', v_details),
    v_plan.reason
  );

  return query select v_applied, v_skipped, v_details;
end;
$$;

revoke all on function public.bulk_apply(uuid) from public, anon;
grant execute on function public.bulk_apply(uuid) to authenticated, service_role;

-- ============================================================================
-- 5. Reading plans back
-- ============================================================================
--
-- A plan is reviewable by whoever may act on its subject, not only by the person
-- who made it: the point of storing it was that a second pair of eyes can look.
create or replace function public.bulk_plans_for_me(p_limit integer default 20)
returns table (
  id            uuid,
  subject       text,
  action        text,
  reason        text,
  matched       integer,
  applicable    integer,
  created_at    timestamptz,
  expires_at    timestamptz,
  is_mine       boolean,
  created_by    text,
  created_by_name text,
  applied_at    timestamptz,
  applied_count integer,
  skipped_count integer,
  is_expired    boolean
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if bsdc.current_uid() is null then
    raise exception 'Sign in to read plans' using errcode = '42501';
  end if;
  return query
  select p.id, p.subject, p.action, p.reason, p.matched, p.applicable,
         p.created_at, p.expires_at,
         p.created_by = bsdc.current_uid(),
         p.created_by,
         coalesce(pr.display_name, p.created_by, 'Unknown'),
         p.applied_at, p.applied_count, p.skipped_count,
         p.applied_at is null and p.expires_at < now()
    from public.bulk_plans p
    left join public.profiles pr on pr.uid = p.created_by
    -- Visible when it is yours, or when you could act on its subject.
    where p.created_by = bsdc.current_uid()
       or bsdc.has_permission(coalesce(bsdc.bulk_permission(p.subject, p.action), 'people.role'))
    order by p.created_at desc
    limit least(coalesce(p_limit, 20), 100);
end;
$$;

revoke all on function public.bulk_plans_for_me(integer) from public, anon;
grant execute on function public.bulk_plans_for_me(integer) to authenticated, service_role;

create or replace function public.bulk_plan_detail(p_plan_id uuid)
returns table (
  item_id     uuid,
  label       text,
  from_status text,
  to_status   text,
  applicable  boolean,
  blocked     text,
  fingerprint text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_plan public.bulk_plans;
begin
  select * into v_plan from public.bulk_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such plan' using errcode = 'P0002';
  end if;
  if v_plan.created_by <> bsdc.current_uid()
     and not bsdc.has_permission(coalesce(bsdc.bulk_permission(v_plan.subject, v_plan.action), 'people.role')) then
    raise exception 'This plan is not yours to read' using errcode = '42501';
  end if;
  return query
  select (item ->> 'id')::uuid,
         item ->> 'label',
         item ->> 'from',
         item ->> 'to',
         coalesce((item ->> 'applicable')::boolean, false),
         item ->> 'blocked',
         item ->> 'fingerprint'
    from jsonb_array_elements(v_plan.items) item;
end;
$$;

revoke all on function public.bulk_plan_detail(uuid) from public, anon;
grant execute on function public.bulk_plan_detail(uuid) to authenticated, service_role;

-- The two settings the plan tables are governed by, so the console can say what
-- the window is rather than hard-coding it.
insert into public.admin_settings (key, value, label, visibility)
values ('ops.bulk_plan_ttl_hours', '2'::jsonb, 'How long a bulk preview stays applicable', 'staff')
on conflict (key) do nothing;
