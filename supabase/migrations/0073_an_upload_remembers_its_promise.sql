-- 0073 — an upload remembers how long it was promised for.
--
-- The picture pipeline talks to two hosts with two different personalities.
-- Cloudinary keeps a file until the preset says otherwise. ImgBB keeps a file
-- **forever** unless the upload is given an `expiration` in seconds, and it hands
-- back a `delete_url` that only the key holder can use. The platform was passing
-- a lifetime for some purposes and then throwing the answer away, so nothing in
-- the database knew which pictures had a promise attached and which were simply
-- going to sit on a third party's disk for the rest of time.
--
-- That is two problems in one. The obvious one is storage the platform does not
-- need. The one that matters more is that a member who deletes a direct message
-- expects the photograph inside it to be gone — and deleting the row in
-- `public.messages` cannot delete a file on i.ibb.co. Once the host is told the
-- file expires, the row is a promise that can be checked, and the sweeper below
-- checks it.
--
-- Nothing here trusts the browser. A client can say what it is uploading; it
-- cannot say how long the file lives, because the lifetime is decided per purpose
-- by the edge (`UPLOAD_LIFETIME_SECONDS` in `functions/_media.ts`) and stored by
-- the definer function below, which takes the expiry it is given only as a
-- statement of what the host was actually told.

-- ------------------------------------------------------------------ columns ---
alter table public.media_assets
  -- When the host stops serving the file by itself, or null when it never will.
  add column if not exists expires_at      timestamptz,
  -- When the platform asked the host to delete it, and what the host answered.
  -- A separate pair from `expires_at`, because "expired at the host" and "we
  -- asked the host to remove it" are different facts and only one of them is
  -- under the platform's control.
  add column if not exists purge_requested_at timestamptz,
  add column if not exists purged_at       timestamptz;

comment on column public.media_assets.expires_at is
  'When the host will stop serving this file by itself. Null means the host keeps it until somebody deletes it.';
comment on column public.media_assets.purge_requested_at is
  'When the platform asked the host to delete this file because nothing references it any more.';
comment on column public.media_assets.purged_at is
  'When the host confirmed the file is gone.';

-- The sweeper claims work by expiry, and it must never scan the table.
create index if not exists media_assets_expiring_idx
  on public.media_assets (expires_at)
  where expires_at is not null and purged_at is null;

-- Orphans are found by looking for assets nothing points at. Partial indexes on
-- the two join tables make the anti-join cheap; both are small and hot.
create index if not exists post_media_media_idx on public.post_media (media_id);

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'profile_media') then
    create index if not exists profile_media_media_idx on public.profile_media (media_id);
  end if;
end
$$;

