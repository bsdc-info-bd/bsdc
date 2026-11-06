-- Push that carries its words.
--
-- 0060 built the half of web push that can wake a device and nothing more: the
-- flush sent an empty POST, the service worker woke up, asked
-- /api/push/content what it had missed, and wrote the notification by hand. That
-- works, and it is why the Pages Function in main-site/ is kept. It costs a
-- round trip and it means the words arrive after the buzz, not with it.
--
-- The delivery worker in push-worker/ sends the words instead: an RFC 8291
-- encrypted payload with the title, the body and the path already in it. To do
-- that it needs two things 0060 did not have to provide, because nothing ever
-- asked for them:
--
--   1. The subscription's two keys, in the same read as the notification. The
--      keys are already stored (p256dh, auth) - they were needed to subscribe -
--      but push_pending deliberately did not return them, because the empty-body
--      flush did not need them and returning a key you do not need is how a key
--      ends up in a log.
--   2. A way to record a subscription whose keys are unusable without retiring
--      it: the browser may repair it the next time it opens, and a worker that
--      deletes it turns "this device is asleep" into "this device is gone".
--
-- Everything here is gated on the same secret as 0060, stored in the same table
-- with no grants and no policies, checked by the same digest comparison. A
-- function added here cannot be called by a browser: bsdc.current_uid() is not
-- consulted, and the anon role holds no execute grant on anything that reads
-- another member's rows without presenting that secret.
--
-- One more thing, and it is the point of the whole file: a member who is
-- suspended, or who has deleted their account, is not woken. 0060 asked only
-- whether a subscription existed. That was true and not enough.

-- -------------------------------------------------- what the worker reads ---

