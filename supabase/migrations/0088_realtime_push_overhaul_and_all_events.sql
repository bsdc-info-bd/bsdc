-- ---------------------------------------------------------------------------
-- 0088 — Complete A-to-Z notification coverage, unified deep-link targets,
--        @username mention extraction in comments & chats, reaction update
--        re-notification, rich non-text message previews, and instant pg_net
--        push wake-up dispatch.
-- ---------------------------------------------------------------------------

set search_path = public, bsdc, extensions, pg_temp;

-- ===========================================================================
-- 1. Optional deep-link target_url on notifications & unified route builder
-- ===========================================================================
alter table public.notifications
  add column if not exists target_url text not null default '',
  add column if not exists fcm_pushed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_target_url_relative'
  ) then
    alter table public.notifications
      add constraint notifications_target_url_relative
      check (
        target_url = ''
        or (
          char_length(target_url) <= 300
          and target_url ~ '^/[^/\\]'
        )
      );
  end if;
end;
$$;

create or replace function bsdc.notification_target(
  p_kind            bsdc_notification_kind,
  p_post_id         uuid,
  p_conversation_id uuid,
  p_post_slug       text default null
)
returns text
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select case
    when p_kind = 'message' and p_conversation_id is not null
      then '/messages/' || p_conversation_id::text
    when p_kind = 'message' then '/messages'
    when p_kind = 'moderation' then '/moderation'
    when p_kind = 'follow' then '/people'
    when p_kind = 'order' then '/orders'
    when p_kind in ('review', 'payout') then '/vendor'
    when p_kind = 'course' then '/learn'
    when p_kind = 'job' then '/jobs'
    when p_kind = 'event' then '/events'
    when p_kind = 'certificate' then '/verify'
    when p_kind = 'group_invite' then '/groups'
    when p_kind = 'feedback' and p_post_id is not null and coalesce(p_post_slug, '') <> ''
      then '/p/' || p_post_slug
    when p_kind = 'feedback' and p_post_id is not null
      then '/p/' || p_post_id::text
    when p_kind = 'feedback' then '/notifications'
    when p_post_id is null then '/notifications'
    when coalesce(p_post_slug, '') <> '' then '/p/' || p_post_slug
    else '/p/' || p_post_id::text
  end;
$$;

-- ===========================================================================
-- 2. Updated preferences gate & notify helpers
-- ===========================================================================
create or replace function bsdc.notification_allowed(
  p_uid  text,
  p_kind bsdc_notification_kind
)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select case p_kind
    when 'follow'         then coalesce((p.notifications ->> 'followers')::boolean, true)
    when 'comment'        then coalesce((p.notifications ->> 'comments')::boolean, true)
    when 'reply'          then coalesce((p.notifications ->> 'comments')::boolean, true)
    when 'mention'        then coalesce((p.notifications ->> 'mentions')::boolean, true)
    when 'mention_group'  then coalesce((p.notifications ->> 'mentions')::boolean, true)
    when 'message'        then coalesce((p.notifications ->> 'messages')::boolean, true)
    when 'post_published' then coalesce((p.notifications ->> 'followers')::boolean, true)
    when 'reaction'       then coalesce((p.notifications ->> 'reactions')::boolean, true)
    when 'bookmark'       then coalesce((p.notifications ->> 'reactions')::boolean, true)
    when 'share'          then coalesce((p.notifications ->> 'reactions')::boolean, true)
    else true
  end
  from public.profiles p
  where p.uid = p_uid;
$$;

revoke all on function bsdc.notification_allowed(text, bsdc_notification_kind)
  from public, anon, authenticated;

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
                    end;
end;
$$;

revoke all on function bsdc.notify_path(
  text, text, bsdc_notification_kind, uuid, uuid, text, uuid, text
) from public, anon, authenticated;

-- Keep the exact 7-arg signature expected by existing callers & proof t19.
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
  perform bsdc.notify_path(
    p_uid,
    p_actor_uid,
    p_kind,
    p_post_id,
    p_comment_id,
    p_body,
    p_conversation_id,
    ''
  );
end;
$$;

revoke all on function bsdc.notify(
  text, text, bsdc_notification_kind, uuid, uuid, text, uuid
) from public, anon, authenticated;

-- ===========================================================================
-- 3. Unified URL resolution across my_inbox, push_pending_devices,
--    fcm_pending_devices, push_content, and notification_target_for
-- ===========================================================================
create or replace function bsdc.notification_target_for(p_notification_id uuid)
returns text
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select case
    when nullif(n.target_url, '') is not null and n.target_url ~ '^/[^/\\]'
      then n.target_url
    else bsdc.notification_target(
      n.kind, n.post_id, n.conversation_id,
      (select p.slug from public.posts p where p.id = n.post_id)
    )
  end
  from public.notifications n
  where n.id = p_notification_id;
$$;

