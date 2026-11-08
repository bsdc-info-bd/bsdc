-- Native Android FCM token registry. Tokens are credentials for reaching one
-- installation and are deliberately never exposed by an enumerable client read.
create table if not exists public.fcm_devices (
  id uuid primary key default gen_random_uuid(),
  uid text not null references public.profiles(uid) on delete cascade,
  device_id text not null check (char_length(device_id) between 16 and 80),
  token text not null unique check (char_length(token) between 32 and 4096),
  platform text not null default 'android' check (platform = 'android'),
  language text not null default 'bn' check (language in ('bn', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (uid, device_id)
);

create index if not exists fcm_devices_uid_idx on public.fcm_devices(uid, last_seen_at desc);
alter table public.fcm_devices enable row level security;
revoke all on public.fcm_devices from anon, authenticated;
drop policy if exists fcm_devices_deny_direct_access on public.fcm_devices;
create policy fcm_devices_deny_direct_access on public.fcm_devices
  for all to anon, authenticated using (false) with check (false);

drop trigger if exists fcm_devices_touch on public.fcm_devices;
create trigger fcm_devices_touch before update on public.fcm_devices
  for each row execute function bsdc.touch_updated_at();

create or replace function public.register_fcm_device(
  p_device_id text,
  p_token text,
  p_language text default 'bn'
) returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare v_uid text := bsdc.current_uid();
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_device_id is null or char_length(p_device_id) not between 16 and 80
     or p_device_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid device id' using errcode = '22023';
  end if;
  if p_token is null or char_length(p_token) not between 32 and 4096 then
    raise exception 'invalid FCM token' using errcode = '22023';
  end if;
  -- A shared phone's current signed-in member becomes the owner of its token.
  delete from public.fcm_devices where token = p_token and (uid <> v_uid or device_id <> p_device_id);
  insert into public.fcm_devices(uid, device_id, token, language, last_seen_at)
  values (v_uid, p_device_id, p_token, case when p_language = 'en' then 'en' else 'bn' end, now())
  on conflict (uid, device_id) do update
    set token = excluded.token, language = excluded.language, last_seen_at = now();
end;
$$;

create or replace function public.unregister_fcm_device(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if bsdc.current_uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  delete from public.fcm_devices where uid = bsdc.current_uid() and device_id = p_device_id;
end;
$$;

create or replace function public.my_fcm_devices()
returns table(device_id text, platform text, language text, created_at timestamptz, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select d.device_id, d.platform, d.language, d.created_at, d.last_seen_at
  from public.fcm_devices d where d.uid = bsdc.current_uid()
  order by d.last_seen_at desc;
$$;

revoke all on function public.register_fcm_device(text, text, text) from public, anon;
revoke all on function public.unregister_fcm_device(text) from public, anon;
revoke all on function public.my_fcm_devices() from public, anon;
grant execute on function public.register_fcm_device(text, text, text) to authenticated;
grant execute on function public.unregister_fcm_device(text) to authenticated;
grant execute on function public.my_fcm_devices() to authenticated;
