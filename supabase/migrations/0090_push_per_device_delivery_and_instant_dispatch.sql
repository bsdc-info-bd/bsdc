-- ---------------------------------------------------------------------------
-- 0090 — Per-device push delivery tracking (no dropped multi-device pushes),
--        safe push_content lookback window, and non-blocking instant pg_net
--        dispatch triggered strictly on notification inserts / sequence re-arms.
-- ---------------------------------------------------------------------------

set search_path = public, bsdc, extensions, pg_temp;

-- ===========================================================================
-- 1. Internal per-device delivery receipts (never exposed to clients)
-- ===========================================================================
create table if not exists bsdc.push_device_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  endpoint        text not null,
  delivered_at    timestamptz not null default now(),
  primary key (notification_id, endpoint)
);

create table if not exists bsdc.fcm_device_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  token_hash      text not null,
  delivered_at    timestamptz not null default now(),
  primary key (notification_id, token_hash)
);

revoke all on table bsdc.push_device_deliveries from public, anon, authenticated;
revoke all on table bsdc.fcm_device_deliveries  from public, anon, authenticated;

create index if not exists idx_push_device_deliveries_endpoint
  on bsdc.push_device_deliveries (endpoint);

create index if not exists idx_fcm_device_deliveries_token_hash
  on bsdc.fcm_device_deliveries (token_hash);

create table if not exists bsdc.push_content_cursors (
  endpoint text primary key references public.push_subscriptions(endpoint) on delete cascade,
  last_seq bigint not null default 0
);

revoke all on table bsdc.push_content_cursors from public, anon, authenticated;

