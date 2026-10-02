-- ---------------------------------------------------------------------------
-- Admin core and the plugin system.
--
-- The rules this file enforces, none of which a screen is trusted with:
--   1. A permission is a row, not an `if` in a component. Every privileged
--      function asks `bsdc.has_permission()`, which reads a table that an
--      owner can change without a deploy.
--   2. Nobody can promote themselves, promote anyone to a rank at or above
--      their own, or demote the last owner. Privilege escalation is not a bug
--      to be caught in review; it is a constraint.
--   3. Every feature is a plugin that can be switched off, except the ones
--      the product cannot exist without, and a plugin cannot be enabled while
--      something it depends on is off.
--   4. Every administrative act writes an audit row in the same transaction
--      that performs it. The audit log has no update or delete policy for
--      anyone, including an owner.
-- ---------------------------------------------------------------------------

-- --------------------------- plugin metadata -------------------------------
-- feature_flags already exists from 0001. A plugin is a flag with a name a
-- human recognises, a module it belongs to, and the plugins it needs.
alter table public.feature_flags
  add column if not exists label text not null default '';
alter table public.feature_flags
  add column if not exists module text not null default 'core';
alter table public.feature_flags
  add column if not exists is_core boolean not null default false;
alter table public.feature_flags
  add column if not exists depends_on text[] not null default '{}';
alter table public.feature_flags
  add column if not exists rollout_percent integer not null default 100
    check (rollout_percent between 0 and 100);
alter table public.feature_flags
  add column if not exists sort_order integer not null default 100;

create index if not exists feature_flags_module_idx on public.feature_flags (module, sort_order);

-- The plugin catalogue. Core entries are the four things that make BSDC a
-- product rather than a blank page; they are seeded is_core and can never be
-- switched off, so an accidental click cannot lock everyone out.
insert into public.feature_flags
  (key, enabled, audience, description, label, module, is_core, depends_on, sort_order)
values
  ('core.auth', true, 'all', 'Sign in and sessions', 'Authentication', 'core', true, '{}', 10),
  ('core.profiles', true, 'all', 'Member profiles', 'Profiles', 'core', true, '{}', 20),
  ('core.feed', true, 'all', 'The main feed', 'Feed', 'core', true, '{}', 30),
  ('core.admin', true, 'staff', 'The admin panel itself', 'Admin panel', 'core', true, '{}', 40),
  ('content.composer', true, 'all', 'Universal composer', 'Composer', 'content', false, '{core.auth}', 110),
  ('content.comments', true, 'all', 'Comments and replies', 'Comments', 'content', false, '{core.feed}', 120),
  ('content.reactions', true, 'all', 'Reactions', 'Reactions', 'content', false, '{core.feed}', 130),
  ('social.follow', true, 'all', 'Following members', 'Following', 'social', false, '{core.profiles}', 210),
  ('social.messaging', true, 'all', 'BSDC Messenger', 'Messenger', 'social', false, '{core.auth}', 220),
  ('social.communities', true, 'all', 'Groups, pages and events', 'Communities', 'social', false, '{core.auth}', 230),
  ('work.jobs', true, 'all', 'Job board', 'Jobs', 'work', false, '{core.auth}', 310),
  ('work.freelance', true, 'all', 'Freelance briefs', 'Freelance', 'work', false, '{core.auth}', 320),
  ('work.projects', true, 'all', 'Open source projects', 'Projects', 'work', false, '{core.auth}', 330),
  ('work.playground', true, 'all', 'Code playground', 'Playground', 'work', false, '{}', 340),
  ('learn.courses', true, 'all', 'Courses and lessons', 'Learning', 'learn', false, '{core.auth}', 410),
  ('learn.certificates', true, 'all', 'Certificates and verification', 'Certificates', 'learn', false, '{learn.courses}', 420),
  ('market.shop', true, 'all', 'Storefront and checkout', 'Marketplace', 'market', false, '{core.auth}', 510),
  ('market.vendor', true, 'vendor', 'Vendor console', 'Vendor console', 'market', false, '{market.shop}', 520),
  ('market.payouts', true, 'vendor', 'Vendor payouts', 'Payouts', 'market', false, '{market.vendor}', 530),
  ('ads.serving', true, 'all', 'Serving sponsored placements', 'Ad serving', 'ads', false, '{}', 610),
  ('ads.console', true, 'all', 'Advertiser console', 'Advertiser console', 'ads', false, '{ads.serving}', 620),
  ('admin.moderation', true, 'staff', 'Moderation queue', 'Moderation', 'admin', false, '{core.admin}', 710),
  ('admin.people', true, 'staff', 'Roles and account status', 'People', 'admin', false, '{core.admin}', 720),
  ('admin.audit', true, 'staff', 'Audit log', 'Audit log', 'admin', false, '{core.admin}', 730)