create or replace function public.my_inbox(p_limit integer default 50)
returns table (
  notification_id  uuid,
  kind             bsdc_notification_kind,
  actor_uid        text,
  actor_username   text,
  actor_name       text,
  actor_avatar     text,
  body             text,
  post_id          uuid,
  comment_id       uuid,
  conversation_id  uuid,
  target_url       text,
  read_at          timestamptz,
  last_at          timestamptz,
  created_at       timestamptz,
  occurrences      integer,
  unread_count     integer,
  is_unread        boolean
)
language sql
stable
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
  with mine as (
    select
      n.id, n.kind, n.actor_uid, n.body, n.post_id, n.comment_id, n.conversation_id,
      n.target_url, n.read_at, n.created_at, n.seq,
      n.kind::text || '|' ||
        coalesce(n.conversation_id::text, n.post_id::text, nullif(n.target_url, ''), n.actor_uid, n.id::text) each
    from public.notifications n
    where n.uid = bsdc.current_uid()
      and (
        n.post_id is null
        or exists (
          select 1 from public.posts p
          where p.id = n.post_id
            and p.status = 'published'
            and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
        )
      )
      and (
        n.conversation_id is null
        or exists (
          select 1 from public.conversations c
          where c.id = n.conversation_id
            and bsdc.is_conversation_member(c.id, bsdc.current_uid())
        )
      )
  ),
  grouped as (
    select
      mine.each,
      count(*)::integer                                    as occurrences,
      count(*) filter (where mine.read_at is null)::integer as unread_count,
      max(mine.created_at)                                 as last_at,
      (array_agg(mine.id order by mine.created_at desc, mine.seq desc))[1]                as notification_id,
      (array_agg(mine.kind order by mine.created_at desc, mine.seq desc))[1]              as kind,
      (array_agg(mine.actor_uid order by mine.created_at desc, mine.seq desc))[1]         as actor_uid,
      (array_agg(mine.body order by mine.created_at desc, mine.seq desc))[1]              as body,
      (array_agg(mine.post_id order by mine.created_at desc, mine.seq desc))[1]           as post_id,
      (array_agg(mine.comment_id order by mine.created_at desc, mine.seq desc))[1]        as comment_id,
      (array_agg(mine.conversation_id order by mine.created_at desc, mine.seq desc))[1]   as conversation_id,
      (array_agg(mine.target_url order by mine.created_at desc, mine.seq desc))[1]        as stored_target_url,
      (array_agg(mine.read_at order by mine.created_at desc, mine.seq desc))[1]            as read_at,
      (array_agg(mine.created_at order by mine.created_at desc, mine.seq desc))[1]        as created_at
    from mine
    group by mine.each
  )
  select
    g.notification_id,
    g.kind,
    g.actor_uid,
    p.username::text,
    coalesce(nullif(p.display_name, ''), '') as actor_name,
    coalesce(p.avatar_url, '')               as actor_avatar,
    g.body,
    g.post_id,
    g.comment_id,
    g.conversation_id,
    case
      when nullif(g.stored_target_url, '') is not null and g.stored_target_url ~ '^/[^/\\]'
        then g.stored_target_url
      else bsdc.notification_target(
        g.kind,
        g.post_id,
        g.conversation_id,
        (select po.slug from public.posts po where po.id = g.post_id)
      )
    end as target_url,
    g.read_at,
    g.last_at,
    g.created_at,
    g.occurrences,
    g.unread_count,
    g.unread_count > 0 as is_unread
  from grouped g
  left join public.profiles p on p.uid = g.actor_uid
  order by g.last_at desc, g.created_at desc, g.notification_id
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

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
   order by n.created_at asc, s.endpoint asc
   limit v_limit;
end;
$$;

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
   order by n.created_at asc, t.token_hash asc
   limit v_limit;
end;
$$;

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
     and n.created_at > v_subscription.last_used_at
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 5), 20));

  update public.push_subscriptions
     set last_used_at = now()
   where endpoint = v_subscription.endpoint;
end;
$$;

-- ===========================================================================
-- 4. Shared @username mention extraction & social triggers
-- ===========================================================================
create or replace function bsdc.extract_mentioned_uids(
  p_text        text,
  p_exclude_uid text default null
)
returns text[]
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(array_agg(distinct p.uid), array[]::text[])
  from (
    select lower((m)[1]) as handle
    from regexp_matches(coalesce(p_text, ''), '(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,30})', 'g') as m
  ) handles
  join public.profiles p
    on lower(p.username) = handles.handle
   and p.status = 'active'
   and p.uid <> coalesce(p_exclude_uid, '');
$$;

revoke all on function bsdc.extract_mentioned_uids(text, text)
  from public, anon, authenticated;

-- 4a. Post reactions: also notify on UPDATE of reaction kind
create or replace function bsdc.sync_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_author text;
begin
  if tg_op = 'INSERT' then
    update public.posts
      set likes_count = likes_count + 1
      where id = new.post_id
      returning author_uid into v_author;
    perform bsdc.notify(v_author, new.uid, 'reaction', new.post_id, null, new.reaction::text);
  elsif tg_op = 'UPDATE' and old.reaction is distinct from new.reaction then
    select author_uid into v_author from public.posts where id = new.post_id;
    perform bsdc.notify(v_author, new.uid, 'reaction', new.post_id, null, new.reaction::text);
  elsif tg_op = 'DELETE' then
    update public.posts
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_reactions_sync on public.post_reactions;
create trigger post_reactions_sync
  after insert or update of reaction or delete on public.post_reactions
  for each row execute function bsdc.sync_reaction_counts();

-- 4b. Comments & replies: avoid double notification when replying to post author's own comment
--     and notify @mentioned members in comments/replies
create or replace function bsdc.sync_comment_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_author        text;
  v_channel_id    uuid;
  v_parent_author text := null;
  v_mentioned     text;
  v_mention_kind  bsdc_notification_kind;
