-- ---------------------------------------------------------------------------
-- BSDC core schema (Supabase Postgres is the source of truth).
--
-- Identity is provided by Firebase Authentication (project "bsdc-bd"). The
-- Firebase ID token is passed to PostgREST as the bearer token, so inside the
-- database the caller is identified by the JWT "sub" claim, not by Supabase
-- Auth. Everything below is written against that assumption.
--
-- Apply with:  supabase db push      (or psql -f against the project database)
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema if not exists bsdc;

-- The authenticated Firebase uid of the caller, or null for anonymous traffic.
create or replace function bsdc.current_uid()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
$$;

-- Custom claims minted by functions/api/auth/claims.ts.
create or replace function bsdc.current_role_name()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'member')
$$;

create or replace function bsdc.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'staff')::boolean, false)
$$;

create or replace function bsdc.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_role') then
    create type bsdc_role as enum (
      'member', 'creator', 'vendor', 'moderator', 'manager', 'admin', 'owner'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'bsdc_account_status') then
    create type bsdc_account_status as enum ('active', 'suspended', 'deactivated', 'deleted');
  end if;

  if not exists (select 1 from pg_type where typname = 'bsdc_media_kind') then
    create type bsdc_media_kind as enum ('image', 'document', 'audio', 'video');
  end if;

  if not exists (select 1 from pg_type where typname = 'bsdc_media_provider') then
    create type bsdc_media_provider as enum ('cloudinary', 'imgbb', 'external');
  end if;

  if not exists (select 1 from pg_type where typname = 'bsdc_report_status') then
    create type bsdc_report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per member, keyed by the Firebase uid
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  uid                 text primary key,
  username            citext,
  display_name        text        not null check (char_length(display_name) between 1 and 60),
  bio                 text        not null default '' check (char_length(bio) <= 280),
  avatar_url          text        not null default '',
  cover_url           text        not null default '',
  location            text        not null default '' check (char_length(location) <= 80),
  website             text        not null default '',
  skills              text[]      not null default '{}',
  interests           text[]      not null default '{}',
  language            text        not null default 'bn' check (language in ('bn', 'en')),
  role                bsdc_role   not null default 'member',
  status              bsdc_account_status not null default 'active',
  onboarding_complete boolean     not null default false,
  email_verified      boolean     not null default false,
  notifications       jsonb       not null default
    '{"followers":true,"comments":true,"mentions":true,"messages":true,"digest":true}'::jsonb,
  privacy             jsonb       not null default
    '{"discoverable":true,"showActivity":true,"showEmail":false}'::jsonb,
  followers_count     integer     not null default 0 check (followers_count >= 0),
  following_count     integer     not null default 0 check (following_count >= 0),
  posts_count         integer     not null default 0 check (posts_count >= 0),
  reputation          integer     not null default 0,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- citext needs the extension; fall back gracefully when it is unavailable.
create extension if not exists "citext";

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (
        username is null
        or (username ~ '^[a-z0-9_]{3,24}$' and username !~ '^_' and username !~ '_$')
      );
  end if;
end
$$;

create unique index if not exists profiles_username_key on public.profiles (username);
create index if not exists profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);
create index if not exists profiles_skills_idx on public.profiles using gin (skills);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function bsdc.touch_updated_at();

-- ---------------------------------------------------------------------------
-- reserved_usernames — handles the platform keeps for itself
-- ---------------------------------------------------------------------------
create table if not exists public.reserved_usernames (
  username   citext primary key,
  reason     text not null default 'platform',
  created_at timestamptz not null default now()
);

insert into public.reserved_usernames (username, reason) values
  ('admin', 'platform'), ('administrator', 'platform'), ('bsdc', 'brand'),
  ('rrc', 'brand'), ('support', 'platform'), ('help', 'platform'),
  ('about', 'route'), ('contact', 'route'), ('settings', 'route'),
  ('messages', 'route'), ('notifications', 'route'), ('search', 'route'),
  ('explore', 'route'), ('auth', 'route'), ('login', 'route'),
  ('signup', 'route'), ('api', 'route'), ('vendor', 'platform'),
  ('marketplace', 'route'), ('jobs', 'route'), ('moderator', 'platform'),
  ('staff', 'platform'), ('owner', 'platform'), ('official', 'platform'),
  ('system', 'platform'), ('root', 'platform'), ('null', 'reserved'),
  ('undefined', 'reserved')
on conflict (username) do nothing;

