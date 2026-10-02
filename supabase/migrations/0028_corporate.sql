-- ---------------------------------------------------------------------------
-- The corporate network, part one.
--
-- Seven staff applications share this schema: site configuration, the page
-- customiser, staff records and ID cards, IP intelligence, the public status
-- page and the corporate chat directory.
--
-- The rules kept by Postgres rather than by any of those seven screens:
--   1. Configuration is typed and versioned. A value is validated against the
--      type declared for its key, and every change writes the old value to an
--      append-only history, so any setting can be explained and reverted.
--   2. An ordered list is ordered by the database. Section positions are
--      renumbered inside the move, so two editors cannot produce a page with
--      two section threes.
--   3. An IP decision is one function. Allowlist mode, expiry and the most
--      specific matching range are resolved in SQL, so every app that asks
--      gets the same answer.
--   4. Uptime is computed from recorded checks, never stored as a number
--      somebody can type.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_config_type') then
    create type bsdc_config_type as enum ('string', 'number', 'boolean', 'json', 'color', 'date');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_section_kind') then
    create type bsdc_section_kind as enum (
      'hero', 'rich_text', 'cards', 'faq', 'cta', 'gallery', 'embed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_page_status') then
    create type bsdc_page_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_ip_rule_kind') then
    create type bsdc_ip_rule_kind as enum ('block', 'allow', 'watch');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_service_state') then
    create type bsdc_service_state as enum ('operational', 'degraded', 'partial', 'down', 'maintenance');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_incident_impact') then
    create type bsdc_incident_impact as enum ('none', 'minor', 'major', 'critical');
  end if;
end;
$$;

