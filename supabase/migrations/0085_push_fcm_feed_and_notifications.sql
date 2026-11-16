-- ---------------------------------------------------------------------------
-- 0085 — Push re-wake on repeated activity, follower post notifications,
--        accurate new-post feed counts, and Firebase Cloud Messaging (FCM)
--        token registration & secret-gated delivery RPCs.
--
-- Fixes four production issues at the database layer:
--
--   1. `bsdc.notify()` collapsed repeated notifications (e.g. a second DM in
--      an active thread, a re-reaction) via `ON CONFLICT DO UPDATE` without
--      resetting `pushed_at` to `NULL`, silently silencing every subsequent push
--      notification after the first one in that conversation.
--   2. `post_published` existed in the notification vocabulary and UI copy,
--      but no trigger emitted it when a followed member published a post.
--   3. `public.feed_new_count(p_since)` counted posts without excluding
--      soft-deleted posts, hidden channels, non-visible posts or blocked users.
--   4. `public.fcm_tokens` and its secret-gated delivery routines extend the
--      push pipeline to support FCM HTTP v1 tokens (Android app + FCM web push)
--      alongside RFC 8291 VAPID Web Push subscriptions, without storing raw
--      registration tokens in publicly readable columns.
-- ---------------------------------------------------------------------------

set search_path = public, bsdc, extensions, pg_temp;

-- ===========================================================================
-- 1. Separate FCM delivery tracking on notifications & reset on repeat notify
-- ===========================================================================
alter table public.notifications
  add column if not exists fcm_pushed_at timestamptz;

create index if not exists notifications_unpushed_fcm_idx
  on public.notifications (created_at)
  where fcm_pushed_at is null;

comment on column public.notifications.fcm_pushed_at is
  'When the push worker handed this notification to every registered FCM device. Null means it has not been delivered over FCM.';

create or replace function bsdc.notify(
  p_uid             text,
  p_actor_uid       text,
  p_kind            bsdc_notification_kind,
  p_post_id         uuid default null,
  p_comment_id      uuid default null,
  p_body            text default '',
  p_conversation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if p_uid is null or p_uid = p_actor_uid then
    return;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_uid = p_uid and blocked_uid = p_actor_uid)
       or (blocker_uid = p_actor_uid and blocked_uid = p_uid)
  ) then
    return;
  end if;

  if not coalesce(bsdc.notification_allowed(p_uid, p_kind), true) then
    return;
  end if;

  insert into public.notifications
      (uid, actor_uid, kind, post_id, comment_id, conversation_id, body)
  values
      (p_uid, p_actor_uid, p_kind, p_post_id, p_comment_id, p_conversation_id,
       left(coalesce(p_body, ''), 280))
  on conflict (
    uid, actor_uid, kind,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  do update set
    created_at    = now(),
    read_at       = null,
    pushed_at     = null,
    fcm_pushed_at = null,
    body          = excluded.body;
end;
$$;

revoke all on function bsdc.notify(
  text, text, bsdc_notification_kind, uuid, uuid, text, uuid
) from public, anon, authenticated;

-- ===========================================================================
-- 2. Notify followers when a member publishes a visible post
-- ===========================================================================
create or replace function bsdc.notify_post_published()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_follower text;
  v_preview  text;
begin
  if new.status <> 'published' or new.deleted_at is not null then
    return null;
  end if;

  if new.visibility not in ('public', 'followers') then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' and old.deleted_at is null then
    return null;
  end if;

  v_preview := left(coalesce(nullif(btrim(new.title), ''), new.excerpt, ''), 280);

  for v_follower in
    select f.follower_uid
      from public.follows f
      join public.profiles p on p.uid = f.follower_uid
     where f.followee_uid = new.author_uid
       and p.status = 'active'
       and (
         new.channel_id is null
         or exists (
           select 1
             from public.channels c
             join public.groups g on g.id = c.group_id
            where c.id = new.channel_id
              and (g.privacy = 'public' or bsdc.is_group_member(g.id, f.follower_uid))
         )
       )
  loop
    perform bsdc.notify(
      v_follower,
      new.author_uid,
      'post_published',
      new.id,
      null,
      v_preview
    );
  end loop;

  return null;
end;
$$;

revoke all on function bsdc.notify_post_published() from public, anon, authenticated;

drop trigger if exists posts_notify_followers on public.posts;
create trigger posts_notify_followers
  after insert or update of status, deleted_at on public.posts
  for each row execute function bsdc.notify_post_published();

-- ===========================================================================
-- 3. Accurate feed_new_count respecting trash, privacy, channels and blocks
-- ===========================================================================
create or replace function public.feed_new_count(p_since timestamptz)
returns integer
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select count(*)::integer
  from public.posts p
  where p.status = 'published'
    and p.deleted_at is null
    and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
    and bsdc.can_read_channel(p.channel_id)
    and p.published_at > p_since
    and p.author_uid <> coalesce(bsdc.current_uid(), '')
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = p.author_uid)
         or (b.blocker_uid = p.author_uid and b.blocked_uid = bsdc.current_uid())
    )