begin
  if tg_op = 'INSERT' then
    update public.posts
      set comments_count = comments_count + 1
      where id = new.post_id
      returning author_uid, channel_id into v_author, v_channel_id;

    if new.parent_id is not null then
      update public.comments
        set replies_count = replies_count + 1
        where id = new.parent_id
        returning author_uid into v_parent_author;
      perform bsdc.notify(
        v_parent_author, new.author_uid, 'reply', new.post_id, new.id, left(new.body, 280)
      );
    end if;

    if v_author is distinct from v_parent_author then
      perform bsdc.notify(
        v_author, new.author_uid, 'comment', new.post_id, new.id, left(new.body, 280)
      );
    end if;

    v_mention_kind := case
      when v_channel_id is not null then 'mention_group'::bsdc_notification_kind
      else 'mention'::bsdc_notification_kind
    end;
    foreach v_mentioned in array bsdc.extract_mentioned_uids(new.body, new.author_uid) loop
      perform bsdc.notify(
        v_mentioned, new.author_uid, v_mention_kind, new.post_id, new.id, left(new.body, 280)
      );
    end loop;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts
        set comments_count = greatest(comments_count - 1, 0)
        where id = new.post_id;
      if new.parent_id is not null then
        update public.comments
          set replies_count = greatest(replies_count - 1, 0)
          where id = new.parent_id;
      end if;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.posts
        set comments_count = comments_count + 1
        where id = new.post_id;
      if new.parent_id is not null then
        update public.comments
          set replies_count = replies_count + 1
          where id = new.parent_id;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.posts
        set comments_count = greatest(comments_count - 1, 0)
        where id = old.post_id;
      if old.parent_id is not null then
        update public.comments
          set replies_count = greatest(replies_count - 1, 0)
          where id = old.parent_id;
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- 4c. Q&A answer acceptance -> feedback kind
create or replace function public.mark_answer(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_comment public.comments%rowtype;
  v_post    public.posts%rowtype;
  v_next    boolean;
begin
  select * into v_comment from public.comments where id = p_comment_id;
  if not found then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  select * into v_post from public.posts where id = v_comment.post_id;
  if v_post.author_uid <> v_uid then
    raise exception 'only the author may accept an answer' using errcode = '42501';
  end if;
  if v_post.kind <> 'question' then
    raise exception 'only questions have answers' using errcode = '22023';
  end if;

  v_next := not v_comment.is_answer;
  update public.comments set is_answer = false where post_id = v_comment.post_id and is_answer;
  if v_next then
    update public.comments set is_answer = true where id = p_comment_id;
    perform bsdc.notify(
      v_comment.author_uid, v_uid, 'feedback', v_comment.post_id, p_comment_id,
      'Your answer was accepted on: ' || left(coalesce(nullif(btrim(v_post.title), ''), 'a question'), 180)
    );
  end if;
  return v_next;
end;
$$;

-- 4d. Bookmarks notify post author
create or replace function bsdc.notify_bookmark()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_author text;
  v_title  text;
begin
  select author_uid, left(coalesce(nullif(btrim(title), ''), excerpt, ''), 200)
    into v_author, v_title
    from public.posts
   where id = new.post_id;

  perform bsdc.notify(v_author, new.uid, 'bookmark', new.post_id, null, v_title);
  return null;
end;
$$;

revoke all on function bsdc.notify_bookmark() from public, anon, authenticated;

drop trigger if exists bookmarks_notify on public.bookmarks;
create trigger bookmarks_notify
  after insert on public.bookmarks
  for each row execute function bsdc.notify_bookmark();

-- 4e. Published posts notify followers + group channel members
create or replace function bsdc.notify_post_published()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_follower   text;
  v_preview    text;
  v_group_id   uuid := null;
  v_group_slug text := null;
begin
  if new.status <> 'published' or new.deleted_at is not null then
    return null;
  end if;

  if new.visibility = 'private' and new.channel_id is null then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' and old.deleted_at is null then
    return null;
  end if;

  v_preview := left(coalesce(nullif(btrim(new.title), ''), new.excerpt, ''), 280);

  if new.channel_id is not null then
    select g.id, g.slug into v_group_id, v_group_slug
      from public.channels c
      join public.groups g on g.id = c.group_id
     where c.id = new.channel_id;
  end if;

  if new.visibility in ('public', 'followers') then
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
  end if;

  if v_group_id is not null then
    for v_follower in
      select gm.uid
        from public.group_members gm
        join public.profiles p on p.uid = gm.uid
       where gm.group_id = v_group_id
         and gm.uid <> new.author_uid
         and p.status = 'active'
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
  end if;

  return null;
end;
$$;

revoke all on function bsdc.notify_post_published() from public, anon, authenticated;

-- 4f. Page follows notify page owner
create or replace function bsdc.notify_page_follow()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner text;
  v_name  text;
  v_slug  text;
begin
  select owner_uid, name, slug into v_owner, v_name, v_slug
    from public.pages
   where id = new.page_id;

  perform bsdc.notify_path(
    v_owner,
    new.uid,
    'follow',
    null,
    null,
    'Followed page: ' || left(coalesce(v_name, ''), 180),
    null,
    case when coalesce(v_slug, '') <> '' then '/pages/' || v_slug else '/people' end
  );
  return null;
end;
$$;

revoke all on function bsdc.notify_page_follow() from public, anon, authenticated;

drop trigger if exists page_followers_notify on public.page_followers;
create trigger page_followers_notify
  after insert on public.page_followers
  for each row execute function bsdc.notify_page_follow();

-- ===========================================================================
-- 5. Messenger: non-text previews, @mentions, message reactions & pins
-- ===========================================================================
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body            text,
  p_kind            bsdc_message_kind default 'text',
  p_media_url       text default '',
  p_media_name      text default '',
  p_code_language   text default '',
  p_reply_to        uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid         text := bsdc.current_uid();
  v_message     public.messages%rowtype;
  v_conv_kind   bsdc_conversation_kind;
  v_member      text;
  v_preview     text;
  v_mentioned   text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not bsdc.is_conversation_member(p_conversation_id, v_uid) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;

  select kind into v_conv_kind from public.conversations where id = p_conversation_id;

  insert into public.messages (
    conversation_id, sender_uid, kind, body, media_url, media_name, code_language, reply_to
  )
  values (
    p_conversation_id, v_uid, p_kind, coalesce(p_body, ''), coalesce(p_media_url, ''),
    coalesce(p_media_name, ''), coalesce(p_code_language, ''), p_reply_to
  )
  returning * into v_message;

  v_preview := left(btrim(coalesce(v_message.body, '')), 280);
  if v_preview = '' then
    v_preview := case v_message.kind
      when 'image'   then 'Sent an image'
      when 'file'    then case when btrim(v_message.media_name) <> '' then 'Shared ' || left(v_message.media_name, 120) else 'Shared a file' end
      when 'snippet' then case when btrim(v_message.code_language) <> '' then 'Shared ' || v_message.code_language || ' snippet' else 'Shared a code snippet' end
      else 'Sent a message'
    end;
  end if;

  for v_member in
    select cm.uid from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.uid <> v_uid
      and cm.left_at is null
      and (cm.muted_until is null or cm.muted_until < now())
  loop
    perform bsdc.notify(
      v_member, v_uid, 'message', null, null, v_preview, p_conversation_id
    );
  end loop;

  if v_conv_kind = 'group' and btrim(coalesce(v_message.body, '')) <> '' then
    foreach v_mentioned in array bsdc.extract_mentioned_uids(v_message.body, v_uid) loop
      if exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = p_conversation_id
          and cm.uid = v_mentioned
          and cm.left_at is null
          and (cm.muted_until is null or cm.muted_until < now())
      ) then
        perform bsdc.notify_path(
          v_mentioned,
          v_uid,
          'mention_group',
          null,
          null,
          v_preview,
          p_conversation_id,
          '/messages/' || p_conversation_id::text
        );
      end if;
    end loop;
  end if;

  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and uid = v_uid;

  return v_message;
end;
$$;

create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_reaction   text
)
returns table (reacted boolean, reaction text, total integer)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid  text := bsdc.current_uid();
  v_like text := coalesce(nullif(btrim(p_reaction), ''), 'like');
  v_msg  public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_msg from public.messages m
  where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid);
  if not found then
    raise exception 'message not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.message_reactions r
    where r.message_id = p_message_id and r.uid = v_uid and r.reaction = v_like
  ) then
    delete from public.message_reactions r
      where r.message_id = p_message_id and r.uid = v_uid and r.reaction = v_like;
    return query select false, v_like, (
      select count(*)::integer from public.message_reactions r where r.message_id = p_message_id
    );
    return;
  end if;

  insert into public.message_reactions (message_id, uid, reaction)
    values (p_message_id, v_uid, v_like)
    on conflict (message_id, uid, reaction) do nothing;

  perform bsdc.notify_path(
    v_msg.sender_uid,
    v_uid,
    'reaction',
    null,
    null,
    left(v_like || ': ' || coalesce(nullif(btrim(v_msg.body), ''), 'message'), 280),
    v_msg.conversation_id,
    '/messages/' || v_msg.conversation_id::text
  );

  return query select true, v_like, (
    select count(*)::integer from public.message_reactions r where r.message_id = p_message_id
  );
