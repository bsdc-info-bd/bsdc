-- A notification that reaches somebody whose browser is closed.
--
-- Everything a member did on this site already wrote a row into `notifications`,
-- and that row sat there until the member happened to open the site and look.
-- There was no way to wake a device, because there was nowhere to record what a
-- device had asked to be woken by.
--
-- Web push is three pieces and the database holds two of them:
--
--   1. a subscription — an endpoint at the member's push service, and the two
--      keys that service gave the browser. It is the address of a device, not of
--      a person, so a member can have several and one device can change hands;
--   2. a record of what has already been sent, so a notification is pushed once
--      and a device that was asleep for a day is not woken nine times;
--   3. the delivery itself, which is an HTTPS POST to the endpoint from an edge
--      function. That piece lives in `main-site/functions/api/push/`, not here.
--
-- The functions that read other members' rows are secret-gated rather than
-- role-gated, because an edge function in this repository never holds the
-- service key: one that could bypass row level security would be a public
-- endpoint that could bypass row level security. The secret is a row in
-- `bsdc.push_settings`, which has row level security on, no policies and no
-- grants, so nothing but these definer functions can read it. The same string
-- is set as `PUSH_FLUSH_SECRET` in Cloudflare Pages. `npm run push:keys`
-- generates both it and the VAPID keypair, and prints where each one goes.
--
-- Where the secret is not set, every gated function refuses: push does not run,
-- and nothing else about the site changes.

-- --------------------------------------------------------------- the secret ---

create schema if not exists bsdc;

create table if not exists bsdc.push_settings (
  name  text primary key,
  value text not null check (char_length(value) <= 512)
);

alter table bsdc.push_settings enable row level security;
revoke all on bsdc.push_settings from public;
revoke all on bsdc.push_settings from anon, authenticated;

comment on table bsdc.push_settings is
  'Server-side settings nothing but a definer function may read. No grants, no policies.';

-- A comparison of digests rather than of the strings themselves, so the answer
-- does not depend on how much of the secret matched. An unset secret never
-- matches anything, including an empty argument.
create or replace function bsdc.push_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select exists (
    select 1
      from bsdc.push_settings s
     where s.name = 'flush_secret'
       and char_length(s.value) >= 32
       and md5(s.value) = md5(coalesce(p_secret, ''))
  );
$$;

revoke all on function bsdc.push_secret_matches(text) from public;

-- ---------------------------------------------------------- the subscriptions ---

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  uid          text not null references public.profiles (uid) on delete cascade,
  p256dh       text not null default '' check (char_length(p256dh) <= 512),
  auth         text not null default '' check (char_length(auth) <= 512),
  user_agent   text not null default '' check (char_length(user_agent) <= 400),
  language     text not null default 'bn' check (language in ('bn', 'en')),
  created_at   timestamptz not null default now(),
  -- The watermark for what a device has already been told about. A push carries
  -- no payload, so the service worker asks for the content of everything newer
  -- than this.
  last_used_at timestamptz not null default now(),
  -- Set when the push service answers 404 or 410: the subscription is gone, and
  -- waking it again would only fail again.
  dead_at      timestamptz
);

create index if not exists push_subscriptions_live_idx
  on public.push_subscriptions (uid)
  where dead_at is null;

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

comment on table public.push_subscriptions is
  'Devices that asked to be woken. Keyed by endpoint, because the endpoint is what a push service answers to.';

-- --------------------------------------------------------------- what is new ---

alter table public.notifications add column if not exists pushed_at timestamptz;

create index if not exists notifications_unpushed_idx
  on public.notifications (created_at)
  where pushed_at is null;

comment on column public.notifications.pushed_at is
  'When the flush handed this to every device it could reach. Null means it has not been pushed.';

-- ------------------------------------------------------------- the member side ---

create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text default '',
  p_auth       text default '',
  p_user_agent text default '',
  p_language   text default 'bn'
)
returns void
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
  if p_endpoint is null or char_length(btrim(p_endpoint)) < 20 then
    raise exception 'a push endpoint is required' using errcode = '22023';
  end if;

  -- An endpoint that already exists changes owner. That is not a hole: the
  -- endpoint is a long random address known only to this browser, the push
  -- service and this function, and a shared device that signs somebody else in
  -- should wake for them and not for the member who signed out.
  insert into public.push_subscriptions (
    endpoint, uid, p256dh, auth, user_agent, language
  ) values (
    btrim(p_endpoint),
    v_uid,
    left(btrim(coalesce(p_p256dh, '')), 512),
    left(btrim(coalesce(p_auth, '')), 512),
    left(coalesce(p_user_agent, ''), 400),
    case when lower(btrim(coalesce(p_language, 'bn'))) = 'en' then 'en' else 'bn' end
  )
  on conflict (endpoint) do update set
    uid          = excluded.uid,
    p256dh       = excluded.p256dh,
    auth         = excluded.auth,
    user_agent   = excluded.user_agent,
    language     = excluded.language,
    last_used_at = now(),
    dead_at      = null;
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
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

  delete from public.push_subscriptions
   where endpoint = btrim(coalesce(p_endpoint, ''))
     and uid = v_uid;