-- Replaces push_pending for the payload path. Same shape, plus the keys a
-- payload has to be encrypted with, plus the words the notification is about,
-- plus the filters that stop a suspended member being woken.
--
-- Kept beside push_pending rather than replacing it: the Pages Function calls
-- push_pending and an older deployment of the site may still be calling it while
-- this migration is rolled out. Dropping a function another service is calling
-- is how a working deployment breaks during a deploy that was supposed to add
-- something.
create or replace function public.push_pending_devices(
  p_secret         text,
  p_limit          integer default 200,
  p_lookback_hours integer default 72
)
returns table (
  notification_id uuid,
  uid             text,
  endpoint        text,
  p256dh          text,
  auth            text,
  language        text,
  kind            text,
  body            text,
  actor_name      text,
  actor_avatar    text,
  url             text,
  post_id         uuid,
  conversation_id uuid,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_lookback integer := greatest(1, least(coalesce(p_lookback_hours, 72), 24 * 14));
  v_limit    integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      n.id,
      n.uid,
      s.endpoint,
      s.p256dh,
      s.auth,
      s.language,
      n.kind::text,
      left(coalesce(n.body, ''), 280),
      coalesce(actor.display_name, ''),
      coalesce(actor.avatar_url, ''),
      case
        when n.conversation_id is not null then '/messages/' || n.conversation_id::text
        when n.kind = 'follow' and actor.username is not null then '/@' || actor.username
        when post.slug is not null then '/p/' || post.slug
        when n.kind = 'moderation' then '/admin/moderation'
        else '/notifications'
      end,
      n.post_id,
      n.conversation_id,
      n.created_at
    from public.notifications n
    join public.push_subscriptions s
      on s.uid = n.uid
     and s.dead_at is null
    left join public.profiles actor on actor.uid = n.actor_uid
    left join public.posts post on post.id = n.post_id
    -- A suspended or deactivated account is not woken. Neither is a notification
    -- whose recipient row has gone: the foreign key already cascades, and this is
    -- the belt beside the braces. `status` is the account state 0001 defined; a
    -- member who closed their account should stop receiving pushes the moment
    -- that column changes, not when they next open the site.
    join public.profiles recipient on recipient.uid = n.uid
   where n.pushed_at is null
     and recipient.status = 'active'
     and n.created_at > now() - make_interval(hours => v_lookback)
     and n.created_at <= now()
   order by n.created_at asc, s.endpoint asc
   limit v_limit;
end;
$$;

revoke all on function public.push_pending_devices(text, integer, integer) from public;
grant execute on function public.push_pending_devices(text, integer, integer) to anon, authenticated;

comment on function public.push_pending_devices(text, integer, integer) is
  'What the delivery worker reads: pending notifications with the device keys a payload is encrypted for. Secret-gated, never role-gated.';

-- Handed over. Same contract as push_mark, spelled for the worker: ids only,
-- never a wildcard, and only rows that were actually delivered.
create or replace function public.push_mark_devices(p_secret text, p_ids uuid[])
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

revoke all on function public.push_mark_devices(text, uuid[]) from public;
grant execute on function public.push_mark_devices(text, uuid[]) to anon, authenticated;

-- The push service says this address is gone. `dead_at` rather than a delete:
-- the member's own device list should be able to say "this device stopped
-- accepting notifications", and a row that vanished would make that a mystery.
create or replace function public.push_kill_device(p_secret text, p_endpoint text)
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

revoke all on function public.push_kill_device(text, text) from public;
grant execute on function public.push_kill_device(text, text) to anon, authenticated;

-- ------------------------------------------------------------------ invalid ---
--
-- A subscription whose p256dh or auth is missing, or is not a point on the
-- curve, cannot be encrypted for. That is different from a device that is gone:
-- a browser that rotated its keys while it was asleep will register a new
-- subscription the next time it opens, and the member's old row is then noise.
-- So it is flagged with a reason and a count, not killed. Three consecutive
-- failures is a device that is not coming back; at that point the ordinary
-- `dead_at` is set and the row stops being selected.
alter table public.push_subscriptions
  add column if not exists invalid_reason text not null default ''
    check (char_length(invalid_reason) <= 120);

alter table public.push_subscriptions
  add column if not exists invalid_count integer not null default 0
    check (invalid_count >= 0 and invalid_count <= 1000);

create or replace function public.push_flag_invalid_device(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.push_subscriptions s
     set invalid_count  = least(s.invalid_count + 1, 1000),
         invalid_reason = 'keys-unusable',
         -- Three strikes. The keys did not become usable between attempts, and
         -- one dead row is cheaper than an eternal retry against a key that
         -- will never be a point on the curve.
         dead_at = case when s.invalid_count + 1 >= 3 then coalesce(s.dead_at, now()) else s.dead_at end
   where s.endpoint = btrim(coalesce(p_endpoint, ''))
     and s.dead_at is null;
end;
$$;

revoke all on function public.push_flag_invalid_device(text, text) from public;
grant execute on function public.push_flag_invalid_device(text, text) to anon, authenticated;

-- ------------------------------------------------------- the member's view ---
--
-- A member who turns notifications on should be able to see, on the devices they
-- own, whether each one is currently able to be woken. That is the difference
-- between "notifications are on" and "notifications are on and this laptop has
-- not accepted one since March".
create or replace function public.my_push_devices()
returns table (
  endpoint       text,
  user_agent     text,
  language       text,
  created_at     timestamptz,
  last_used_at   timestamptz,
  state          text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    s.endpoint,
    s.user_agent,
    s.language,
    s.created_at,
    s.last_used_at,
    case
      when s.dead_at is not null then 'dead'
      when s.invalid_count > 0 then 'invalid'
      else 'live'
    end
  from public.push_subscriptions s
  where s.uid = bsdc.current_uid()
  order by s.created_at desc;
$$;

revoke all on function public.my_push_devices() from public;
grant execute on function public.my_push_devices() to authenticated;

-- A member who removes a device removes every trace of it, which is what
-- "forget this device" has to mean. 0060's unregister already did this; the
-- function is restated here so the grant list in this file is complete and a
-- reader does not have to hold two migrations in their head.
create or replace function public.forget_push_device(p_endpoint text)
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

revoke all on function public.forget_push_device(text) from public;
grant execute on function public.forget_push_device(text) to authenticated;

-- --------------------------------------------------------------- housekeeping ---
--
-- A dead subscription is a row that will never be selected again. Left alone it
-- is a small amount of permanent garbage per device per account, which over a
-- few years of browser updates is worth sweeping. Ninety days is long enough
-- that a member's device list still explains itself.
create or replace function public.push_sweep_dead_devices(p_secret text, p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_count integer;
  v_days  integer := greatest(7, least(coalesce(p_days, 90), 3650));
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.push_subscriptions
   where dead_at is not null
     and dead_at < now() - make_interval(days => v_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.push_sweep_dead_devices(text, integer) from public;
grant execute on function public.push_sweep_dead_devices(text, integer) to anon, authenticated;

-- ------------------------------------------------------------------- indexes ---
--
-- The worker's query is "unpushed notifications, newest last, joined to live
-- subscriptions". 0060 indexed the first half. The join needs the second, and
-- the flag added above needs a partial index so the sweep does not read the
-- table.
create index if not exists push_subscriptions_live_keys_idx
  on public.push_subscriptions (uid)
  include (endpoint, p256dh, auth, language)
  where dead_at is null;

create index if not exists push_subscriptions_dead_idx
  on public.push_subscriptions (dead_at)
  where dead_at is not null;

comment on column public.push_subscriptions.invalid_reason is
  'Why this device could not be encrypted for, when it could not. Empty for a healthy device.';
comment on column public.push_subscriptions.invalid_count is
  'Consecutive failures. Three retires the device rather than retrying a key that will never work.';