end;
$$;

create or replace function public.toggle_message_pin(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_msg    public.messages%rowtype;
  v_member text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_msg
  from public.messages m
  where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid);
  if not found then
    raise exception 'message not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.message_pins p
    where p.conversation_id = v_msg.conversation_id and p.message_id = p_message_id
  ) then
    delete from public.message_pins p
      where p.conversation_id = v_msg.conversation_id and p.message_id = p_message_id;
    return false;
  end if;

  insert into public.message_pins (conversation_id, message_id, pinned_by)
    values (v_msg.conversation_id, p_message_id, v_uid)
    on conflict (conversation_id, message_id) do nothing;

  for v_member in
    select cm.uid from public.conversation_members cm
    where cm.conversation_id = v_msg.conversation_id
      and cm.uid <> v_uid
      and cm.left_at is null
      and (cm.muted_until is null or cm.muted_until < now())
  loop
    perform bsdc.notify_path(
      v_member,
      v_uid,
      'message',
      null,
      null,
      left('Pinned: ' || coalesce(nullif(btrim(v_msg.body), ''), 'message'), 280),
      v_msg.conversation_id,
      '/messages/' || v_msg.conversation_id::text
    );
  end loop;

  return true;
end;
$$;

-- ===========================================================================
-- 6. Marketplace & Vendor: orders, cancellations, reviews, payouts
-- ===========================================================================
create or replace function public.place_order(
  p_address_id     uuid,
  p_payment_method bsdc_payment_method default 'cash_on_delivery',
  p_note           text default ''
)
returns table (order_id uuid, code text, total integer)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_cart     uuid;
  v_address  public.addresses%rowtype;
  v_shop     record;
  v_item     record;
  v_order    uuid;
  v_code     text;
  v_subtotal integer;
  v_shipping integer;
  v_total    integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_address from public.addresses where id = p_address_id and uid = v_uid;
  if not found then
    raise exception 'delivery address not found' using errcode = 'P0002';
  end if;

  v_cart := bsdc.cart_for(v_uid);
  if not exists (select 1 from public.cart_items where cart_id = v_cart) then
    raise exception 'your cart is empty' using errcode = '22023';
  end if;

  for v_shop in
    select s.id, s.name, s.owner_uid, s.shipping_flat, s.free_shipping_over, s.status
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.shops s on s.id = p.shop_id
    where ci.cart_id = v_cart
    group by s.id, s.name, s.owner_uid, s.shipping_flat, s.free_shipping_over, s.status
  loop
    if v_shop.status <> 'active' then
      raise exception 'this shop is not currently trading' using errcode = 'P0002';
    end if;

    v_subtotal := 0;
    v_code := bsdc.new_order_code();

    insert into public.orders (
      code, uid, shop_id, payment_method, subtotal, shipping, discount, total,
      recipient, phone, address_line, city, note
    ) values (
      v_code, v_uid, v_shop.id, p_payment_method, 0, 0, 0, 0,
      v_address.recipient, v_address.phone,
      btrim(v_address.line1 || ' ' || v_address.line2), v_address.city,
      left(coalesce(p_note, ''), 500)
    ) returning id into v_order;

    for v_item in
      select ci.product_id, ci.quantity
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      where ci.cart_id = v_cart and p.shop_id = v_shop.id
      order by ci.added_at
    loop
      declare
        v_product public.products%rowtype;
        v_line    integer;
      begin
        select * into v_product from public.products where id = v_item.product_id for update;
        if v_product.status <> 'active' then
          raise exception 'product % is no longer for sale', v_product.title using errcode = 'P0002';
        end if;
        if not v_product.is_digital and v_product.stock < v_item.quantity then
          raise exception 'only % left of %', v_product.stock, v_product.title using errcode = '22023';
        end if;

        v_line := v_product.price * v_item.quantity;
        v_subtotal := v_subtotal + v_line;

        insert into public.order_items (order_id, product_id, title, unit_price, quantity, line_total)
          values (v_order, v_product.id, v_product.title, v_product.price, v_item.quantity, v_line);

        if not v_product.is_digital then
          update public.products
            set stock = stock - v_item.quantity,
                sold_count = sold_count + v_item.quantity,
                status = case when stock - v_item.quantity = 0 then 'out_of_stock'::bsdc_product_status
                              else status end
            where id = v_product.id;
        else
          update public.products set sold_count = sold_count + v_item.quantity where id = v_product.id;
        end if;
      end;
    end loop;

    v_shipping := case
      when v_shop.free_shipping_over is not null and v_subtotal >= v_shop.free_shipping_over then 0
      else v_shop.shipping_flat
    end;
    v_total := v_subtotal + v_shipping;

    update public.orders
      set subtotal = v_subtotal, shipping = v_shipping, total = v_total
      where id = v_order;

    update public.shops set orders_count = orders_count + 1 where id = v_shop.id;
    perform bsdc.notify_path(
      v_shop.owner_uid,
      v_uid,
      'order',
      null,
      null,
      'New order ' || v_code,
      null,
      '/vendor'
    );

    order_id := v_order;
    code := v_code;
    total := v_total;
    return next;
  end loop;

  delete from public.cart_items where cart_id = v_cart;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_order public.orders%rowtype;
  v_item  record;
  v_owner text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.uid <> v_uid and not bsdc.is_staff() then
    raise exception 'this is not your order' using errcode = '42501';
  end if;
  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'this order can no longer be cancelled' using errcode = '22023';
  end if;

  for v_item in
    select product_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.products
      set stock = stock + v_item.quantity,
          sold_count = greatest(sold_count - v_item.quantity, 0),
          status = case when status = 'out_of_stock' then 'active'::bsdc_product_status else status end
      where id = v_item.product_id and not is_digital;
  end loop;

  update public.orders
    set status = 'cancelled', cancelled_at = now(),
        cancel_reason = left(coalesce(p_reason, ''), 300)
    where id = p_order_id;

  select owner_uid into v_owner from public.shops where id = v_order.shop_id;
  if v_uid = v_order.uid then
    perform bsdc.notify_path(
      v_owner, v_uid, 'order', null, null,
      left('Order ' || v_order.code || ' cancelled by buyer', 280),
      null, '/vendor'
    );
  else
    perform bsdc.notify_path(
      v_order.uid, v_uid, 'order', null, null,
      left('Order ' || v_order.code || ' cancelled', 280),
      null, '/orders'
    );
  end if;