$$;

-- ===========================================================================
-- 4. Firebase Cloud Messaging (FCM) device registry & worker delivery RPCs
-- ===========================================================================
create table if not exists public.fcm_tokens (
  token          text primary key
                   check (char_length(btrim(token)) >= 20 and char_length(token) <= 4096),
  token_hash     text not null unique,
  uid            text not null references public.profiles (uid) on delete cascade,
  platform       text not null default 'web' check (platform in ('web', 'android', 'ios')),
  user_agent     text not null default '' check (char_length(user_agent) <= 400),
  language       text not null default 'bn' check (language in ('bn', 'en')),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz not null default now(),
  dead_at        timestamptz,
  invalid_reason text not null default '' check (char_length(invalid_reason) <= 120),
  invalid_count  integer not null default 0 check (invalid_count >= 0 and invalid_count <= 1000)
);

create index if not exists fcm_tokens_live_idx
  on public.fcm_tokens (uid)
  include (token, platform, language)
  where dead_at is null;

create index if not exists fcm_tokens_dead_idx
  on public.fcm_tokens (dead_at)
  where dead_at is not null;

alter table public.fcm_tokens enable row level security;

drop policy if exists fcm_tokens_own on public.fcm_tokens;
create policy fcm_tokens_own on public.fcm_tokens
  for all
  using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

-- Raw FCM registration tokens must never be readable through table SELECTs;
-- members inspect `token_hash` via `my_fcm_devices()` or column-scoped reads.
revoke all on public.fcm_tokens from public, anon, authenticated;
grant select (
  token_hash, uid, platform, user_agent, language,
  created_at, last_used_at, dead_at, invalid_reason, invalid_count
) on public.fcm_tokens to authenticated;
grant insert, update, delete on public.fcm_tokens to authenticated;

comment on table public.fcm_tokens is
  'FCM device registration tokens (Android Capacitor and FCM web push). Raw token is hidden from raw table reads and used only by secret-gated delivery RPCs.';

create or replace function public.register_fcm_token(
  p_token      text,
  p_platform   text default 'web',
  p_user_agent text default '',
  p_language   text default 'bn'
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_token    text := btrim(coalesce(p_token, ''));
  v_hash     text;
  v_platform text := case
    when lower(btrim(coalesce(p_platform, 'web'))) in ('android', 'ios', 'web')
      then lower(btrim(p_platform))
    else 'web'
  end;
  v_language text := case
    when lower(btrim(coalesce(p_language, 'bn'))) = 'en' then 'en'
    else 'bn'
  end;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_token) < 20 or char_length(v_token) > 4096 then
    raise exception 'a valid fcm token is required' using errcode = '22023';
  end if;

  v_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  insert into public.fcm_tokens (
    token, token_hash, uid, platform, user_agent, language
  ) values (
    v_token,
    v_hash,
    v_uid,
    v_platform,
    left(coalesce(p_user_agent, ''), 400),
    v_language
  )
  on conflict (token) do update set
    token_hash     = excluded.token_hash,
    uid            = excluded.uid,
    platform       = excluded.platform,
    user_agent     = excluded.user_agent,
    language       = excluded.language,
    last_used_at   = now(),
    dead_at        = null,
    invalid_reason = '',
    invalid_count  = 0;

  return v_hash;
end;
$$;