on conflict (key) do update
set label      = excluded.label,
    module     = excluded.module,
    is_core    = excluded.is_core,
    depends_on = excluded.depends_on,
    sort_order = excluded.sort_order;

-- --------------------------- role permissions ------------------------------
create table if not exists public.role_permissions (
  role       bsdc_role not null,
  permission text not null check (permission ~ '^[a-z][a-z0-9_.]{2,60}$'),
  primary key (role, permission)
);

insert into public.role_permissions (role, permission) values
  ('moderator', 'moderation.read'),
  ('moderator', 'moderation.resolve'),
  ('moderator', 'content.hide'),
  ('moderator', 'audit.read'),
  ('manager', 'moderation.read'),
  ('manager', 'moderation.resolve'),
  ('manager', 'content.hide'),
  ('manager', 'audit.read'),
  ('manager', 'people.read'),
  ('manager', 'people.suspend'),
  ('manager', 'shop.review'),
  ('manager', 'ads.review'),
  ('admin', 'moderation.read'),
  ('admin', 'moderation.resolve'),
  ('admin', 'content.hide'),
  ('admin', 'audit.read'),
  ('admin', 'people.read'),
  ('admin', 'people.suspend'),
  ('admin', 'people.role'),
  ('admin', 'shop.review'),
  ('admin', 'ads.review'),
  ('admin', 'plugins.read'),
  ('admin', 'plugins.write'),
  ('admin', 'settings.read'),
  ('admin', 'settings.write'),
  ('owner', 'moderation.read'),
  ('owner', 'moderation.resolve'),
  ('owner', 'content.hide'),
  ('owner', 'audit.read'),
  ('owner', 'people.read'),
  ('owner', 'people.suspend'),
  ('owner', 'people.role'),
  ('owner', 'shop.review'),
  ('owner', 'ads.review'),
  ('owner', 'plugins.read'),
  ('owner', 'plugins.write'),
  ('owner', 'settings.read'),
  ('owner', 'settings.write'),
  ('owner', 'owner.transfer')
on conflict do nothing;

-- The role a caller actually holds, read from their profile rather than from
-- a claim they could be carrying from before a demotion.
create or replace function bsdc.actor_role()
returns bsdc_role
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(
    (select p.role from public.profiles p where p.uid = bsdc.current_uid()),
    'member'::bsdc_role
  );
$$;

create or replace function bsdc.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select exists (
    select 1 from public.role_permissions r
    where r.role = bsdc.actor_role() and r.permission = p_permission
  );
$$;

create or replace function bsdc.require_permission(p_permission text)
returns void
language plpgsql
stable
as $$
begin
  if not bsdc.has_permission(p_permission) then
    raise exception 'Permission % is required', p_permission using errcode = '42501';
  end if;
end;
$$;

-- Rank, so a comparison between two roles is a number and not a guess.
create or replace function bsdc.role_rank(p_role bsdc_role)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'member' then 10
    when 'creator' then 20
    when 'vendor' then 30
    when 'moderator' then 40
    when 'manager' then 50
    when 'admin' then 60
    when 'owner' then 70
  end;
$$;

-- ------------------------------ audit trail --------------------------------
create or replace function bsdc.audit(
  p_action   text,
  p_subject  text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, bsdc, pg_temp
as $$
  insert into public.audit_log (actor_uid, action, subject, metadata)
  values (bsdc.current_uid(), p_action, coalesce(p_subject, ''), coalesce(p_metadata, '{}'::jsonb));
$$;

-- ---------------------------- admin settings -------------------------------
create table if not exists public.admin_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  value       jsonb not null default '{}'::jsonb,
  label       text not null default '',
  -- A public setting is readable by anyone; a staff setting is not.
  visibility  text not null default 'staff' check (visibility in ('public', 'staff')),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists admin_settings_touch on public.admin_settings;
create trigger admin_settings_touch before update on public.admin_settings
  for each row execute function bsdc.touch_updated_at();

insert into public.admin_settings (key, value, label, visibility) values
  ('site.registration_open', 'true'::jsonb, 'Registration open', 'public'),
  ('site.maintenance', 'false'::jsonb, 'Maintenance mode', 'public'),
  ('moderation.auto_hide_reports', '5'::jsonb, 'Reports before auto hide', 'staff'),
  ('market.default_commission_bps', '500'::jsonb, 'Default shop commission', 'staff'),
  ('ads.min_bid', '100'::jsonb, 'Minimum ad bid in poisha', 'staff')
on conflict (key) do nothing;

-- --------------------------- moderation actions ----------------------------
-- Append only: what was done, to what, by whom, and why. A reversal is a new
-- row, never an edit of the row that recorded the original decision.
create table if not exists public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  actor_uid    text not null references public.profiles (uid) on delete set null,
  report_id    uuid references public.reports (id) on delete set null,
  subject_type text not null check (char_length(subject_type) between 2 and 40),
  subject_id   text not null check (char_length(subject_id) between 1 and 100),
  action       text not null check (action in (
    'dismiss', 'warn', 'hide_content', 'restore_content', 'suspend_account',
    'restore_account', 'ban_account'
  )),
  reason       text not null default '' check (char_length(reason) <= 500),
  created_at   timestamptz not null default now()
);

