-- ---------------------------------------------------------------------------
-- Communities: groups, channels, pages and events.
--
-- A group is a membership space with channels inside it. A page is a public
-- presence a member or organisation maintains, with followers rather than
-- members. An event belongs either to a group, to a page, or to nobody, and
-- collects RSVPs. Posts gain an optional home: a channel.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_group_privacy') then
    create type bsdc_group_privacy as enum ('public', 'private', 'secret');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_group_role') then
    create type bsdc_group_role as enum ('owner', 'admin', 'moderator', 'member');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_join_status') then
    create type bsdc_join_status as enum ('pending', 'approved', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_rsvp_status') then
    create type bsdc_rsvp_status as enum ('going', 'interested', 'declined');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_event_mode') then
    create type bsdc_event_mode as enum ('online', 'in_person', 'hybrid');
  end if;
end;
$$;

-- ------------------------------- groups ------------------------------------
create table if not exists public.groups (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  name          text not null check (char_length(btrim(name)) between 3 and 80),
  description   text not null default '' check (char_length(description) <= 2000),
  privacy       bsdc_group_privacy not null default 'public',
  avatar_url    text not null default '',
  cover_url     text not null default '',
  language      text not null default 'bn' check (language in ('bn', 'en')),
  rules         text not null default '' check (char_length(rules) <= 4000),
  owner_uid     text not null references public.profiles (uid) on delete cascade,
  members_count integer not null default 0 check (members_count >= 0),
  posts_count   integer not null default 0 check (posts_count >= 0),
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists groups_privacy_idx on public.groups (privacy, members_count desc);

drop trigger if exists groups_touch on public.groups;
create trigger groups_touch before update on public.groups
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  role       bsdc_group_role not null default 'member',
  joined_at  timestamptz not null default now(),
  muted_until timestamptz,
  primary key (group_id, uid)
);

create index if not exists group_members_uid_idx on public.group_members (uid);

create table if not exists public.group_join_requests (
  group_id   uuid not null references public.groups (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  status     bsdc_join_status not null default 'pending',
  message    text not null default '' check (char_length(message) <= 500),
  decided_by text references public.profiles (uid) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (group_id, uid)
);

create or replace function bsdc.sync_group_member_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.groups set members_count = members_count + 1 where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update public.groups
      set members_count = greatest(members_count - 1, 0)
      where id = old.group_id;
  end if;
  return null;
end;
$$;

drop trigger if exists group_members_sync on public.group_members;
create trigger group_members_sync after insert or delete on public.group_members
  for each row execute function bsdc.sync_group_member_counts();

-- Membership and privilege tests used by every policy below.
create or replace function bsdc.is_group_member(p_group_id uuid, p_uid text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.uid = p_uid
  );
$$;

create or replace function bsdc.group_role(p_group_id uuid, p_uid text)
returns bsdc_group_role
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select gm.role from public.group_members gm
  where gm.group_id = p_group_id and gm.uid = p_uid;
$$;

create or replace function bsdc.can_moderate_group(p_group_id uuid, p_uid text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(
    bsdc.group_role(p_group_id, p_uid) in ('owner', 'admin', 'moderator'),
    false
  ) or bsdc.is_staff();
$$;

-- A secret group is invisible to outsiders; a private one is visible but its
-- content is not.
create or replace function bsdc.can_see_group(p_group_id uuid, p_privacy bsdc_group_privacy)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select p_privacy <> 'secret'
      or bsdc.is_group_member(p_group_id, bsdc.current_uid())
      or bsdc.is_staff();
$$;

-- ------------------------------ channels -----------------------------------
create table if not exists public.channels (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  slug          citext not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  topic         text not null default '' check (char_length(topic) <= 300),
  position      integer not null default 0,
  is_read_only  boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (group_id, slug)
);

create index if not exists channels_group_idx on public.channels (group_id, position);

-- A post may live in a channel; the column is nullable so the feed is
-- unaffected for ordinary posts.
alter table public.posts
  add column if not exists channel_id uuid references public.channels (id) on delete set null;

create index if not exists posts_channel_idx
  on public.posts (channel_id, published_at desc nulls last)
  where channel_id is not null;

-- ------------------------------- pages -------------------------------------
create table if not exists public.pages (
  id              uuid primary key default gen_random_uuid(),
  slug            citext not null unique
                    check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  category        text not null default 'community'
                    check (category in ('community', 'company', 'product', 'education', 'media', 'nonprofit')),
  about           text not null default '' check (char_length(about) <= 2000),
  avatar_url      text not null default '',
  cover_url       text not null default '',
  website         text not null default '',
  owner_uid       text not null references public.profiles (uid) on delete cascade,
  followers_count integer not null default 0 check (followers_count >= 0),
  is_verified     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists pages_touch on public.pages;
create trigger pages_touch before update on public.pages
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.page_followers (
  page_id    uuid not null references public.pages (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (page_id, uid)
);

create or replace function bsdc.sync_page_follower_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.pages set followers_count = followers_count + 1 where id = new.page_id;
  elsif tg_op = 'DELETE' then
    update public.pages
      set followers_count = greatest(followers_count - 1, 0)
      where id = old.page_id;
  end if;
  return null;
end;
$$;

drop trigger if exists page_followers_sync on public.page_followers;
create trigger page_followers_sync after insert or delete on public.page_followers
  for each row execute function bsdc.sync_page_follower_counts();

-- ------------------------------- events ------------------------------------
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title         text not null check (char_length(btrim(title)) between 3 and 140),
  description   text not null default '' check (char_length(description) <= 8000),
  mode          bsdc_event_mode not null default 'online',
  venue         text not null default '' check (char_length(venue) <= 200),
  city          text not null default '' check (char_length(city) <= 80),
  join_url      text not null default '',
  cover_url     text not null default '',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  timezone      text not null default 'Asia/Dhaka',
  capacity      integer check (capacity is null or capacity > 0),
  host_uid      text not null references public.profiles (uid) on delete cascade,
  group_id      uuid references public.groups (id) on delete cascade,
  page_id       uuid references public.pages (id) on delete cascade,
  going_count   integer not null default 0 check (going_count >= 0),
  is_cancelled  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_ends_after_start check (ends_at > starts_at),
  constraint events_online_has_url
    check (mode <> 'online' or char_length(join_url) >= 1),
  constraint events_in_person_has_venue
    check (mode <> 'in_person' or char_length(btrim(venue)) >= 1),
  constraint events_single_owner check (group_id is null or page_id is null)
);

create index if not exists events_upcoming_idx on public.events (starts_at)
  where not is_cancelled;
create index if not exists events_group_idx on public.events (group_id, starts_at);

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  status     bsdc_rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  primary key (event_id, uid)
);

-- going_count tracks only the 'going' answers, so capacity means something.
create or replace function bsdc.sync_event_rsvp_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.status = 'going' then
    update public.events set going_count = going_count + 1 where id = new.event_id;
  elsif tg_op = 'UPDATE' and old.status <> 'going' and new.status = 'going' then
    update public.events set going_count = going_count + 1 where id = new.event_id;
  elsif tg_op = 'UPDATE' and old.status = 'going' and new.status <> 'going' then
    update public.events
      set going_count = greatest(going_count - 1, 0) where id = new.event_id;
  elsif tg_op = 'DELETE' and old.status = 'going' then
    update public.events
      set going_count = greatest(going_count - 1, 0) where id = old.event_id;
  end if;
  return null;
end;
$$;

drop trigger if exists event_rsvps_sync on public.event_rsvps;
create trigger event_rsvps_sync after insert or update or delete on public.event_rsvps
  for each row execute function bsdc.sync_event_rsvp_counts();

-- ---------------------------------------------------------------------------
-- joining, approving and attending
-- ---------------------------------------------------------------------------

-- Public groups join instantly; private ones queue a request; secret ones are
-- invitation only and refuse outright.
create or replace function public.join_group(p_group_id uuid, p_message text default '')
returns bsdc_join_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_privacy bsdc_group_privacy;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select privacy into v_privacy from public.groups where id = p_group_id and not is_archived;
  if not found then
    raise exception 'group not available' using errcode = 'P0002';
  end if;
  if bsdc.is_group_member(p_group_id, v_uid) then
    return 'approved';
  end if;

  if v_privacy = 'public' then
    insert into public.group_members (group_id, uid) values (p_group_id, v_uid)
      on conflict do nothing;
    return 'approved';
  elsif v_privacy = 'private' then
    insert into public.group_join_requests (group_id, uid, message)
      values (p_group_id, v_uid, left(coalesce(p_message, ''), 500))
      on conflict (group_id, uid) do update set message = excluded.message, status = 'pending';
    return 'pending';
  end if;

  raise exception 'this group is invitation only' using errcode = '42501';
end;
$$;

create or replace function public.decide_join_request(
  p_group_id uuid,
  p_uid      text,
  p_approve  boolean
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_actor text := bsdc.current_uid();
begin
  if not bsdc.can_moderate_group(p_group_id, v_actor) then
    raise exception 'only group moderators may decide requests' using errcode = '42501';
  end if;

  update public.group_join_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = v_actor,
        decided_at = now()
    where group_id = p_group_id and uid = p_uid;

  if p_approve then
    insert into public.group_members (group_id, uid) values (p_group_id, p_uid)
      on conflict do nothing;
    perform bsdc.notify(p_uid, v_actor, 'moderation', null, null, 'group_join_approved');
  end if;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  -- The last owner cannot walk out and leave the group headless.
  if bsdc.group_role(p_group_id, v_uid) = 'owner'
     and (select count(*) from public.group_members
          where group_id = p_group_id and role = 'owner') = 1 then
    raise exception 'transfer ownership before leaving' using errcode = '42501';
  end if;

  delete from public.group_members where group_id = p_group_id and uid = v_uid;
end;
$$;

create or replace function public.set_group_role(
  p_group_id uuid,
  p_uid      text,
  p_role     bsdc_group_role
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_actor_role bsdc_group_role := bsdc.group_role(p_group_id, bsdc.current_uid());
begin
  if v_actor_role is distinct from 'owner' and not bsdc.is_staff() then
    raise exception 'only the owner may change roles' using errcode = '42501';
  end if;
  update public.group_members set role = p_role where group_id = p_group_id and uid = p_uid;
end;
$$;

create or replace function public.rsvp_event(p_event_id uuid, p_status bsdc_rsvp_status)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_event public.events%rowtype;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.is_cancelled then
    raise exception 'event not available' using errcode = 'P0002';
  end if;
  if p_status = 'going'
     and v_event.capacity is not null
     and v_event.going_count >= v_event.capacity
     and not exists (
       select 1 from public.event_rsvps
       where event_id = p_event_id and uid = v_uid and status = 'going'
     ) then
    raise exception 'this event is full' using errcode = '42501';
  end if;

  insert into public.event_rsvps (event_id, uid, status)
    values (p_event_id, v_uid, p_status)
    on conflict (event_id, uid) do update set status = excluded.status;

  select going_count into v_total from public.events where id = p_event_id;
  return v_total;
end;
$$;

create or replace function public.toggle_page_follow(p_page_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.page_followers where page_id = p_page_id and uid = v_uid) then
    delete from public.page_followers where page_id = p_page_id and uid = v_uid;
    return false;
  end if;
  insert into public.page_followers (page_id, uid) values (p_page_id, v_uid);
  return true;
end;
$$;

-- Group creation also seeds the owner's membership and a general channel, so
-- a new group is never an empty shell.
create or replace function public.create_group(
  p_slug        text,
  p_name        text,
  p_description text default '',
  p_privacy     bsdc_group_privacy default 'public',
  p_language    text default 'bn'
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.groups (slug, name, description, privacy, language, owner_uid)
    values (lower(btrim(p_slug)), btrim(p_name), coalesce(p_description, ''), p_privacy,
            p_language, v_uid)
    returning id into v_id;

  insert into public.group_members (group_id, uid, role) values (v_id, v_uid, 'owner');
  insert into public.channels (group_id, slug, name, position)
    values (v_id, 'general', 'general', 0);

  return v_id;
end;
$$;

-- The discovery list: groups this member can see, with their own role.
create or replace function public.group_directory(p_limit integer default 40)
returns table (
  id            uuid,
  slug          text,
  name          text,
  description   text,
  privacy       bsdc_group_privacy,
  avatar_url    text,
  members_count integer,
  posts_count   integer,
  my_role       bsdc_group_role,
  request_status bsdc_join_status
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    g.id, g.slug::text, g.name, g.description, g.privacy, g.avatar_url,
    g.members_count, g.posts_count,
    gm.role,
    jr.status
  from public.groups g
  left join public.group_members gm
    on gm.group_id = g.id and gm.uid = bsdc.current_uid()
  left join public.group_join_requests jr
    on jr.group_id = g.id and jr.uid = bsdc.current_uid()
  where not g.is_archived
    and bsdc.can_see_group(g.id, g.privacy)
  order by (gm.role is not null) desc, g.members_count desc, g.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

-- Upcoming events with this member's answer attached.
create or replace function public.event_calendar(p_limit integer default 40)
returns table (
  id          uuid,
  slug        text,
  title       text,
  mode        bsdc_event_mode,
  venue       text,
  city        text,
  cover_url   text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  capacity    integer,
  going_count integer,
  group_id    uuid,
  page_id     uuid,
  my_status   bsdc_rsvp_status
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    e.id, e.slug::text, e.title, e.mode, e.venue, e.city, e.cover_url,
    e.starts_at, e.ends_at, e.capacity, e.going_count, e.group_id, e.page_id,
    r.status
  from public.events e
  left join public.event_rsvps r on r.event_id = e.id and r.uid = bsdc.current_uid()
  where not e.is_cancelled
    and e.ends_at > now()
    and (e.group_id is null or bsdc.is_group_member(e.group_id, bsdc.current_uid())
         or exists (select 1 from public.groups g
                    where g.id = e.group_id and g.privacy = 'public'))
  order by e.starts_at
  limit greatest(1, least(p_limit, 100));
$$;