create or replace function public.forget_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.fcm_tokens
   where token = btrim(coalesce(p_token, ''))
     and uid = v_uid;
end;
$$;

create or replace function public.forget_fcm_device(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.fcm_tokens
   where token_hash = btrim(coalesce(p_token_hash, ''))
     and uid = v_uid;
end;
$$;

create or replace function public.my_fcm_devices()
returns table (
  token_hash   text,
  platform     text,
  user_agent   text,
  language     text,
  created_at   timestamptz,
  last_used_at timestamptz,
  state        text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    t.token_hash,
    t.platform,
    t.user_agent,
    t.language,
    t.created_at,
    t.last_used_at,
    case
      when t.dead_at is not null then 'dead'
      when t.invalid_count > 0 then 'invalid'
      else 'live'
    end
  from public.fcm_tokens t
  where t.uid = bsdc.current_uid()
  order by t.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Secret-gated FCM worker routines (matching 0072 Web Push contracts)
-- ---------------------------------------------------------------------------
create or replace function public.fcm_pending_devices(
  p_secret         text,
  p_limit          integer default 200,
  p_lookback_hours integer default 72
)
returns table (
  notification_id uuid,
  uid             text,
  token           text,
  platform        text,
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
set search_path = public, bsdc, extensions, pg_temp
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
      t.token,
      t.platform,
      t.language,
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
    join public.fcm_tokens t
      on t.uid = n.uid
     and t.dead_at is null
    left join public.profiles actor on actor.uid = n.actor_uid
    left join public.posts post on post.id = n.post_id
    join public.profiles recipient on recipient.uid = n.uid
   where n.fcm_pushed_at is null
     and recipient.status = 'active'
     and n.created_at > now() - make_interval(hours => v_lookback)
     and n.created_at <= now()
   order by n.created_at asc, t.token_hash asc
   limit v_limit;
end;
$$;

create or replace function public.fcm_mark_devices(p_secret text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications n
     set fcm_pushed_at = now()
   where n.fcm_pushed_at is null
     and n.id = any (coalesce(p_ids, array[]::uuid[]));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.fcm_kill_device(p_secret text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.fcm_tokens
     set dead_at = now()
   where token = btrim(coalesce(p_token, ''))
     and dead_at is null;
end;
$$;

create or replace function public.fcm_flag_invalid_device(p_secret text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.fcm_tokens t
     set invalid_count  = least(t.invalid_count + 1, 1000),
         invalid_reason = 'fcm-token-invalid',
         dead_at = case when t.invalid_count + 1 >= 3 then coalesce(t.dead_at, now()) else t.dead_at end
   where t.token = btrim(coalesce(p_token, ''))
     and t.dead_at is null;
end;
$$;

create or replace function public.fcm_sweep_dead_devices(p_secret text, p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer;
  v_days  integer := greatest(7, least(coalesce(p_days, 90), 3650));
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.fcm_tokens
   where dead_at is not null
     and dead_at < now() - make_interval(days => v_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.register_fcm_token(text, text, text, text) from public;
revoke all on function public.forget_fcm_token(text) from public;
revoke all on function public.forget_fcm_device(text) from public;
revoke all on function public.my_fcm_devices() from public;
revoke all on function public.fcm_pending_devices(text, integer, integer) from public;
revoke all on function public.fcm_mark_devices(text, uuid[]) from public;
revoke all on function public.fcm_kill_device(text, text) from public;
revoke all on function public.fcm_flag_invalid_device(text, text) from public;
revoke all on function public.fcm_sweep_dead_devices(text, integer) from public;

grant execute on function public.register_fcm_token(text, text, text, text) to authenticated;
grant execute on function public.forget_fcm_token(text) to authenticated;
grant execute on function public.forget_fcm_device(text) to authenticated;
grant execute on function public.my_fcm_devices() to authenticated;

grant execute on function public.fcm_pending_devices(text, integer, integer) to anon, authenticated;
grant execute on function public.fcm_mark_devices(text, uuid[]) to anon, authenticated;
grant execute on function public.fcm_kill_device(text, text) to anon, authenticated;
grant execute on function public.fcm_flag_invalid_device(text, text) to anon, authenticated;
grant execute on function public.fcm_sweep_dead_devices(text, integer) to anon, authenticated;
