-- =============================================================================
-- 0083_imgbb_only_media.sql
-- Standardise BSDC image hosting exclusively on ImgBB, enforce ImgBB HTTPS
-- host validation inside `public.record_media_asset`, and remove retired
-- non-ImgBB media entries from `public.feature_flags` and `public.services`.
-- =============================================================================

delete from public.feature_flags
where key like 'media.%'
  and key <> 'media.imgbb';

update public.feature_flags
set description = 'ImgBB uploads for all BSDC images'
where key = 'media.imgbb';

delete from public.services
where category = 'dependency'
  and key not in ('supabase', 'firebase-main', 'firebase-corporate', 'imgbb');

update public.services
set name = 'ImgBB'
where key = 'imgbb';

create or replace function bsdc.media_host_of(p_url text)
returns text
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select case
    when p_url like 'https://i.ibb.co/%'
      or p_url like 'https://ibb.co/%'
      or p_url like 'https://i.ibb.co.com/%'
      or p_url like 'https://%.ibb.co/%' then 'imgbb'
    else 'unknown'
  end;
$$;

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
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_id    uuid;
  v_url   text := btrim(coalesce(p_url, ''));
  v_bytes bigint := greatest(coalesce(p_bytes, 0), 0);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if char_length(v_url) < 8 or v_url !~ '^https://' then
    raise exception 'a picture has to be an https address' using errcode = '22023';
  end if;

  if p_provider is distinct from 'imgbb' then
    raise exception 'unknown media provider' using errcode = '22023';
  end if;

  if p_kind is distinct from 'image' then
    raise exception 'unknown media kind' using errcode = '22023';
  end if;

  if bsdc.media_host_of(v_url) <> 'imgbb' then
    raise exception 'a picture has to be hosted on imgbb' using errcode = '22023';
  end if;

  if p_expires_at is not null
     and (p_expires_at <= now() or p_expires_at > now() + interval '400 days') then
    raise exception 'an expiry has to be in the future and inside a year'
      using errcode = '22023';
  end if;

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
    v_url,
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