-- ===========================================================================
-- 1. Site configuration (config-site)
-- ===========================================================================
create table if not exists public.site_config (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{2,60}$'),
  value       jsonb not null,
  value_type  bsdc_config_type not null default 'string',
  group_name  text not null default 'general' check (char_length(group_name) between 2 and 40),
  label       text not null default '',
  help        text not null default '' check (char_length(help) <= 300),
  -- Numeric guards, used by the editor and re-checked by the setter.
  min_value   numeric,
  max_value   numeric,
  options     text[] not null default '{}',
  is_public   boolean not null default false,
  sort_order  integer not null default 100,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create index if not exists site_config_group_idx on public.site_config (group_name, sort_order);

drop trigger if exists site_config_touch on public.site_config;
create trigger site_config_touch before update on public.site_config
  for each row execute function bsdc.touch_updated_at();

-- Append only. A configuration change is a decision and keeps its record.
create table if not exists public.site_config_history (
  id          bigserial primary key,
  key         text not null,
  old_value   jsonb,
  new_value   jsonb not null,
  changed_by  text,
  changed_at  timestamptz not null default now()
);

create index if not exists site_config_history_key_idx
  on public.site_config_history (key, changed_at desc);

insert into public.site_config
  (key, value, value_type, group_name, label, help, min_value, max_value, is_public, sort_order)
values
  ('site.launch_date', '"2026-03-26"'::jsonb, 'date', 'launch', 'Launch date', 'Shown on the countdown.', null, null, true, 10),
  ('site.launched', 'false'::jsonb, 'boolean', 'launch', 'Launched', 'Switches the countdown off.', null, null, true, 20),
  ('site.default_language', '"bn"'::jsonb, 'string', 'general', 'Default language', 'bn or en.', null, null, true, 30),
  ('site.default_theme', '"light"'::jsonb, 'string', 'general', 'Default theme', 'light or dark.', null, null, true, 40),
  ('feed.recency_weight', '0.35'::jsonb, 'number', 'feed', 'Recency weight', 'Share of the ranking score from freshness.', 0, 1, false, 110),
  ('feed.affinity_weight', '0.35'::jsonb, 'number', 'feed', 'Affinity weight', 'Share from the relationship with the author.', 0, 1, false, 120),
  ('feed.quality_weight', '0.30'::jsonb, 'number', 'feed', 'Quality weight', 'Share from engagement quality.', 0, 1, false, 130),
  ('feed.trending_half_life_hours', '18'::jsonb, 'number', 'feed', 'Trending half-life (hours)', 'How quickly trending decays.', 1, 168, false, 140),
  ('market.commission_bps', '500'::jsonb, 'number', 'market', 'Default commission (bps)', 'Applied to new shops.', 0, 3000, false, 210),
  ('market.free_shipping_over', '200000'::jsonb, 'number', 'market', 'Free shipping over (poisha)', 'Platform suggestion for new shops.', 0, 100000000, false, 220),
  ('ads.min_bid', '100'::jsonb, 'number', 'ads', 'Minimum bid (poisha)', 'Floor for every campaign.', 10, 10000000, false, 310),
  ('ops.maintenance', 'false'::jsonb, 'boolean', 'ops', 'Maintenance mode', 'Shows the maintenance page to members.', null, null, true, 410),
  ('ops.registration_open', 'true'::jsonb, 'boolean', 'ops', 'Registration open', 'Allows new sign-ups.', null, null, true, 420),
  ('ops.ip_allowlist_only', 'false'::jsonb, 'boolean', 'ops', 'Allowlist mode', 'Only allowlisted ranges may write.', null, null, false, 430)
on conflict (key) do nothing;

-- The type declared for a key is the type the value must have. A screen that
-- sends a string where a number belongs is refused, not coerced.
create or replace function bsdc.config_value_valid(
  p_type  bsdc_config_type,
  p_value jsonb,
  p_min   numeric,
  p_max   numeric
)
returns boolean
language sql
immutable
as $$
  select case p_type
    when 'boolean' then jsonb_typeof(p_value) = 'boolean'
    when 'number'  then jsonb_typeof(p_value) = 'number'
      and (p_min is null or (p_value)::numeric >= p_min)
      and (p_max is null or (p_value)::numeric <= p_max)
    when 'json'    then jsonb_typeof(p_value) in ('object', 'array')
    when 'date'    then jsonb_typeof(p_value) = 'string'
      and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
    when 'color'   then jsonb_typeof(p_value) = 'string'
      and (p_value #>> '{}') ~* '^#[0-9a-f]{6}$'
    else jsonb_typeof(p_value) = 'string'
  end;
$$;

create or replace function public.set_site_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_row public.site_config%rowtype;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_row from public.site_config where key = p_key for update;
  if not found then
    raise exception 'No such configuration key: %', p_key using errcode = 'P0002';
  end if;

  if not bsdc.config_value_valid(v_row.value_type, p_value, v_row.min_value, v_row.max_value) then
    raise exception 'Value does not match the % type declared for %', v_row.value_type, p_key
      using errcode = '22023';
  end if;
  if cardinality(v_row.options) > 0
     and not ((p_value #>> '{}') = any (v_row.options)) then
    raise exception 'Value must be one of: %', array_to_string(v_row.options, ', ')
      using errcode = '22023';
  end if;

  insert into public.site_config_history (key, old_value, new_value, changed_by)
  values (p_key, v_row.value, p_value, bsdc.current_uid());

  update public.site_config
  set value = p_value, updated_by = bsdc.current_uid()
  where key = p_key;

  perform bsdc.audit('config.write', p_key,
    jsonb_build_object('from', v_row.value, 'to', p_value));

  return p_value;
end;
$$;

-- Reverting is a forward change, recorded like any other, never a deletion
-- of the history that explains it.
create or replace function public.revert_site_config(p_history_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_entry public.site_config_history%rowtype;
begin
  perform bsdc.require_permission('settings.write');

  select * into v_entry from public.site_config_history where id = p_history_id;
  if not found or v_entry.old_value is null then
    raise exception 'Nothing to revert to' using errcode = 'P0002';
  end if;

  return public.set_site_config(v_entry.key, v_entry.old_value);
end;
$$;

create or replace function public.site_config_list()
returns setof public.site_config
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select * from public.site_config
  where is_public or bsdc.has_permission('settings.read')
  order by group_name, sort_order, key;
$$;

create or replace function public.site_config_history_for(p_key text, p_limit integer default 20)
returns table (id bigint, old_value jsonb, new_value jsonb, changed_by text, changed_at timestamptz)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select h.id, h.old_value, h.new_value, h.changed_by, h.changed_at
  from public.site_config_history h
  where h.key = p_key and bsdc.has_permission('settings.read')
  order by h.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- ===========================================================================
-- 2. Custom pages and sections (customize-site)
-- ===========================================================================
create table if not exists public.custom_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  title        text not null check (char_length(btrim(title)) between 2 and 120),
  description  text not null default '' check (char_length(description) <= 300),
  status       bsdc_page_status not null default 'draft',
  noindex      boolean not null default false,
  updated_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists custom_pages_touch on public.custom_pages;
create trigger custom_pages_touch before update on public.custom_pages
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.page_sections (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.custom_pages (id) on delete cascade,
  kind       bsdc_section_kind not null,
  "position" integer not null check ("position" >= 0),
  payload    jsonb not null default '{}'::jsonb,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_sections_page_idx on public.page_sections (page_id, "position");

drop trigger if exists page_sections_touch on public.page_sections;
create trigger page_sections_touch before update on public.page_sections
  for each row execute function bsdc.touch_updated_at();

-- Moving a section renumbers the whole page under a lock, so the order is
-- always 0..n-1 with no duplicates and no gaps, whoever is editing.
create or replace function public.move_page_section(p_section_id uuid, p_to integer)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_page uuid;
  v_from integer;
  v_count integer;
  v_to integer;
begin
  perform bsdc.require_permission('settings.write');

  select page_id, "position" into v_page, v_from
  from public.page_sections where id = p_section_id;
  if v_page is null then
    raise exception 'No such section' using errcode = 'P0002';
  end if;

  perform 1 from public.custom_pages where id = v_page for update;

  select count(*)::integer into v_count from public.page_sections where page_id = v_page;
  v_to := greatest(0, least(coalesce(p_to, 0), v_count - 1));

  if v_to = v_from then
    return v_from;
  end if;

  -- Park the row outside the range, shift the block, then land it.
  update public.page_sections set "position" = -1 where id = p_section_id;

  if v_to < v_from then
    update public.page_sections
    set "position" = "position" + 1
    where page_id = v_page and "position" >= v_to and "position" < v_from;
  else
    update public.page_sections
    set "position" = "position" - 1
    where page_id = v_page and "position" > v_from and "position" <= v_to;
  end if;

  update public.page_sections set "position" = v_to where id = p_section_id;

  perform bsdc.audit('page.move_section', p_section_id::text,
    jsonb_build_object('from', v_from, 'to', v_to));

  return v_to;
end;
$$;

create or replace function public.add_page_section(
  p_page_id uuid,
  p_kind    bsdc_section_kind,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_id uuid;
  v_next integer;
begin
  perform bsdc.require_permission('settings.write');

  perform 1 from public.custom_pages where id = p_page_id for update;
  select coalesce(max("position") + 1, 0) into v_next
  from public.page_sections where page_id = p_page_id;

  insert into public.page_sections (page_id, kind, "position", payload)
  values (p_page_id, p_kind, v_next, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  perform bsdc.audit('page.add_section', v_id::text, jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;

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
set search_path = public, bsdc, pg_temp
as $$
  select
    p.id, p.slug::text, p.title, p.description, p.noindex,
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', s.kind, 'payload', s.payload)
                       order by s.position)
      from public.page_sections s
      where s.page_id = p.id and s.is_visible
    ), '[]'::jsonb)
  from public.custom_pages p
  where p.slug = p_slug
    and (p.status = 'published' or bsdc.has_permission('settings.read'));
$$;

-- ===========================================================================
-- 3. Staff records and ID cards (users-admin-site, users-moderator-site)
-- ===========================================================================
create table if not exists public.staff_records (
  uid           text primary key references public.profiles (uid) on delete cascade,
  staff_no      text not null unique check (staff_no ~ '^BSDC-[A-Z]{2}-[0-9]{4}$'),
  department    text not null default '' check (char_length(department) <= 60),
  designation   text not null default '' check (char_length(designation) <= 60),
  work_email    text not null default '' check (char_length(work_email) <= 120),
  phone         text not null default '' check (char_length(phone) <= 30),
  shift         text not null default 'general'
                  check (shift in ('general', 'morning', 'evening', 'night')),
  cv_url        text not null default '' check (char_length(cv_url) <= 500),
  joined_at     date not null default current_date,
  ended_at      date,
  -- The card code is what the public verification portal will check.
  card_code     text unique check (card_code ~ '^BSDC-ID-[0-9A-Z]{8}-[0-9]$'),
  card_issued_at timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint staff_records_period check (ended_at is null or ended_at >= joined_at)
);

drop trigger if exists staff_records_touch on public.staff_records;
create trigger staff_records_touch before update on public.staff_records
  for each row execute function bsdc.touch_updated_at();

-- A card code carries a check digit, so a mistyped code is rejected before
-- the database is ever asked about it.
create or replace function bsdc.card_check_digit(p_body text)
returns integer
language sql
immutable
as $$
  select (sum(
    case
      when substr(p_body, i, 1) ~ '[0-9]' then substr(p_body, i, 1)::integer
      else ascii(substr(p_body, i, 1)) - 55
    end * (case when i % 2 = 0 then 3 else 1 end)
  ) % 10)::integer
  from generate_series(1, char_length(p_body)) i;
$$;

create or replace function public.issue_staff_card(p_uid text)
returns text
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_body text;
  v_code text;
  v_try  integer := 0;
begin
  perform bsdc.require_permission('people.role');

  if not exists (select 1 from public.staff_records where uid = p_uid and is_active) then
    raise exception 'No active staff record for that member' using errcode = 'P0002';
  end if;

  loop
    v_try := v_try + 1;
    v_body := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
    v_body := translate(v_body, 'OI', '48');
    v_code := 'BSDC-ID-' || v_body || '-' || bsdc.card_check_digit(v_body)::text;
    exit when not exists (select 1 from public.staff_records where card_code = v_code);
    if v_try > 10 then
      raise exception 'Could not allocate a card code' using errcode = '55000';
    end if;
  end loop;

  update public.staff_records
  set card_code = v_code, card_issued_at = now()
  where uid = p_uid;

  perform bsdc.audit('staff.card', p_uid, jsonb_build_object('code', v_code));
  return v_code;
end;
$$;

create or replace function public.upsert_staff_record(
  p_uid         text,
  p_staff_no    text,
  p_department  text default '',
  p_designation text default '',
  p_work_email  text default '',
  p_phone       text default '',
  p_shift       text default 'general',
  p_cv_url      text default ''
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_role bsdc_role;
begin
  perform bsdc.require_permission('people.role');

  select role into v_role from public.profiles where uid = p_uid;
  if v_role is null then
    raise exception 'No such member' using errcode = 'P0002';
  end if;
  -- A staff record is for staff. It cannot be used to quietly make somebody
  -- look like staff who is not.
  if bsdc.role_rank(v_role) < bsdc.role_rank('moderator') then
    raise exception 'That member does not hold a staff role' using errcode = '22023';
  end if;
  if bsdc.role_rank(v_role) >= bsdc.role_rank(bsdc.actor_role()) then
    raise exception 'That member outranks you' using errcode = '42501';
  end if;

  insert into public.staff_records
    (uid, staff_no, department, designation, work_email, phone, shift, cv_url)
  values
    (p_uid, upper(btrim(p_staff_no)), coalesce(p_department, ''), coalesce(p_designation, ''),
     coalesce(p_work_email, ''), coalesce(p_phone, ''), coalesce(p_shift, 'general'),
     coalesce(p_cv_url, ''))
  on conflict (uid) do update
  set staff_no = excluded.staff_no,
      department = excluded.department,
      designation = excluded.designation,
      work_email = excluded.work_email,
      phone = excluded.phone,
      shift = excluded.shift,
      cv_url = excluded.cv_url;

  perform bsdc.audit('staff.record', p_uid, jsonb_build_object('staff_no', p_staff_no));
  return p_uid;
end;
$$;

create or replace function public.staff_directory(p_role text default 'all')
returns table (
  uid            text,
  display_name   text,
  username       text,
  role           bsdc_role,
  staff_no       text,
  department     text,
  designation    text,
  shift          text,
  card_code      text,
  joined_at      date,
  is_active      boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    s.uid, p.display_name, p.username::text, p.role, s.staff_no, s.department,
    s.designation, s.shift, s.card_code, s.joined_at, s.is_active
  from public.staff_records s
  join public.profiles p on p.uid = s.uid
  where bsdc.has_permission('people.read')
    and (p_role = 'all' or p.role::text = p_role)
  order by s.staff_no;
$$;

-- ===========================================================================
-- 4. IP intelligence (ip-site)
-- ===========================================================================
create table if not exists public.ip_rules (
  id         uuid primary key default gen_random_uuid(),
  range      cidr not null,
  kind       bsdc_ip_rule_kind not null default 'block',
  reason     text not null default '' check (char_length(reason) <= 300),
  expires_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  unique (range, kind)
);

create index if not exists ip_rules_range_idx on public.ip_rules using gist (range inet_ops);

create table if not exists public.ip_events (
  id         bigserial primary key,
  ip         inet not null,
  uid        text references public.profiles (uid) on delete set null,
  action     text not null check (char_length(action) between 2 and 60),
  created_at timestamptz not null default now()
);

create index if not exists ip_events_ip_idx on public.ip_events (ip, created_at desc);
create index if not exists ip_events_time_idx on public.ip_events (created_at desc);

-- One function answers the question for every app: the most specific rule
-- that has not expired wins, an allow beats a block at the same specificity,
-- and allowlist mode turns the absence of a rule into a refusal.
create or replace function public.ip_decision(p_ip inet)
returns table (decision text, matched cidr, reason text)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with best as (
    select r.kind, r.range, r.reason
    from public.ip_rules r
    where r.range >>= p_ip
      and (r.expires_at is null or r.expires_at > now())
      and r.kind in ('block', 'allow')
    order by masklen(r.range) desc, (r.kind = 'allow') desc
    limit 1
  ),
  mode as (
    select coalesce((select (value)::boolean from public.site_config
                     where key = 'ops.ip_allowlist_only'), false) as allowlist_only
  )
  select
    case
      when (select kind from best) = 'block' then 'block'
      when (select kind from best) = 'allow' then 'allow'
      when (select allowlist_only from mode) then 'block'
      else 'allow'
    end,
    (select range from best),
    coalesce((select reason from best), '');
$$;

-- Velocity: how many distinct accounts an address touched, and how often.
create or replace function public.ip_activity(p_hours integer default 24, p_limit integer default 50)
returns table (
  ip          inet,
  hits        integer,
  accounts    integer,
  last_seen   timestamptz,
  decision    text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    e.ip,
    count(*)::integer,
    count(distinct e.uid)::integer,
    max(e.created_at),
    (select d.decision from public.ip_decision(e.ip) d)
  from public.ip_events e
  where bsdc.has_permission('people.suspend')
    and e.created_at >= now() - (greatest(1, least(coalesce(p_hours, 24), 720)) || ' hours')::interval
  group by e.ip
  order by count(*) desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.set_ip_rule(
  p_range   cidr,
  p_kind    bsdc_ip_rule_kind,
  p_reason  text default '',
  p_hours   integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_id uuid;
begin
  perform bsdc.require_permission('people.suspend');

  insert into public.ip_rules (range, kind, reason, expires_at, created_by)
  values (
    p_range, p_kind, coalesce(p_reason, ''),
    case when p_hours is null then null else now() + (p_hours || ' hours')::interval end,
    bsdc.current_uid()
  )
  on conflict (range, kind) do update
  set reason = excluded.reason, expires_at = excluded.expires_at
  returning id into v_id;

  perform bsdc.audit('ip.rule', host(p_range),
    jsonb_build_object('kind', p_kind, 'hours', p_hours));
  return v_id;
end;
$$;

create or replace function public.drop_ip_rule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('people.suspend');
  delete from public.ip_rules where id = p_id;
  perform bsdc.audit('ip.unblock', p_id::text);
end;
$$;

-- ===========================================================================
-- 5. Status and incidents (status-site)
-- ===========================================================================
create table if not exists public.services (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.-]{2,40}$'),
  name         text not null,
  category     text not null default 'app',
  state        bsdc_service_state not null default 'operational',
  url          text not null default '',
  sort_order   integer not null default 100,
  updated_at   timestamptz not null default now()
);

drop trigger if exists services_touch on public.services;
create trigger services_touch before update on public.services
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.service_checks (
  id         bigserial primary key,
  service_key text not null references public.services (key) on delete cascade,
  day        date not null default current_date,
  ok_count   integer not null default 0 check (ok_count >= 0),
  fail_count integer not null default 0 check (fail_count >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  unique (service_key, day)
);

create table if not exists public.incidents (
  id          uuid primary key default gen_random_uuid(),
  service_key text references public.services (key) on delete set null,
  title       text not null check (char_length(btrim(title)) between 4 and 160),
  impact      bsdc_incident_impact not null default 'minor',
  started_at  timestamptz not null default now(),
  resolved_at timestamptz,
  created_by  text,
  constraint incidents_period check (resolved_at is null or resolved_at >= started_at)
);

create index if not exists incidents_open_idx on public.incidents (started_at desc)
  where resolved_at is null;

create table if not exists public.incident_updates (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 2 and 1000),
  state       bsdc_service_state not null default 'degraded',
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists incident_updates_incident_idx
  on public.incident_updates (incident_id, created_at);

insert into public.services (key, name, category, url, sort_order) values
  ('main-site', 'Main site', 'app', 'https://www.bsdc.info.bd', 10),
  ('vf-site', 'Verification portal', 'app', 'https://vf.main.bsdc.info.bd', 20),
  ('admin-site', 'Admin panel', 'app', '', 30),
  ('supabase', 'Supabase Postgres', 'dependency', '', 110),
  ('firebase-main', 'Firebase bsdc-bd', 'dependency', '', 120),
  ('firebase-corporate', 'Firebase bsdc-second', 'dependency', '', 130),
  ('cloudinary', 'Cloudinary', 'dependency', '', 140),
  ('imgbb', 'imgbb', 'dependency', '', 150)
on conflict (key) do nothing;

-- Uptime is derived from the checks that were recorded. Nobody types it.
create or replace function public.service_uptime(p_days integer default 90)
returns table (
  service_key text,
  name        text,
  category    text,
  state       bsdc_service_state,
  uptime_pct  numeric,
  avg_latency integer,
  open_incident boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    s.key, s.name, s.category, s.state,
    coalesce(round(
      100.0 * sum(c.ok_count) / nullif(sum(c.ok_count + c.fail_count), 0), 3
    ), 100.000) as uptime_pct,
    coalesce(round(avg(nullif(c.latency_ms, 0)))::integer, 0),
    exists (
      select 1 from public.incidents i
      where i.service_key = s.key and i.resolved_at is null
    )
  from public.services s
  left join public.service_checks c
    on c.service_key = s.key
   and c.day >= current_date - greatest(1, least(coalesce(p_days, 90), 365))
  group by s.key, s.name, s.category, s.state, s.sort_order
  order by s.sort_order, s.key;
$$;

create or replace function public.record_service_check(
  p_service_key text,
  p_ok          boolean,
  p_latency_ms  integer default 0
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.require_permission('settings.write');

  insert into public.service_checks (service_key, day, ok_count, fail_count, latency_ms)
  values (
    p_service_key, current_date,
    case when p_ok then 1 else 0 end,
    case when p_ok then 0 else 1 end,
    greatest(0, coalesce(p_latency_ms, 0))
  )
  on conflict (service_key, day) do update
  set ok_count = public.service_checks.ok_count + excluded.ok_count,
      fail_count = public.service_checks.fail_count + excluded.fail_count,
      -- A running average kept as an integer; no float, no drift.
      latency_ms = case
        when excluded.latency_ms = 0 then public.service_checks.latency_ms
        else (public.service_checks.latency_ms + excluded.latency_ms) / 2
      end;
end;
$$;

create or replace function public.open_incident(
  p_service_key text,
  p_title       text,
  p_impact      bsdc_incident_impact,
  p_body        text
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_id uuid;
begin
  perform bsdc.require_permission('settings.write');

  insert into public.incidents (service_key, title, impact, created_by)
  values (p_service_key, btrim(p_title), p_impact, bsdc.current_uid())
  returning id into v_id;

  insert into public.incident_updates (incident_id, body, state, created_by)
  values (v_id, btrim(p_body), 'degraded', bsdc.current_uid());

  update public.services
  set state = case p_impact
    when 'critical' then 'down'
    when 'major' then 'partial'
    else 'degraded'
  end
  where key = p_service_key;

  perform bsdc.audit('status.incident', v_id::text, jsonb_build_object('impact', p_impact));
  return v_id;
end;
$$;

create or replace function public.resolve_incident(p_incident_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_service text;
begin
  perform bsdc.require_permission('settings.write');

  update public.incidents set resolved_at = now()
  where id = p_incident_id and resolved_at is null
  returning service_key into v_service;

  if v_service is null then
    raise exception 'That incident is already resolved' using errcode = '22023';
  end if;

  insert into public.incident_updates (incident_id, body, state, created_by)
  values (p_incident_id, btrim(p_body), 'operational', bsdc.current_uid());

  -- The service only returns to operational when nothing else is open on it.
  update public.services s
  set state = 'operational'
  where s.key = v_service
    and not exists (
      select 1 from public.incidents i
      where i.service_key = s.key and i.resolved_at is null
    );

  perform bsdc.audit('status.resolve', p_incident_id::text);
end;
$$;

create or replace function public.status_incidents(p_limit integer default 20)
returns table (
  id          uuid,
  service_key text,
  title       text,
  impact      bsdc_incident_impact,
  started_at  timestamptz,
  resolved_at timestamptz,
  updates     jsonb
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    i.id, i.service_key, i.title, i.impact, i.started_at, i.resolved_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'body', u.body, 'state', u.state, 'created_at', u.created_at)
               order by u.created_at)
      from public.incident_updates u where u.incident_id = i.id
    ), '[]'::jsonb)
  from public.incidents i
  order by i.started_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- ===========================================================================
-- 6. Corporate chat directory (connect-site)
-- Messages live in the bsdc-second Realtime Database; membership lives here,
-- so who may read a channel is an auditable row and not a client decision.
-- ===========================================================================
create table if not exists public.corporate_channels (
  id          uuid primary key default gen_random_uuid(),
  slug        citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  topic       text not null default '' check (char_length(topic) <= 200),
  is_private  boolean not null default false,
  min_role    bsdc_role not null default 'moderator',
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.corporate_channels (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  added_by   text,
  added_at   timestamptz not null default now(),
  primary key (channel_id, uid)
);

insert into public.corporate_channels (slug, name, topic, min_role) values
  ('general', 'General', 'Everything that does not belong anywhere else', 'moderator'),
  ('moderation', 'Moderation', 'Queue handovers and difficult calls', 'moderator'),
  ('incidents', 'Incidents', 'Live incident coordination', 'manager'),
  ('finance', 'Finance', 'Payouts, invoices and reconciliation', 'admin')
on conflict (slug) do nothing;

create or replace function public.my_channels()
returns table (
  id         uuid,
  slug       text,
  name       text,
  topic      text,
  is_private boolean,
  member_count integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    c.id, c.slug::text, c.name, c.topic, c.is_private,
    (select count(*)::integer from public.channel_members m where m.channel_id = c.id)
  from public.corporate_channels c
  where bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank(c.min_role)
    and (
      not c.is_private
      or exists (
        select 1 from public.channel_members m
        where m.channel_id = c.id and m.uid = bsdc.current_uid()
      )
    )
  order by c.slug;
$$;

-- ===========================================================================
-- 7. Permissions for the corporate apps
-- ===========================================================================
insert into public.role_permissions (role, permission) values
  ('moderator', 'corporate.chat'),
  ('manager', 'corporate.chat'),
  ('manager', 'status.write'),
  ('admin', 'corporate.chat'),
  ('admin', 'status.write'),
  ('owner', 'corporate.chat'),
  ('owner', 'status.write')
on conflict do nothing;