end;
$$;

create or replace function public.advance_order(
  p_order_id uuid,
  p_status   bsdc_order_status,
  p_note     text default ''
)
returns bsdc_order_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_order public.orders%rowtype;
  v_owner text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select owner_uid into v_owner from public.shops where id = v_order.shop_id;
  if v_owner is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'this order belongs to another shop' using errcode = '42501';
  end if;

  if not bsdc.order_transition_allowed(v_order.status, p_status) then
    raise exception 'an order cannot go from % to %', v_order.status, p_status using errcode = '22023';
  end if;

  if p_status = 'cancelled' then
    perform public.cancel_order(p_order_id, coalesce(p_note, ''));
    return 'cancelled'::bsdc_order_status;
  end if;

  update public.orders
    set status = p_status,
        confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
        delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
        payment_status = case
          when p_status = 'delivered' and payment_method = 'cash_on_delivery' then 'paid'
          else payment_status
        end
    where id = p_order_id;

  if p_status = 'delivered' then
    perform bsdc.settle_order(p_order_id);
  end if;

  perform bsdc.notify_path(
    v_order.uid,
    v_uid,
    'order',
    null,
    null,
    left('Order ' || v_order.code || ' is now ' || p_status::text, 280),
    null,
    '/orders'
  );

  return p_status;
end;
$$;

-- Reviews & ratings trigger -> notifies shop owner with 'review'
create or replace function bsdc.notify_product_review()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner        text;
  v_product_slug text;
  v_title        text;
  v_summary      text;
begin
  select s.owner_uid, p.slug, p.title
    into v_owner, v_product_slug, v_title
    from public.products p
    join public.shops s on s.id = p.shop_id
   where p.id = new.product_id;

  v_summary := new.rating::text || '/5 on ' || left(coalesce(v_title, 'product'), 80);
  if btrim(coalesce(new.body, '')) <> '' then
    v_summary := v_summary || ': ' || left(btrim(new.body), 160);
  end if;

  perform bsdc.notify_path(
    v_owner,
    new.uid,
    'review',
    null,
    null,
    v_summary,
    null,
    case when coalesce(v_product_slug, '') <> '' then '/shop/' || v_product_slug else '/vendor' end
  );
  return null;
end;
$$;

revoke all on function bsdc.notify_product_review() from public, anon, authenticated;

drop trigger if exists product_reviews_notify on public.product_reviews;
create trigger product_reviews_notify
  after insert or update of rating, body on public.product_reviews
  for each row execute function bsdc.notify_product_review();