-- ---------------------------------------------------------------------------
-- follows and blocks — the social graph primitives
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  follower_uid text        not null references public.profiles (uid) on delete cascade,
  followee_uid text        not null references public.profiles (uid) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_uid, followee_uid),
  constraint follows_no_self check (follower_uid <> followee_uid)
);

create index if not exists follows_followee_idx on public.follows (followee_uid, created_at desc);

create table if not exists public.blocks (
  blocker_uid text        not null references public.profiles (uid) on delete cascade,
  blocked_uid text        not null references public.profiles (uid) on delete cascade,
  reason      text        not null default '',
  created_at  timestamptz not null default now(),
  primary key (blocker_uid, blocked_uid),
  constraint blocks_no_self check (blocker_uid <> blocked_uid)
);

-- Follower and following counters stay correct without an extra round trip.
create or replace function bsdc.sync_follow_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1
      where uid = new.follower_uid;
    update public.profiles set followers_count = followers_count + 1
      where uid = new.followee_uid;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0)
      where uid = old.follower_uid;
    update public.profiles set followers_count = greatest(followers_count - 1, 0)
      where uid = old.followee_uid;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_sync_counts on public.follows;
create trigger follows_sync_counts after insert or delete on public.follows
  for each row execute function bsdc.sync_follow_counts();

-- ---------------------------------------------------------------------------
-- media_assets — every upload that the platform knows about
-- ---------------------------------------------------------------------------
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  owner_uid    text        not null references public.profiles (uid) on delete cascade,
  provider     bsdc_media_provider not null,
  kind         bsdc_media_kind     not null,
  url          text        not null,
  thumb_url    text        not null default '',
  delete_token text        not null default '',
  width        integer,
  height       integer,
  bytes        bigint      not null default 0 check (bytes >= 0),
  mime_type    text        not null default '',
  checksum     text        not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists media_assets_owner_idx on public.media_assets (owner_uid, created_at desc);

-- ---------------------------------------------------------------------------
-- feature_flags — every feature ships as a toggleable plugin
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean     not null default true,
  audience    text        not null default 'all'
                check (audience in ('all', 'staff', 'vendor', 'beta')),
  description text        not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists feature_flags_touch on public.feature_flags;
create trigger feature_flags_touch before update on public.feature_flags
  for each row execute function bsdc.touch_updated_at();

insert into public.feature_flags (key, enabled, audience, description) values
  ('auth.oauth.google',  true,  'all', 'Google sign-in'),
  ('auth.oauth.github',  true,  'all', 'GitHub sign-in'),
  ('auth.oauth.yahoo',   true,  'all', 'Yahoo sign-in'),
  ('profile.public',     true,  'all', 'Public /@username profiles'),
  ('media.cloudinary',   true,  'all', 'Cloudinary uploads for important media'),
  ('media.imgbb',        true,  'all', 'imgbb uploads for ordinary images'),
  ('realtime.presence',  true,  'all', 'Realtime Database presence tracking')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- reports and audit_log — moderation and accountability
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_uid  text        not null references public.profiles (uid) on delete cascade,
  subject_type  text        not null,
  subject_id    text        not null,
  reason        text        not null,
  details       text        not null default '',
  status        bsdc_report_status not null default 'open',
  handled_by    text,
  handled_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.audit_log (
  id         bigserial primary key,
  actor_uid  text,
  action     text        not null,
  subject    text        not null default '',
  metadata   jsonb       not null default '{}'::jsonb,
  ip_hash    text        not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_actor_idx on public.audit_log (actor_uid, created_at desc);

-- ---------------------------------------------------------------------------
-- claim_username — atomic handle claim, used by onboarding and settings
-- ---------------------------------------------------------------------------
create or replace function public.claim_username(p_username citext)
returns public.profiles
language plpgsql
security definer
set search_path = public, bsdc
as $$
declare
  v_uid text := bsdc.current_uid();
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'auth/required' using errcode = '28000';
  end if;

  if p_username !~ '^[a-z0-9_]{3,24}$' or p_username ~ '^_' or p_username ~ '_$' then
    raise exception 'profile/username-invalid' using errcode = '22023';
  end if;

  if exists (select 1 from public.reserved_usernames r where r.username = p_username) then
    raise exception 'profile/username-reserved' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles p where p.username = p_username and p.uid <> v_uid
  ) then
    raise exception 'profile/username-taken' using errcode = '23505';
  end if;

  update public.profiles set username = p_username where uid = v_uid returning * into v_row;

  if not found then
    raise exception 'profile/not-found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;