-- ===========================================================================
-- 2. Re-arming coalesced notifications clears per-device delivery receipts
-- ===========================================================================
create or replace function bsdc.notify_path(
  p_uid             text,
  p_actor_uid       text,
  p_kind            bsdc_notification_kind,
  p_post_id         uuid default null,
  p_comment_id      uuid default null,
  p_body            text default '',
  p_conversation_id uuid default null,
  p_target_url      text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_clean_url text := btrim(coalesce(p_target_url, ''));
  v_nid       uuid;
  v_updated   boolean := false;
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

  if v_clean_url = '' or v_clean_url !~ '^/[^/\\]' then
    v_clean_url := '';
  else
    v_clean_url := left(v_clean_url, 300);
  end if;

  insert into public.notifications
      (uid, actor_uid, kind, post_id, comment_id, conversation_id, body, target_url)
  values
      (p_uid, p_actor_uid, p_kind, p_post_id, p_comment_id, p_conversation_id,
       left(coalesce(p_body, ''), 280), v_clean_url)
  on conflict (
    uid, actor_uid, kind,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  do update set
    created_at    = now(),
    seq           = nextval('public.notifications_seq_seq'),
    read_at       = null,
    pushed_at     = null,
    fcm_pushed_at = null,
    body          = excluded.body,
    target_url    = case
                      when excluded.target_url <> '' then excluded.target_url
                      else public.notifications.target_url
                    end
  returning id, (xmax <> 0) into v_nid, v_updated;

  if v_updated and v_nid is not null then
    delete from bsdc.push_device_deliveries where notification_id = v_nid;
    delete from bsdc.fcm_device_deliveries  where notification_id = v_nid;
  end if;
end;
$$;

revoke all on function bsdc.notify_path(
  text, text, bsdc_notification_kind, uuid, uuid, text, uuid, text
) from public, anon, authenticated;

-- ===========================================================================
-- 3. Per-device pending selection & per-device delivery marking (Web Push + FCM)
-- ===========================================================================
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
      s.endpoint,
      s.p256dh,
      s.auth,
      s.language,
      n.kind::text,
      left(coalesce(n.body, ''), 280),
      coalesce(actor.display_name, ''),
      coalesce(actor.avatar_url, ''),
      case
        when nullif(n.target_url, '') is not null and n.target_url ~ '^/[^/\\]'
          then n.target_url
        when n.kind = 'follow' and actor.username is not null
          then '/@' || actor.username
        else bsdc.notification_target(n.kind, n.post_id, n.conversation_id, post.slug)
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
    join public.profiles recipient on recipient.uid = n.uid
   where n.pushed_at is null
     and recipient.status = 'active'
     and n.created_at > now() - make_interval(hours => v_lookback)
     and n.created_at <= now()
     and not exists (
       select 1
         from bsdc.push_device_deliveries d
        where d.notification_id = n.id
          and d.endpoint = s.endpoint
     )
   order by n.created_at asc, s.endpoint asc
   limit v_limit;
end;
$$;

revoke all on function public.push_pending_devices(text, integer, integer) from public;
grant execute on function public.push_pending_devices(text, integer, integer) to anon, authenticated;

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
        when nullif(n.target_url, '') is not null and n.target_url ~ '^/[^/\\]'
          then n.target_url
        when n.kind = 'follow' and actor.username is not null
          then '/@' || actor.username
        else bsdc.notification_target(n.kind, n.post_id, n.conversation_id, post.slug)
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
     and not exists (
       select 1
         from bsdc.fcm_device_deliveries d
        where d.notification_id = n.id
          and d.token_hash = t.token_hash
     )
   order by n.created_at asc, t.token_hash asc
   limit v_limit;
end;
$$;

revoke all on function public.fcm_pending_devices(text, integer, integer) from public;
grant execute on function public.fcm_pending_devices(text, integer, integer) to anon, authenticated;

create or replace function public.push_mark_device_deliveries(
  p_secret text,
  p_pairs  jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer := 0;
  v_ids   uuid[];
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    return 0;
  end if;

  with raw_pairs as (
    select distinct
      (elem ->> 'id')::uuid as notification_id,
      btrim(coalesce(elem ->> 'endpoint', '')) as endpoint
    from jsonb_array_elements(p_pairs) as elem
    where coalesce(elem ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and char_length(btrim(coalesce(elem ->> 'endpoint', ''))) >= 20
  ),
  valid_pairs as (
    select rp.notification_id, rp.endpoint
    from raw_pairs rp
    join public.notifications n on n.id = rp.notification_id
  ),
  inserted as (
    insert into bsdc.push_device_deliveries (notification_id, endpoint)
    select notification_id, endpoint from valid_pairs
    on conflict (notification_id, endpoint) do nothing
    returning notification_id
  )
  select count(*)::integer, coalesce(array_agg(distinct notification_id), array[]::uuid[])
    into v_count, v_ids
  from (
    select notification_id from inserted
    union
    select notification_id from valid_pairs
  ) touched;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.notifications n
       set pushed_at = now()
     where n.pushed_at is null
       and n.id = any (v_ids)
       and not exists (
         select 1
           from public.push_subscriptions s
          where s.uid = n.uid
            and s.dead_at is null
            and not exists (
              select 1
                from bsdc.push_device_deliveries d
               where d.notification_id = n.id
                 and d.endpoint = s.endpoint
            )
       );
  end if;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.push_mark_device_deliveries(text, jsonb) from public;
grant execute on function public.push_mark_device_deliveries(text, jsonb) to anon, authenticated;

create or replace function public.fcm_mark_device_deliveries(
  p_secret text,
  p_pairs  jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer := 0;
  v_ids   uuid[];
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    return 0;
  end if;

  with raw_pairs as (
    select distinct
      (elem ->> 'id')::uuid as notification_id,
      encode(
        extensions.digest(convert_to(btrim(coalesce(elem ->> 'token', '')), 'UTF8'), 'sha256'),
        'hex'
      ) as token_hash
    from jsonb_array_elements(p_pairs) as elem
    where coalesce(elem ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and char_length(btrim(coalesce(elem ->> 'token', ''))) >= 20
  ),
  valid_pairs as (
    select rp.notification_id, rp.token_hash
    from raw_pairs rp
    join public.notifications n on n.id = rp.notification_id
  ),
  inserted as (
    insert into bsdc.fcm_device_deliveries (notification_id, token_hash)
    select notification_id, token_hash from valid_pairs
    on conflict (notification_id, token_hash) do nothing
    returning notification_id
  )
  select count(*)::integer, coalesce(array_agg(distinct notification_id), array[]::uuid[])
    into v_count, v_ids
  from (
    select notification_id from inserted
    union
    select notification_id from valid_pairs
  ) touched;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.notifications n
       set fcm_pushed_at = now()
     where n.fcm_pushed_at is null
       and n.id = any (v_ids)
       and not exists (
         select 1
           from public.fcm_tokens t
          where t.uid = n.uid
            and t.dead_at is null
            and not exists (
              select 1
                from bsdc.fcm_device_deliveries d
               where d.notification_id = n.id
                 and d.token_hash = t.token_hash
            )
       );
  end if;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.fcm_mark_device_deliveries(text, jsonb) from public;
grant execute on function public.fcm_mark_device_deliveries(text, jsonb) to anon, authenticated;

-- Retiring a dead/invalid device also finalizes any notifications that were
-- already delivered to all remaining live devices for that member.
create or replace function public.push_kill_device(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.push_subscriptions
     set dead_at = now()
   where endpoint = btrim(coalesce(p_endpoint, ''))
     and dead_at is null
  returning uid into v_uid;

  if v_uid is not null then
    update public.notifications n
       set pushed_at = now()
     where n.uid = v_uid
       and n.pushed_at is null
       and exists (
         select 1 from bsdc.push_device_deliveries d where d.notification_id = n.id
       )
       and not exists (
         select 1
           from public.push_subscriptions s
          where s.uid = n.uid
            and s.dead_at is null
            and not exists (
              select 1
                from bsdc.push_device_deliveries d2
               where d2.notification_id = n.id
                 and d2.endpoint = s.endpoint
            )
       );
  end if;
end;
$$;

revoke all on function public.push_kill_device(text, text) from public;
grant execute on function public.push_kill_device(text, text) to anon, authenticated;

create or replace function public.push_flag_invalid_device(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text;
  v_dead_at timestamptz;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.push_subscriptions s
     set invalid_count  = least(s.invalid_count + 1, 1000),
         invalid_reason = 'keys-unusable',
         dead_at = case when s.invalid_count + 1 >= 3 then coalesce(s.dead_at, now()) else s.dead_at end
   where s.endpoint = btrim(coalesce(p_endpoint, ''))
     and s.dead_at is null
  returning s.uid, s.dead_at into v_uid, v_dead_at;

  if v_uid is not null and v_dead_at is not null then
    update public.notifications n
       set pushed_at = now()
     where n.uid = v_uid
       and n.pushed_at is null
       and exists (
         select 1 from bsdc.push_device_deliveries d where d.notification_id = n.id
       )
       and not exists (
         select 1
           from public.push_subscriptions s2
          where s2.uid = n.uid
            and s2.dead_at is null
            and not exists (
              select 1
                from bsdc.push_device_deliveries d2
               where d2.notification_id = n.id
                 and d2.endpoint = s2.endpoint
            )
       );
  end if;
end;
$$;

revoke all on function public.push_flag_invalid_device(text, text) from public;
grant execute on function public.push_flag_invalid_device(text, text) to anon, authenticated;

create or replace function public.fcm_kill_device(p_secret text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.fcm_tokens
     set dead_at = now()
   where token = btrim(coalesce(p_token, ''))
     and dead_at is null
  returning uid into v_uid;

  if v_uid is not null then
    update public.notifications n
       set fcm_pushed_at = now()
     where n.uid = v_uid
       and n.fcm_pushed_at is null
       and exists (
         select 1 from bsdc.fcm_device_deliveries d where d.notification_id = n.id
       )
       and not exists (
         select 1
           from public.fcm_tokens t
          where t.uid = n.uid
            and t.dead_at is null
            and not exists (
              select 1
                from bsdc.fcm_device_deliveries d2
               where d2.notification_id = n.id
                 and d2.token_hash = t.token_hash
            )
       );
  end if;
end;
$$;

revoke all on function public.fcm_kill_device(text, text) from public;
grant execute on function public.fcm_kill_device(text, text) to anon, authenticated;

create or replace function public.fcm_flag_invalid_device(p_secret text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text;
  v_dead_at timestamptz;
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.fcm_tokens t
     set invalid_count  = least(t.invalid_count + 1, 1000),
         invalid_reason = 'fcm-token-invalid',
         dead_at = case when t.invalid_count + 1 >= 3 then coalesce(t.dead_at, now()) else t.dead_at end
   where t.token = btrim(coalesce(p_token, ''))
     and t.dead_at is null
  returning t.uid, t.dead_at into v_uid, v_dead_at;

  if v_uid is not null and v_dead_at is not null then
    update public.notifications n
       set fcm_pushed_at = now()
     where n.uid = v_uid
       and n.fcm_pushed_at is null
       and exists (
         select 1 from bsdc.fcm_device_deliveries d where d.notification_id = n.id
       )
       and not exists (
         select 1
           from public.fcm_tokens t2
          where t2.uid = n.uid
            and t2.dead_at is null
            and not exists (
              select 1
                from bsdc.fcm_device_deliveries d2
               where d2.notification_id = n.id
                 and d2.token_hash = t2.token_hash
            )
       );
  end if;
end;
$$;

revoke all on function public.fcm_flag_invalid_device(text, text) from public;
grant execute on function public.fcm_flag_invalid_device(text, text) to anon, authenticated;

-- ===========================================================================
-- 4. Cursor-tracked push_content for empty Web Push wake-ups (exact & deduped)
-- ===========================================================================
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
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_subscription public.push_subscriptions;
  v_cursor       bigint;
  v_max_seq      bigint;
  v_limit        integer := greatest(1, least(coalesce(p_limit, 5), 20));
begin
  select *
    into v_subscription
    from public.push_subscriptions s
   where s.endpoint = btrim(coalesce(p_endpoint, ''))
     and s.dead_at is null;

  if not found then
    return;
  end if;

  select c.last_seq
    into v_cursor
    from bsdc.push_content_cursors c
   where c.endpoint = v_subscription.endpoint;

  select max(sub.seq)
    into v_max_seq
    from (
      select n.seq
        from public.notifications n
       where n.uid = v_subscription.uid
         and n.read_at is null
         and (
           (v_cursor is not null and n.seq > v_cursor)
           or (v_cursor is null and n.created_at >= v_subscription.last_used_at)
         )
       order by n.created_at desc, n.seq desc
       limit v_limit
    ) sub;

  return query
    select
      n.id,
      n.kind::text,
      n.body,
      case
        when nullif(n.target_url, '') is not null and n.target_url ~ '^/[^/\\]'
          then n.target_url
        when n.kind = 'follow' and a.username is not null
          then '/@' || a.username
        else bsdc.notification_target(n.kind, n.post_id, n.conversation_id, p.slug)
      end as url,
      coalesce(a.display_name, '') as actor_name,
      coalesce(a.avatar_url, '')   as actor_avatar,
      v_subscription.language,
      n.created_at
    from public.notifications n
    left join public.posts p on p.id = n.post_id
    left join public.profiles a on a.uid = n.actor_uid
   where n.uid = v_subscription.uid
     and n.read_at is null
     and (
       (v_cursor is not null and n.seq > v_cursor)
       or (v_cursor is null and n.created_at >= v_subscription.last_used_at)
     )
   order by n.created_at desc, n.seq desc
   limit v_limit;

  if v_max_seq is not null then
    insert into bsdc.push_content_cursors (endpoint, last_seq)
    values (v_subscription.endpoint, v_max_seq)
    on conflict (endpoint) do update
      set last_seq = greatest(bsdc.push_content_cursors.last_seq, excluded.last_seq);
  end if;

  update public.push_subscriptions
     set last_used_at = clock_timestamp()
   where endpoint = v_subscription.endpoint;
end;
$$;

-- ===========================================================================
-- 5. Non-blocking instant pg_net dispatch triggered only on new/re-armed rows
-- ===========================================================================
create or replace function bsdc.trigger_instant_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_secret text;
  v_url    text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return null;
  end if;

  select value into v_secret from bsdc.push_settings where name = 'flush_secret';
  if char_length(coalesce(v_secret, '')) < 32 then
    return null;
  end if;

  select value into v_url from bsdc.push_settings where name = 'worker_url';
  v_url := coalesce(nullif(btrim(v_url), ''), 'https://push.api.bsdc.info.bd/run');
  if v_url !~ '^https://' then
    return null;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'authorization', 'Bearer ' || v_secret,
        'content-type', 'application/json'
      ),
      timeout_milliseconds := 2500
    );
  exception when others then
    -- Network or pg_net dispatch must never roll back a member's action.
    null;
  end;

  return null;
end;
$$;

revoke all on function bsdc.trigger_instant_push_dispatch() from public, anon, authenticated;

drop trigger if exists notifications_instant_push on public.notifications;
create trigger notifications_instant_push
  after insert or update of seq on public.notifications
  for each statement execute function bsdc.trigger_instant_push_dispatch();