create or replace function public.request_payout(
  p_account_id uuid,
  p_amount     integer
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_shop    uuid;
  v_owner   text;
  v_name    text;
  v_balance integer;
  v_id      uuid;
  v_staff   text;
begin
  select a.shop_id, s.owner_uid, s.name into v_shop, v_owner, v_name
    from public.payout_accounts a join public.shops s on s.id = a.shop_id
    where a.id = p_account_id;
  if v_shop is null then
    raise exception 'payout account not found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from v_uid then
    raise exception 'this account belongs to another shop' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'a payout must be more than nothing' using errcode = '22023';
  end if;

  perform 1 from public.shops where id = v_shop for update;

  select coalesce(sum(amount), 0)::integer into v_balance
    from public.shop_ledger where shop_id = v_shop;

  if p_amount > v_balance then
    raise exception 'your balance is % poisha', v_balance using errcode = '22023';
  end if;

  insert into public.payouts (shop_id, account_id, amount)
    values (v_shop, p_account_id, p_amount)
    returning id into v_id;

  insert into public.shop_ledger (shop_id, payout_id, kind, amount, memo)
    values (v_shop, v_id, 'payout', -p_amount, 'payout requested');

  for v_staff in
    select p.uid from public.profiles p
    where p.role in ('admin', 'owner')
      and p.status = 'active'
      and p.uid <> v_uid
  loop
    perform bsdc.notify_path(
      v_staff, v_uid, 'payout', null, null,
      left('Payout requested by ' || coalesce(v_name, 'shop'), 200),
      null, '/vendor'
    );
  end loop;

  return v_id;
end;
$$;

create or replace function public.decide_payout(
  p_payout_id uuid,
  p_approve   boolean,
  p_reference text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_payout public.payouts%rowtype;
  v_owner  text;
  v_actor  text := bsdc.current_uid();
begin
  if not bsdc.is_staff() then
    raise exception 'only staff may decide a payout' using errcode = '42501';
  end if;
  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found or v_payout.status <> 'requested' then
    raise exception 'this payout has already been decided' using errcode = '22023';
  end if;

  select owner_uid into v_owner from public.shops where id = v_payout.shop_id;

  if p_approve then
    update public.payouts
      set status = 'paid', decided_at = now(), decided_by = v_actor,
          reference = left(coalesce(p_reference, ''), 120)
      where id = p_payout_id;
    perform bsdc.notify_path(
      v_owner, v_actor, 'payout', null, null,
      left('Payout paid' || case when btrim(coalesce(p_reference, '')) <> '' then ' · ref ' || btrim(p_reference) else '' end, 280),
      null, '/vendor'
    );
  else
    update public.payouts
      set status = 'rejected', decided_at = now(), decided_by = v_actor
      where id = p_payout_id;
    insert into public.shop_ledger (shop_id, payout_id, kind, amount, memo)
      values (v_payout.shop_id, p_payout_id, 'adjustment', v_payout.amount, 'payout rejected');
    perform bsdc.notify_path(
      v_owner, v_actor, 'payout', null, null,
      'Payout request rejected and refunded to shop balance',
      null, '/vendor'
    );
  end if;
end;
$$;

create or replace function public.decide_shop(
  p_shop_id uuid,
  p_approve boolean,
  p_reason  text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner text;
begin
  if not bsdc.is_staff() then
    raise exception 'only staff may approve a shop' using errcode = '42501';
  end if;
  select owner_uid into v_owner from public.shops where id = p_shop_id;
  if v_owner is null then
    raise exception 'shop not found' using errcode = 'P0002';
  end if;

  update public.shops
    set status = case when p_approve then 'active'::bsdc_shop_status
                      else 'suspended'::bsdc_shop_status end,
        approved_at = case when p_approve then now() else approved_at end,
        suspension_reason = case when p_approve then '' else left(coalesce(p_reason, ''), 500) end
    where id = p_shop_id;

  if not p_approve then
    update public.products set status = 'archived'
      where shop_id = p_shop_id and status in ('active', 'out_of_stock');
  end if;

  perform bsdc.notify_path(
    v_owner,
    bsdc.current_uid(),
    'moderation',
    null,
    null,
    case when p_approve then 'Shop approved for marketplace selling' else left('Shop suspended' || case when btrim(coalesce(p_reason, '')) <> '' then ': ' || btrim(p_reason) else '' end, 280) end,
    null,
    '/vendor'
  );
end;
$$;

-- ===========================================================================
-- 7. Communities, Events, Opportunities, Courses, Certificates & Feedback
-- ===========================================================================
create or replace function public.join_group(p_group_id uuid, p_message text default '')
returns bsdc_join_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_privacy bsdc_group_privacy;
  v_name    text;
  v_slug    text;
  v_mod     text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select privacy, name, slug into v_privacy, v_name, v_slug
    from public.groups where id = p_group_id and not is_archived;
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

    for v_mod in
      select gm.uid from public.group_members gm
      where gm.group_id = p_group_id and gm.role in ('owner', 'moderator')
    loop
      perform bsdc.notify_path(
        v_mod, v_uid, 'group_invite', null, null,
        left('Join request for ' || coalesce(v_name, 'group'), 280),
        null,
        case when coalesce(v_slug, '') <> '' then '/groups/' || v_slug else '/groups' end
      );
    end loop;
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
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text := bsdc.current_uid();
  v_name  text;
  v_slug  text;
begin
  if not bsdc.can_moderate_group(p_group_id, v_actor) then
    raise exception 'only group moderators may decide requests' using errcode = '42501';
  end if;

  select name, slug into v_name, v_slug from public.groups where id = p_group_id;

  update public.group_join_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = v_actor,
        decided_at = now()
    where group_id = p_group_id and uid = p_uid;

  if p_approve then
    insert into public.group_members (group_id, uid) values (p_group_id, p_uid)
      on conflict do nothing;
    perform bsdc.notify_path(
      p_uid, v_actor, 'group_invite', null, null,
      left('Approved to join ' || coalesce(v_name, 'group'), 280),
      null,
      case when coalesce(v_slug, '') <> '' then '/groups/' || v_slug else '/groups' end
    );
  end if;
end;
$$;

create or replace function bsdc.notify_event_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_organizer text;
  v_title     text;
  v_slug      text;
begin
  if new.status not in ('going', 'interested') then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return null;
  end if;

  select host_uid, title, slug
    into v_organizer, v_title, v_slug
    from public.events
   where id = new.event_id;

  perform bsdc.notify_path(
    v_organizer,
    new.uid,
    'event',
    null,
    null,
    left(new.status::text || ': ' || coalesce(v_title, 'event'), 280),
    null,
    case when coalesce(v_slug, '') <> '' then '/events/' || v_slug else '/events' end
  );
  return null;
end;
$$;

revoke all on function bsdc.notify_event_rsvp() from public, anon, authenticated;

drop trigger if exists event_rsvps_notify on public.event_rsvps;
create trigger event_rsvps_notify
  after insert or update of status on public.event_rsvps
  for each row execute function bsdc.notify_event_rsvp();

create or replace function bsdc.notify_project_star()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner text;
  v_title text;
  v_slug  text;
begin
  select owner_uid, name, slug
    into v_owner, v_title, v_slug
    from public.projects
   where id = new.project_id;

  perform bsdc.notify_path(
    v_owner,
    new.uid,
    'reaction',
    null,
    null,
    left('Starred project: ' || coalesce(v_title, 'project'), 280),
    null,
    case when coalesce(v_slug, '') <> '' then '/projects/' || v_slug else '/projects' end
  );
  return null;
end;
$$;

revoke all on function bsdc.notify_project_star() from public, anon, authenticated;

drop trigger if exists project_stars_notify on public.project_stars;
create trigger project_stars_notify
  after insert on public.project_stars
  for each row execute function bsdc.notify_project_star();

create or replace function public.apply_to_job(
  p_job_id       uuid,
  p_cover_letter text,
  p_resume_url   text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_job public.jobs%rowtype;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.status <> 'open' then
    raise exception 'this posting is not accepting applications' using errcode = 'P0002';
  end if;
  if v_job.expires_at is not null and v_job.expires_at < now() then
    raise exception 'this posting has expired' using errcode = 'P0002';
  end if;
  if v_job.poster_uid = v_uid then
    raise exception 'you cannot apply to your own posting' using errcode = '22023';
  end if;

  insert into public.job_applications (job_id, applicant_uid, cover_letter, resume_url)
    values (p_job_id, v_uid, coalesce(p_cover_letter, ''), coalesce(p_resume_url, ''))
    on conflict (job_id, applicant_uid) do nothing
    returning id into v_id;

  if v_id is null then
    raise exception 'job/already-applied' using errcode = '23505';
  end if;

  perform bsdc.notify_path(
    v_job.poster_uid, v_uid, 'job', null, null,
    left('New application for ' || v_job.title, 280),
    null,
    '/jobs/' || v_job.slug
  );
  return v_id;
end;
$$;

create or replace function public.decide_application(
  p_application_id uuid,
  p_status         bsdc_application_status
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_app    public.job_applications%rowtype;
  v_poster text;
  v_title  text;
  v_slug   text;
begin
  select * into v_app from public.job_applications where id = p_application_id;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  select poster_uid, title, slug into v_poster, v_title, v_slug
    from public.jobs where id = v_app.job_id;
  if v_poster is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the employer may decide an application' using errcode = '42501';
  end if;

  update public.job_applications
    set status = p_status, decided_at = now()
    where id = p_application_id;

  perform bsdc.notify_path(
    v_app.applicant_uid, v_uid, 'job', null, null,
    left('Application ' || p_status::text || ': ' || coalesce(v_title, 'job'), 280),
    null,
    case when coalesce(v_slug, '') <> '' then '/jobs/' || v_slug else '/jobs' end
  );
end;
$$;

create or replace function public.submit_proposal(
  p_gig_id        uuid,
  p_pitch         text,
  p_bid_amount    integer,
  p_delivery_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_gig public.gigs%rowtype;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_gig from public.gigs where id = p_gig_id;
  if not found or v_gig.status <> 'open' then
    raise exception 'this gig is not accepting proposals' using errcode = 'P0002';
  end if;
  if v_gig.client_uid = v_uid then
    raise exception 'you cannot bid on your own gig' using errcode = '22023';
  end if;

  insert into public.gig_proposals (gig_id, freelancer_uid, pitch, bid_amount, delivery_days)
    values (p_gig_id, v_uid, p_pitch, p_bid_amount, p_delivery_days)
    on conflict (gig_id, freelancer_uid) do nothing
    returning id into v_id;

  if v_id is null then
    raise exception 'gig/already-proposed' using errcode = '23505';
  end if;

  perform bsdc.notify_path(
    v_gig.client_uid, v_uid, 'job', null, null,
    left('New proposal for ' || v_gig.title, 280),
    null,
    '/gigs/' || v_gig.slug
  );
  return v_id;
end;
$$;

create or replace function public.enroll_in_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_course public.courses%rowtype;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  if not found or v_course.status <> 'published' then
    raise exception 'this course is not open for enrolment' using errcode = 'P0002';
  end if;

  insert into public.enrollments (course_id, uid)
    values (p_course_id, v_uid)
    on conflict (course_id, uid) do update set status = 'active'
    returning id into v_id;

  perform bsdc.notify_path(
    v_course.instructor_uid,
    v_uid,
    'course',
    null,
    null,
    left('New learner enrolled in ' || v_course.title, 280),
    null,
    '/learn/' || v_course.slug
  );

  return v_id;
end;
$$;

create or replace function public.grade_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb
)
returns table (
  score            integer,
  earned_marks     integer,
  total_marks      integer,
  passed           boolean,
  certificate_code text
)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid        text := bsdc.current_uid();
  v_course     uuid;
  v_pass       integer;
  v_grants     boolean;
  v_attempts   integer;
  v_max        integer;
  v_earned     integer := 0;
  v_total      integer := 0;
  v_score      integer := 0;
  v_passed     boolean := false;
  v_progress   integer := 0;
  v_code       text := null;
  v_name       text;
  v_title      text;
  v_slug       text;
  v_instructor text;
  r            record;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select q.course_id, q.max_attempts, c.pass_mark, c.grants_certificate, c.title, c.slug, c.instructor_uid
    into v_course, v_max, v_pass, v_grants, v_title, v_slug, v_instructor
    from public.quizzes q join public.courses c on c.id = q.course_id
    where q.id = p_quiz_id;
  if not found then
    raise exception 'quiz not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.enrollments where course_id = v_course and uid = v_uid
  ) then
    raise exception 'enrol in the course first' using errcode = '42501';
  end if;

  select count(*)::integer into v_attempts
    from public.quiz_attempts where quiz_id = p_quiz_id and uid = v_uid;
  if v_attempts >= v_max then
    raise exception 'no attempts remaining' using errcode = '42501';
  end if;

  for r in
    select
      qq.id,
      qq.marks,
      (
        select coalesce(array_agg(o.id order by o.id), array[]::uuid[])
        from public.quiz_options o where o.question_id = qq.id and o.is_correct
      ) as correct_ids
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
  loop
    v_total := v_total + r.marks;
    if (
      select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      from jsonb_array_elements_text(coalesce(p_answers -> r.id::text, '[]'::jsonb))
    ) = r.correct_ids then
      v_earned := v_earned + r.marks;
    end if;
  end loop;

  v_score := case when v_total = 0 then 0 else (v_earned * 100) / v_total end;
  v_passed := v_score >= v_pass;

  insert into public.quiz_attempts
      (quiz_id, uid, score, earned_marks, total_marks, passed, answers)
    values (p_quiz_id, v_uid, v_score, v_earned, v_total, v_passed, coalesce(p_answers, '{}'::jsonb));

  if v_passed and v_grants then
    select e.progress into v_progress
      from public.enrollments e where e.course_id = v_course and e.uid = v_uid;

    if coalesce(v_progress, 0) >= 100 then
      select coalesce(nullif(btrim(p.display_name), ''), p.username)
        into v_name from public.profiles p where p.uid = v_uid;

      insert into public.certificates
          (code, course_id, uid, recipient_name, course_title, score)
        values (bsdc.new_certificate_code(), v_course, v_uid,
                coalesce(v_name, 'BSDC member'), v_title, v_score)
        on conflict (course_id, uid) do nothing;

      select c.code into v_code
        from public.certificates c where c.course_id = v_course and c.uid = v_uid;
    end if;
  end if;

  if v_code is not null then
    perform bsdc.notify_path(
      v_uid,
      case when v_instructor <> v_uid then v_instructor else null end,
      'certificate',
      null,
      null,
      left('Certificate earned (' || v_code || '): ' || v_title, 280),
      null,
      '/verify?code=' || v_code
    );
  elsif v_passed then
    perform bsdc.notify_path(
      v_uid,
      case when v_instructor <> v_uid then v_instructor else null end,
      'course',
      null,
      null,
      left('Passed quiz (' || v_score::text || '%): ' || v_title, 280),
      null,
      '/learn/' || v_slug
    );
  end if;

  return query select v_score, v_earned, v_total, v_passed, v_code;
end;
$$;

create or replace function public.issue_certificate(
  p_template_key   text,
  p_recipient_name text,
  p_subject        text,
  p_recipient_uid  text default null,
  p_issued_on      date default current_date,
  p_expires_on     date default null,
  p_body           text default ''
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_template public.certificate_templates;
  v_code     text;
  v_body     text;
  v_try      integer := 0;
  v_actor    text := bsdc.current_uid();
begin
  perform bsdc.require_permission('certificates.issue');

  select * into v_template from public.certificate_templates where key = p_template_key;
  if v_template.key is null then
    raise exception 'No such certificate template' using errcode = 'P0002';
  end if;
  if not v_template.is_active then
    raise exception 'That template is retired' using errcode = '22023';
  end if;

  v_body := coalesce(nullif(btrim(p_body), ''), v_template.body_template);
  v_body := replace(v_body, '{recipient}', btrim(p_recipient_name));
  v_body := replace(v_body, '{subject}', btrim(p_subject));
  v_body := replace(v_body, '{date}', to_char(coalesce(p_issued_on, current_date), 'DD Mon YYYY'));

  loop
    v_try := v_try + 1;
    v_code := bsdc.issue_doc_code('CT');
    exit when not exists (select 1 from public.issued_certificates where code = v_code);
    if v_try > 10 then
      raise exception 'Could not allocate a certificate code' using errcode = '55000';
    end if;
  end loop;

  insert into public.issued_certificates
    (code, template_key, recipient_uid, recipient_name, subject, body,
     issued_on, expires_on, issued_by)
  values
    (v_code, p_template_key, p_recipient_uid, btrim(p_recipient_name), btrim(p_subject), v_body,
     coalesce(p_issued_on, current_date), p_expires_on, v_actor);

  if p_recipient_uid is not null then
    perform bsdc.notify_path(
      p_recipient_uid,
      v_actor,
      'certificate',
      null,
      null,
      left('Certificate issued (' || v_code || '): ' || btrim(p_subject), 280),
      null,
      '/verify?code=' || v_code
    );
  end if;

  perform bsdc.audit('certificate.issue', v_code,
    jsonb_build_object('template', p_template_key, 'recipient', btrim(p_recipient_name)));
  return v_code;
end;
$$;

create or replace function public.revoke_issued_certificate(p_code text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_recipient text;
  v_actor     text := bsdc.current_uid();
begin
  perform bsdc.require_permission('certificates.issue');

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A revocation needs a reason' using errcode = '22023';
  end if;

  update public.issued_certificates
  set status = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason)
  where code = p_code and status = 'issued'
  returning recipient_uid into v_recipient;

  if not found then
    raise exception 'No certificate with that code is currently issued' using errcode = 'P0002';
  end if;

  if v_recipient is not null then
    perform bsdc.notify_path(
      v_recipient,
      v_actor,
      'certificate',
      null,
      null,
      left('Certificate revoked (' || p_code || '): ' || btrim(p_reason), 280),
      null,
      '/verify?code=' || p_code
    );
  end if;

  perform bsdc.audit('certificate.revoke', p_code, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- Reports & feedback: notify moderators when filed; notify reporter & subject author on resolution
create or replace function bsdc.notify_report_submitted()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_mod text;
begin
  for v_mod in
    select p.uid from public.profiles p
    where p.role in ('moderator', 'manager', 'admin', 'owner')
      and p.status = 'active'
      and p.uid <> new.reporter_uid
  loop
    perform bsdc.notify_path(
      v_mod,
      new.reporter_uid,
      'feedback',
      case when new.subject_type = 'post' and new.subject_id ~* '^[0-9a-f-]{36}$' then new.subject_id::uuid else null end,
      null,
      left('Report (' || new.subject_type || '): ' || coalesce(nullif(btrim(new.reason), ''), new.details, 'review'), 280),
      null,
      '/moderation'
    );
  end loop;
  return null;
end;
$$;

revoke all on function bsdc.notify_report_submitted() from public, anon, authenticated;

drop trigger if exists reports_notify_moderators on public.reports;
create trigger reports_notify_moderators
  after insert on public.reports
  for each row execute function bsdc.notify_report_submitted();

create or replace function public.resolve_report(
  p_report_id uuid,
  p_action    text,
  p_reason    text default ''
)
returns bsdc_report_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor      text := bsdc.current_uid();
  v_report     public.reports%rowtype;
  v_status     bsdc_report_status;
  v_post_id    uuid := null;
  v_subject_uid text := null;
begin
  perform bsdc.require_permission('moderation.resolve');

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'No such report' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception 'That report has already been handled' using errcode = '22023';
  end if;
  if v_report.assigned_to is not null and v_report.assigned_to <> v_actor then
    raise exception 'Another moderator is handling this' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'warn', 'hide_content', 'restore_content') then
    raise exception 'Unknown moderation action' using errcode = '22023';
  end if;
  if p_action in ('hide_content', 'restore_content')
     and not bsdc.has_permission('content.hide') then
    raise exception 'Permission content.hide is required' using errcode = '42501';
  end if;

  if v_report.subject_type = 'post' and v_report.subject_id ~* '^[0-9a-f-]{36}$' then
    v_post_id := v_report.subject_id::uuid;
    select author_uid into v_subject_uid from public.posts where id = v_post_id;
  elsif v_report.subject_type = 'comment' and v_report.subject_id ~* '^[0-9a-f-]{36}$' then
    select author_uid, post_id into v_subject_uid, v_post_id
      from public.comments where id = v_report.subject_id::uuid;
  elsif v_report.subject_type in ('profile', 'user') then
    v_subject_uid := v_report.subject_id;
  end if;

  if p_action = 'hide_content' and v_report.subject_type = 'post' then
    update public.posts set status = 'removed' where id = v_post_id;
  elsif p_action = 'restore_content' and v_report.subject_type = 'post' then
    update public.posts set status = 'published' where id = v_post_id;
  end if;

  v_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;

  update public.reports
  set status = v_status,
      handled_by = v_actor,
      handled_at = now(),
      assigned_to = v_actor,
      resolution = coalesce(p_reason, '')
  where id = p_report_id;

  insert into public.moderation_actions
    (actor_uid, report_id, subject_type, subject_id, action, reason)
  values
    (v_actor, p_report_id, v_report.subject_type, v_report.subject_id, p_action, coalesce(p_reason, ''));

  perform bsdc.notify_path(
    v_report.reporter_uid,
    v_actor,
    'feedback',
    null,
    null,
    left('Report ' || v_status::text || case when btrim(coalesce(p_reason, '')) <> '' then ': ' || btrim(p_reason) else '' end, 280),
    null,
    '/notifications'
  );

  if p_action in ('warn', 'hide_content', 'restore_content') and v_subject_uid is not null then
    perform bsdc.notify_path(
      v_subject_uid,
      v_actor,
      'moderation',
      case when p_action = 'restore_content' then v_post_id else null end,
      null,
      left('Moderation (' || p_action || ')' || case when btrim(coalesce(p_reason, '')) <> '' then ': ' || btrim(p_reason) else '' end, 280),
      null,
      '/notifications'
    );
  end if;

  perform bsdc.audit('moderation.resolve', p_report_id::text,
    jsonb_build_object('action', p_action, 'status', v_status));

  return v_status;
end;
$$;

-- ===========================================================================
-- 8. Instant push wake-up statement trigger via pg_net (debounced & safe)
-- ===========================================================================
create or replace function bsdc.trigger_instant_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_secret   text;
  v_url      text;
  v_last_raw text;
  v_last_at  timestamptz := null;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return null;
  end if;

  if not pg_try_advisory_xact_lock(hashtext('bsdc.instant_push_dispatch')) then
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

  select value into v_last_raw from bsdc.push_settings where name = 'last_auto_trigger_at';
  if v_last_raw is not null and btrim(v_last_raw) <> '' then
    begin
      v_last_at := v_last_raw::timestamptz;
    exception when others then
      v_last_at := null;
    end;
  end if;

  if v_last_at is not null and clock_timestamp() - v_last_at < interval '400 milliseconds' then
    return null;
  end if;

  insert into bsdc.push_settings (name, value)
  values ('last_auto_trigger_at', clock_timestamp()::text)
  on conflict (name) do update set value = excluded.value;

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
  after insert or update on public.notifications
  for each statement execute function bsdc.trigger_instant_push_dispatch();

-- Ensure Realtime streams notifications cleanly with full row payload
alter table public.notifications replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
exception when others then
  null;
end;
$$;