create index if not exists moderation_actions_subject_idx
  on public.moderation_actions (subject_type, subject_id, created_at desc);
create index if not exists moderation_actions_actor_idx
  on public.moderation_actions (actor_uid, created_at desc);

alter table public.reports
  add column if not exists assigned_to text references public.profiles (uid) on delete set null;
alter table public.reports
  add column if not exists resolution text not null default ''
    check (char_length(resolution) <= 500);

create index if not exists reports_assigned_idx on public.reports (assigned_to)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Plugin control
-- ---------------------------------------------------------------------------
create or replace function public.plugin_registry()
returns table (
  key             text,
  label           text,
  description     text,
  module          text,
  enabled         boolean,
  audience        text,
  is_core         boolean,
  depends_on      text[],
  rollout_percent integer,
  blocked_by      text[],
  updated_at      timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    f.key, f.label, f.description, f.module, f.enabled, f.audience, f.is_core,
    f.depends_on, f.rollout_percent,
    -- The dependencies that are currently off: the honest reason a plugin
    -- shows as unavailable even though its own switch is on.
    coalesce(
      array(
        select d.key from public.feature_flags d
        where d.key = any (f.depends_on) and not d.enabled
      ),
      '{}'::text[]
    ) as blocked_by,
    f.updated_at
  from public.feature_flags f
  where bsdc.has_permission('plugins.read')
  order by f.module, f.sort_order, f.key;
$$;

create or replace function public.set_plugin_enabled(
  p_key     text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_flag     public.feature_flags%rowtype;
  v_blocked  text[];
  v_dependants text[];
begin
  perform bsdc.require_permission('plugins.write');

  select * into v_flag from public.feature_flags where key = p_key for update;
  if not found then
    raise exception 'No such plugin: %', p_key using errcode = 'P0002';
  end if;

  -- A core plugin is what the product is. It has a switch in the schema only
  -- so that the catalogue is uniform; the switch does not move.
  if v_flag.is_core and not p_enabled then
    raise exception 'A core plugin cannot be switched off' using errcode = '22023';
  end if;

  if p_enabled then
    select coalesce(array_agg(d.key), '{}'::text[]) into v_blocked
    from public.feature_flags d
    where d.key = any (v_flag.depends_on) and not d.enabled;

    if array_length(v_blocked, 1) > 0 then
      raise exception 'Enable % first', array_to_string(v_blocked, ', ')
        using errcode = '22023';
    end if;
  else
    -- Switching something off switches off everything standing on it, in the
    -- same transaction, so the system is never half on.
    with recursive tree as (
      select key from public.feature_flags where p_key = any (depends_on) and enabled
      union
      select f.key from public.feature_flags f
      join tree t on t.key = any (f.depends_on)
      where f.enabled
    )
    select coalesce(array_agg(key), '{}'::text[]) into v_dependants from tree;

    if array_length(v_dependants, 1) > 0 then
      if exists (
        select 1 from public.feature_flags
        where key = any (v_dependants) and is_core
      ) then
        raise exception 'A core plugin depends on this one' using errcode = '22023';
      end if;

      update public.feature_flags
      set enabled = false, updated_by = bsdc.current_uid()
      where key = any (v_dependants);
    end if;
  end if;

  update public.feature_flags
  set enabled = p_enabled, updated_by = bsdc.current_uid()
  where key = p_key;

  perform bsdc.audit(
    case when p_enabled then 'plugin.enable' else 'plugin.disable' end,
    p_key,
    jsonb_build_object('cascaded', coalesce(v_dependants, '{}'::text[]))
  );

  return p_enabled;
end;
$$;

create or replace function public.set_plugin_rollout(
  p_key     text,
  p_percent integer,
  p_audience text default null
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('plugins.write');

  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'A rollout is a percentage between 0 and 100' using errcode = '22023';
  end if;

  update public.feature_flags
  set rollout_percent = p_percent,
      audience = coalesce(p_audience, audience),
      updated_by = bsdc.current_uid()
  where key = p_key;

  if not found then
    raise exception 'No such plugin: %', p_key using errcode = 'P0002';
  end if;

  perform bsdc.audit('plugin.rollout', p_key,
    jsonb_build_object('percent', p_percent, 'audience', p_audience));

  return p_percent;
end;
$$;

-- ---------------------------------------------------------------------------
-- People: roles and account status
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(
  p_uid  text,
  p_role bsdc_role
)
returns bsdc_role
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_actor     text := bsdc.current_uid();
  v_actor_rank integer;
  v_target    public.profiles%rowtype;
begin
  perform bsdc.require_permission('people.role');

  if p_uid = v_actor then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  v_actor_rank := bsdc.role_rank(bsdc.actor_role());

  select * into v_target from public.profiles where uid = p_uid for update;
  if not found then
    raise exception 'No such member' using errcode = 'P0002';
  end if;

  -- You may not grant a rank at or above your own, and you may not touch
  -- somebody who already outranks you.
  if bsdc.role_rank(p_role) >= v_actor_rank or bsdc.role_rank(v_target.role) >= v_actor_rank then
    raise exception 'That role is above your own' using errcode = '42501';
  end if;

  -- The platform must always have an owner.
  if v_target.role = 'owner' and (
    select count(*) from public.profiles where role = 'owner'
  ) <= 1 then
    raise exception 'The last owner cannot be demoted' using errcode = '22023';
  end if;

  update public.profiles set role = p_role where uid = p_uid;

  perform bsdc.audit('people.role', p_uid,
    jsonb_build_object('from', v_target.role, 'to', p_role));

  return p_role;
end;
$$;

create or replace function public.set_account_status(
  p_uid    text,
  p_status bsdc_account_status,
  p_reason text default ''
)
returns bsdc_account_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_actor      text := bsdc.current_uid();
  v_actor_rank integer := bsdc.role_rank(bsdc.actor_role());
  v_target     public.profiles%rowtype;
begin
  perform bsdc.require_permission('people.suspend');

  if p_uid = v_actor then
    raise exception 'You cannot change your own account status' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where uid = p_uid for update;
  if not found then
    raise exception 'No such member' using errcode = 'P0002';
  end if;
  if bsdc.role_rank(v_target.role) >= v_actor_rank then
    raise exception 'That member outranks you' using errcode = '42501';
  end if;

  update public.profiles set status = p_status where uid = p_uid;

  insert into public.moderation_actions (actor_uid, subject_type, subject_id, action, reason)
  values (
    v_actor, 'account', p_uid,
    case when p_status = 'active' then 'restore_account' else 'suspend_account' end,
    coalesce(p_reason, '')
  );

  perform bsdc.audit('people.status', p_uid,
    jsonb_build_object('status', p_status, 'reason', coalesce(p_reason, '')));

  return p_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation queue
-- ---------------------------------------------------------------------------
create or replace function public.moderation_queue(
  p_status text default 'open',
  p_limit  integer default 50
)
returns table (
  id           uuid,
  subject_type text,
  subject_id   text,
  reason       text,
  details      text,
  status       bsdc_report_status,
  reporter_uid text,
  assigned_to  text,
  resolution   text,
  report_count integer,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    r.id, r.subject_type, r.subject_id, r.reason, r.details, r.status,
    r.reporter_uid, r.assigned_to, r.resolution,
    (select count(*)::integer from public.reports o
     where o.subject_type = r.subject_type and o.subject_id = r.subject_id),
    r.created_at
  from public.reports r
  where bsdc.has_permission('moderation.read')
    and (p_status = 'all' or r.status::text = p_status)
  order by r.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.claim_report(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_actor    text := bsdc.current_uid();
  v_assigned text;
begin
  perform bsdc.require_permission('moderation.resolve');

  select assigned_to into v_assigned from public.reports
  where id = p_report_id for update;

  if not found then
    raise exception 'No such report' using errcode = 'P0002';
  end if;
  -- Two moderators cannot both own a report; the first to claim it keeps it
  -- until they release it.
  if v_assigned is not null and v_assigned <> v_actor then
    raise exception 'Another moderator is already handling this' using errcode = '22023';
  end if;

  update public.reports set assigned_to = v_actor where id = p_report_id;
  perform bsdc.audit('moderation.claim', p_report_id::text);

  return v_actor;
end;
$$;

create or replace function public.resolve_report(
  p_report_id uuid,
  p_action    text,
  p_reason    text default ''
)
returns bsdc_report_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_actor  text := bsdc.current_uid();
  v_report public.reports%rowtype;
  v_status bsdc_report_status;
begin
  perform bsdc.require_permission('moderation.resolve');

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'No such report' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception 'That report has already been handled' using errcode = '22023';
  end if;
  if v_report.assigned_to is not null and v_report.assigned_to <> v_actor then
    raise exception 'Another moderator is handling this' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'warn', 'hide_content', 'restore_content') then
    raise exception 'Unknown moderation action' using errcode = '22023';
  end if;
  if p_action in ('hide_content', 'restore_content')
     and not bsdc.has_permission('content.hide') then
    raise exception 'Permission content.hide is required' using errcode = '42501';
  end if;

  -- Hiding a post is done here, in the same transaction that records why,
  -- so a hidden post always has a reason attached to it.
  if p_action = 'hide_content' and v_report.subject_type = 'post' then
    update public.posts set status = 'removed'
    where id = v_report.subject_id::uuid;
  elsif p_action = 'restore_content' and v_report.subject_type = 'post' then
    update public.posts set status = 'published'
    where id = v_report.subject_id::uuid;
  end if;

  v_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;

  update public.reports
  set status = v_status,
      handled_by = v_actor,
      handled_at = now(),
      assigned_to = v_actor,
      resolution = coalesce(p_reason, '')
  where id = p_report_id;

  insert into public.moderation_actions
    (actor_uid, report_id, subject_type, subject_id, action, reason)
  values
    (v_actor, p_report_id, v_report.subject_type, v_report.subject_id, p_action,
     coalesce(p_reason, ''));

  perform bsdc.audit('moderation.resolve', p_report_id::text,
    jsonb_build_object('action', p_action, 'status', v_status));

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns table (
  members_total     integer,
  members_today     integer,
  posts_total       integer,
  posts_today       integer,
  open_reports      integer,
  shops_pending     integer,
  campaigns_pending integer,
  plugins_enabled   integer,
  plugins_total     integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    (select count(*)::integer from public.profiles),
    (select count(*)::integer from public.profiles where created_at >= current_date),
    (select count(*)::integer from public.posts),
    (select count(*)::integer from public.posts where created_at >= current_date),
    (select count(*)::integer from public.reports where status = 'open'),
    (select count(*)::integer from public.shops where status = 'pending'),
    (select count(*)::integer from public.ad_campaigns where status = 'pending_review'),
    (select count(*)::integer from public.feature_flags where enabled),
    (select count(*)::integer from public.feature_flags)
  where bsdc.has_permission('moderation.read');
$$;

create or replace function public.admin_people(
  p_search text default '',
  p_limit  integer default 50
)
returns table (
  uid          text,
  username     text,
  display_name text,
  role         bsdc_role,
  status       bsdc_account_status,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select p.uid, p.username::text, p.display_name, p.role, p.status, p.created_at
  from public.profiles p
  where bsdc.has_permission('people.read')
    and (
      coalesce(btrim(p_search), '') = ''
      or p.username::text ilike '%' || btrim(p_search) || '%'
      or p.display_name ilike '%' || btrim(p_search) || '%'
    )
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.admin_audit(p_limit integer default 100)
returns table (
  id         bigint,
  actor_uid  text,
  action     text,
  subject    text,
  metadata   jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select a.id, a.actor_uid, a.action, a.subject, a.metadata, a.created_at
  from public.audit_log a
  where bsdc.has_permission('audit.read')
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(
    array(
      select r.permission from public.role_permissions r
      where r.role = bsdc.actor_role()
      order by r.permission
    ),
    '{}'::text[]
  );
$$;

create or replace function public.set_admin_setting(
  p_key   text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('settings.write');

  update public.admin_settings
  set value = p_value, updated_by = bsdc.current_uid()
  where key = p_key;

  if not found then
    raise exception 'No such setting: %', p_key using errcode = 'P0002';
  end if;

  perform bsdc.audit('settings.write', p_key, jsonb_build_object('value', p_value));
  return p_value;
end;
$$;