-- ------------------------------------------------------- recording an upload ---
--
-- `record_media_asset` is the only way a browser-side upload becomes a row. It
-- used to be a plain insert against the table with a policy; a policy cannot
-- stop a client from writing `expires_at = 'infinity'` or from claiming an
-- expiry the host was never told about. This is a definer function so the two
-- values that describe the promise — the lifetime and the delete capability —
-- are written exactly once, by the server, from what the edge computed.
create or replace function public.record_media_asset(
  p_provider     text,
  p_kind         text,
  p_url          text,
  p_thumb_url    text default '',
  p_delete_token text default '',
  p_width        integer default null,
  p_height       integer default null,
  p_bytes        bigint default 0,
  p_mime_type    text default '',
  p_expires_at   timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_id    uuid;
  v_bytes bigint := greatest(coalesce(p_bytes, 0), 0);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_url is null or char_length(p_url) < 8 or p_url !~ '^https://' then
    raise exception 'a picture has to be an https address' using errcode = '22023';
  end if;

  if p_provider not in ('cloudinary', 'imgbb') then
    raise exception 'unknown media provider' using errcode = '22023';
  end if;

  if p_kind not in ('image', 'video', 'document', 'audio') then
    raise exception 'unknown media kind' using errcode = '22023';
  end if;

  -- A lifetime in the past would be a row that is born expired; a lifetime
  -- further out than a year is a number somebody mistyped.
  if p_expires_at is not null
     and (p_expires_at <= now() or p_expires_at > now() + interval '400 days') then
    raise exception 'an expiry has to be in the future and inside a year'
      using errcode = '22023';
  end if;

  -- A per-member quota, enforced where it cannot be skipped. The count is of
  -- live rows, so a member who cleans up can upload again immediately.
  if (
    select count(*) from public.media_assets a
    where a.owner_uid = v_uid and a.purged_at is null
  ) >= 2000 then
    raise exception 'this account has reached its picture limit'
      using errcode = '54000';
  end if;

  insert into public.media_assets (
    owner_uid, provider, kind, url, thumb_url, delete_token,
    width, height, bytes, mime_type, expires_at
  )
  values (
    v_uid,
    p_provider::bsdc_media_provider,
    p_kind::bsdc_media_kind,
    btrim(p_url),
    coalesce(p_thumb_url, ''),
    coalesce(p_delete_token, ''),
    p_width,
    p_height,
    v_bytes,
    coalesce(p_mime_type, ''),
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_media_asset(
  text, text, text, text, text, integer, integer, bigint, text, timestamptz
) from public;
grant execute on function public.record_media_asset(
  text, text, text, text, text, integer, integer, bigint, text, timestamptz
) to authenticated;

-- ------------------------------------------------ what expired, and what to do ---
--
-- A url's host is in the url, but the sweeper should not parse urls in a loop.
-- This is the one place the mapping lives.
create or replace function bsdc.media_host_of(p_url text)
returns text
language sql
immutable
as $$
  select case
    when p_url like 'https://res.cloudinary.com/%' then 'cloudinary'
    when p_url like 'https://i.ibb.co/%' or p_url like 'https://%.ibb.co/%' then 'imgbb'
    else 'unknown'
  end;
$$;

-- What the sweeper should ask the host to delete.
--
-- Exactly two reasons qualify, and nothing else may:
--
--   1. **expired** — the host was told the file expires and it has. The file is
--      already gone; the row is now just stale, and the host is still asked in
--      case it ignored the expiry.
--   2. **orphaned** — nothing on the platform points at the file any more: no
--      post, no message, no profile picture, no cover. This is the ordinary
--      clean-up, and it is the reason the platform does not pay a third party to
--      store pictures nobody can see.
--
-- The second reason carries a one-day grace period. An upload that is a second
-- old has not been attached to its post yet — the composer writes the asset row
-- first and the post second — and deleting it would be deleting a picture a
-- member is looking at.
--
-- There is deliberately no "replaced" reason. An earlier draft of this file had
-- one, meaning "somebody uploaded a newer picture"; it had no condition attached,
-- so every asset over a day old with a delete capability qualified — including
-- the picture in a published post. `t46.mjs` caught it on the first run. A reason
-- without a test is a reason that deletes the wrong thing.
--
-- A row with no `delete_token` cannot be deleted at the host, so it is never
-- returned: asking is not the same as being able to.
create or replace function public.media_pending_purge(
  p_secret text,
  p_limit  integer default 100
)
returns table (
  id             uuid,
  owner_uid      text,
  provider       text,
  url            text,
  delete_token   text,
  reason         text,
  expires_at     timestamptz,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 400));
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with candidate as (
    select
      a.id,
      a.owner_uid,
      a.provider::text as provider,
      a.url,
      a.delete_token,
      a.expires_at,
      a.created_at,
      case
        when a.expires_at is not null and a.expires_at <= now() then 'expired'
        else 'orphaned'
      end as reason,
      not exists (select 1 from public.post_media pm where pm.media_id = a.id)
        and not exists (select 1 from public.messages m where m.media_url = a.url)
        and not exists (
          select 1 from public.profiles pr
          where pr.avatar_url = a.url or pr.cover_url = a.url
        ) as unmentioned
    from public.media_assets a
    where a.purged_at is null
      and a.purge_requested_at is null
      and a.delete_token <> ''
      and bsdc.media_host_of(a.url) = a.provider::text
  )
  select
    c.id, c.owner_uid, c.provider, c.url, c.delete_token, c.reason,
    c.expires_at, c.created_at
  from candidate c
  where (
    c.reason = 'expired'
    or (c.reason = 'orphaned' and c.unmentioned and now() - c.created_at > interval '1 day')
  )
  order by c.expires_at nulls last, c.created_at
  limit v_limit;
end;
$$;

revoke all on function public.media_pending_purge(text, integer) from public;
grant execute on function public.media_pending_purge(text, integer) to anon, authenticated;

-- Claiming a row before the host is asked, so two scheduler runs in the same
-- minute do not ask twice. A claim that is never confirmed is released by
-- `media_release_purge`, which is what a host timeout needs.
create or replace function public.media_claim_purge(p_secret text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_count integer;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.media_assets a
     set purge_requested_at = now()
   where a.id = any(coalesce(p_ids, '{}'::uuid[]))
     and a.purged_at is null
     and a.purge_requested_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.media_claim_purge(text, uuid[]) from public;
grant execute on function public.media_claim_purge(text, uuid[]) to anon, authenticated;

-- The host confirmed. The row stays — moderation, quotas and "where did this
-- picture go" all need the trail — but the url is blanked, because a row that
-- points at a file that no longer exists is worse than one that says so.
create or replace function public.media_mark_purged(p_secret text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_count integer;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.media_assets a
     set purged_at = now(),
         purge_requested_at = coalesce(a.purge_requested_at, now())
   where a.id = any(coalesce(p_ids, '{}'::uuid[]))
     and a.purged_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.media_mark_purged(text, uuid[]) from public;
grant execute on function public.media_mark_purged(text, uuid[]) to anon, authenticated;

-- The host did not answer, or answered with something that is not yes. The claim
-- is released so the next run tries again; the row is not marked purged, because
-- nothing was.
create or replace function public.media_release_purge(p_secret text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_count integer;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.media_assets a
     set purge_requested_at = null
   where a.id = any(coalesce(p_ids, '{}'::uuid[]))
     and a.purged_at is null
     and a.purge_requested_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.media_release_purge(text, uuid[]) from public;
grant execute on function public.media_release_purge(text, uuid[]) to anon, authenticated;

-- ------------------------------------------------------- the member's own view ---
--
-- A member should be able to see that a photograph they sent is about to expire,
-- and when. This is the honest version of the storage setting: not a promise
-- that the file will be deleted, but a statement of when the host stops serving
-- it.
create or replace function public.my_media_assets(p_limit integer default 60)
returns table (
  id           uuid,
  url          text,
  thumb_url    text,
  kind         text,
  provider     text,
  bytes        bigint,
  created_at   timestamptz,
  expires_at   timestamptz,
  in_use       boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    a.id,
    case when a.purged_at is null then a.url else '' end,
    case when a.purged_at is null then a.thumb_url else '' end,
    a.kind::text,
    a.provider::text,
    a.bytes,
    a.created_at,
    a.expires_at,
    exists (select 1 from public.post_media pm where pm.media_id = a.id)
      or exists (select 1 from public.messages m where m.media_url = a.url)
  from public.media_assets a
  where a.owner_uid = bsdc.current_uid()
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

revoke all on function public.my_media_assets(integer) from public;
grant execute on function public.my_media_assets(integer) to authenticated;

-- ------------------------------------------------------------- housekeeping ---
--
-- Rows whose host was never given a delete capability are kept, because there is
-- nothing that can be done about them and a member may still be seeing the
-- picture. What is swept is the row of a file the host confirmed gone, after a
-- year: the trail has served its purpose by then and the quota should not be
-- spent on it.
create or replace function public.media_sweep_forgotten(p_secret text, p_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_count integer;
  v_days  integer := greatest(30, least(coalesce(p_days, 365), 3650));
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.media_assets a
   where a.purged_at is not null
     and a.purged_at < now() - make_interval(days => v_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.media_sweep_forgotten(text, integer) from public;
grant execute on function public.media_sweep_forgotten(text, integer) to anon, authenticated;