end;
$$;

-- How many devices this member has asked to be woken. The settings page shows
-- it, because a member who turns push off should be able to see that it is off.
create or replace function public.my_push_subscriptions()
returns table (endpoint text, user_agent text, language text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select s.endpoint, s.user_agent, s.language, s.created_at
    from public.push_subscriptions s
   where s.uid = bsdc.current_uid()
     and s.dead_at is null
   order by s.created_at desc;
$$;

-- ------------------------------------------------------------- the flush side ---

-- The devices to wake, and the notifications that are the reason. One row per
-- (notification, endpoint) pair; the caller wakes each distinct endpoint once.
create or replace function public.push_pending(
  p_secret text,
  p_limit  integer default 200
)
returns table (
  notification_id uuid,
  uid             text,
  endpoint        text,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select n.id, n.uid, s.endpoint, n.created_at
      from public.notifications n
      join public.push_subscriptions s
        on s.uid = n.uid
       and s.dead_at is null
     where n.pushed_at is null
       -- Three days is as far back as a wake-up is worth sending.
       and n.created_at > now() - interval '3 days'
     order by n.created_at asc, s.endpoint asc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

-- Handed over. Anything not marked here is picked up by the next flush, so a
-- run that fails halfway repeats rather than drops.
create or replace function public.push_mark(p_secret text, p_ids uuid[])
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

  update public.notifications n
     set pushed_at = now()
   where n.pushed_at is null
     and n.id = any (coalesce(p_ids, array[]::uuid[]));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The push service said this address no longer exists.
create or replace function public.push_kill(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.push_subscriptions
     set dead_at = now()
   where endpoint = btrim(coalesce(p_endpoint, ''))
     and dead_at is null;
end;
$$;

-- ------------------------------------------------------------ the waking side ---

-- What a device shows when it wakes. The endpoint is the capability here: it is
-- a long random address that only this browser, its push service and this
-- database hold, and the answer is scoped to its owner. Reading it also moves
-- the watermark, so the same notification is not shown twice on the same device.
create or replace function public.push_content(p_endpoint text, p_limit integer default 5)
returns table (
  id            uuid,
  kind          text,
  body          text,
  url           text,
  actor_name    text,
  actor_avatar  text,
  language      text,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_subscription public.push_subscriptions;
begin
  select *
    into v_subscription
    from public.push_subscriptions s
   where s.endpoint = btrim(coalesce(p_endpoint, ''))
     and s.dead_at is null;

  if not found then
    return;
  end if;

  return query
    select
      n.id,
      n.kind::text,
      n.body,
      case
        when n.kind = 'message' then '/messages'
        when n.post_id is not null and p.slug is not null then '/p/' || p.slug
        when n.kind = 'follow' and a.username is not null then '/@' || a.username
        else '/notifications'
      end as url,
      coalesce(a.display_name, '') as actor_name,
      coalesce(a.avatar_url, '')   as actor_avatar,
      v_subscription.language,
      n.created_at
    from public.notifications n
    left join public.posts p on p.id = n.post_id
    left join public.profiles a on a.uid = n.actor_uid
   where n.uid = v_subscription.uid
     and n.created_at > v_subscription.last_used_at
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 5), 20));

  update public.push_subscriptions
     set last_used_at = now()
   where endpoint = v_subscription.endpoint;
end;
$$;

-- ------------------------------------------------------------------- grants ---

revoke all on function public.register_push_subscription(text, text, text, text, text) from public;
revoke all on function public.unregister_push_subscription(text) from public;
revoke all on function public.my_push_subscriptions() from public;
revoke all on function public.push_pending(text, integer) from public;
revoke all on function public.push_mark(text, uuid[]) from public;
revoke all on function public.push_kill(text, text) from public;
revoke all on function public.push_content(text, integer) from public;

grant execute on function public.register_push_subscription(text, text, text, text, text)
  to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.my_push_subscriptions() to authenticated;

-- The flush runs at the edge with the anonymous key, like everything else in
-- `functions/`. The secret is what authorises it, not the role.
grant execute on function public.push_pending(text, integer) to anon, authenticated;
grant execute on function public.push_mark(text, uuid[]) to anon, authenticated;
grant execute on function public.push_kill(text, text) to anon, authenticated;

-- A service worker fetches its content before a member has signed in to that
-- tab, so this one has to answer the anonymous role too. The endpoint is the
-- authority.
grant execute on function public.push_content(text, integer) to anon, authenticated;
