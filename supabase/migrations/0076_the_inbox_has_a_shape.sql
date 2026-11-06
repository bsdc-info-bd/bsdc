-- ---------------------------------------------------------------------------
-- The inbox has a shape, and it is the database's to decide.
--
-- The notification screen rendered once and then threw on every visit. The
-- report — "Something went wrong on this screen" — is what the boundary says
-- when a render throws, and the render threw for a reason that is easy to miss
-- in a migration: the screen embedded `actor:actor_uid (...)` on a table whose
-- declared relationships in the generated client were empty, so PostgREST had
-- no foreign key to embed and answered with an error the client surfaced late.
-- The row shape was also declared as `Notifications` rather than `Notification`,
-- so the join was typed as something the database could not promise.
--
-- Underneath both mistakes is the same decision, and it is the wrong one: the
-- inbox is the one screen whose whole purpose is to be opened, and it was the
-- one screen assembled by the client out of six raw tables. This migration
-- moves the shape of an inbox into the database, where it can be proved.
--
-- What the function answers, and why each part is there:
--
--   * The actor as the inbox needs it — name, handle, picture — resolved in the
--     same row, so the screen never polls a second table to find out who did
--     the thing it is telling you about.
--   * `target_url`: where a notification goes when it is opened. A message
--     opens its thread, a comment opens the post it is on, a moderation notice
--     opens the moderation screen, and the push worker reads the same rule from
--     `0072` so a buzz and a tap land in the same place. One screen and one
--     worker disagreeing about where a notification leads is a bug a member
--     cannot report, so both ask this function.
--   * Coalescing: a member who comes back after a day sees one line per
--     conversation, one line per post, not two hundred. Grouping is what an
--     inbox is for, and it is arithmetic, so it belongs here.
--   * The unread count in the same call, so the badge and the list cannot
--     disagree.
--   * A read state that is a restful, optimistic write: the screen marks rows
--     read as they scroll into view, and a failed write must not lose the
--     read.
--
-- Nothing here reaches a table the caller could not read anyway: the function
-- is `security invoker`, so the row level security on `notifications` and on
-- `profiles` still applies, and a caller sees exactly their own inbox.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Where a notification leads
-- ---------------------------------------------------------------------------
-- One function, called by the screen, by the push worker and by the tests, so
-- there is exactly one answer. It is deliberately about the *kind*: a
-- notification that names a post opens the post, whether it was a reaction or
-- a reply, because that is where the thing the member was told about is.
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
    -- A moderation notice is about a decision, and the decision is on the
    -- moderation screen; it is also the one kind that is delivered even when
    -- every switch is off.
    when p_kind = 'moderation' then '/moderation'
    -- A follow has no object, so it opens the person who did it — and this
    -- function cannot know whether that account still exists, so it answers
    -- the directory. The screen, which has the resolved actor in the same row,
    -- opens the person and falls back to this.
    when p_kind = 'follow' then '/people'
    when p_post_id is null then '/notifications'
    when coalesce(p_post_slug, '') <> '' then '/p/' || p_post_slug
    else '/p/' || p_post_id::text
  end;
$$;

-- The slug is what makes a post link readable, and it is the author's current
-- slug that matters at the moment the inbox is rendered, not the one that
-- existed when the notification was written. `0072` does the same lookup for
-- the push worker; this is the same rule in one place.
create or replace function bsdc.notification_target_for(p_notification_id uuid)
returns text
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select bsdc.notification_target(
    n.kind, n.post_id, n.conversation_id,
    (select p.slug from public.posts p where p.id = n.post_id)
  )
  from public.notifications n
  where n.id = p_notification_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. The inbox
-- ---------------------------------------------------------------------------
-- Returns one row per line the screen draws. A line can stand for several
-- notifications — `count` says how many, `unread_count` how many of those the
-- member has not seen — and `last_at` is the newest of them, which is what an
-- inbox sorts and timestamps by.
--
-- `p_limit` is the number of *lines*, not of raw rows: a member who has been
-- away should get a readable page, not the first forty rows of a group of two
-- hundred.
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
      n.read_at, n.created_at,
      -- One line per conversation, per post, per person who followed. A
      -- notification with no object at all groups by its own id, so it is
      -- never merged with an unrelated one.
      coalesce(n.conversation_id::text, n.post_id::text, n.actor_uid, n.id::text) each,
      coalesce(n.conversation_id, n.post_id, null) as solid,
      n.kind = 'follow' as by_actor
    from public.notifications n
    where n.uid = bsdc.current_uid()
      -- A notification about a post the member can no longer see is not a
      -- notification: removed, trashed and private posts drop out of the
      -- inbox rather than becoming a link to "not found".
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
      count(*)::integer                                  as occurrences,
      count(*) filter (where mine.read_at is null)::integer as unread_count,
      max(mine.created_at)                               as last_at,
      -- The newest row of each group is the one whose words the line shows:
      -- "Rahim replied" beats "Karim replied" only because it is more recent,
      -- which is the right tie-break for a feed of things that already
      -- happened. The id breaks a tie, because two notifications written in
      -- the same transaction share one `now()` and an arbitrary winner would
      -- make the same inbox render differently on two page loads.
      (array_agg(mine.id order by mine.created_at desc, mine.id desc))[1]                as notification_id,
      (array_agg(mine.kind order by mine.created_at desc, mine.id desc))[1]              as kind,
      (array_agg(mine.actor_uid order by mine.created_at desc, mine.id desc))[1]         as actor_uid,
      (array_agg(mine.body order by mine.created_at desc, mine.id desc))[1]              as body,
      (array_agg(mine.post_id order by mine.created_at desc, mine.id desc))[1]           as post_id,
      (array_agg(mine.comment_id order by mine.created_at desc, mine.id desc))[1]        as comment_id,
      (array_agg(mine.conversation_id order by mine.created_at desc, mine.id desc))[1]   as conversation_id,
      (array_agg(mine.read_at order by mine.created_at desc, mine.id desc))[1]            as read_at,
      (array_agg(mine.created_at order by mine.created_at desc, mine.id desc))[1]        as created_at
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
    bsdc.notification_target(
      g.kind,
      g.post_id,
      g.conversation_id,
      (select po.slug from public.posts po where po.id = g.post_id)
    ) as target_url,
    g.read_at,
    g.last_at,
    g.created_at,
    g.occurrences,
    g.unread_count,
    g.unread_count > 0 as is_unread
  from grouped g
  -- A profile that has gone is not a person any more, but the notification
  -- still happened; the join is left so one deleted account does not erase
  -- somebody's inbox.
  left join public.profiles p on p.uid = g.actor_uid
  order by g.last_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- The count the badge reads. Served by the same predicates as the list, so the
-- number on the bell always describes the list behind it.
create or replace function public.inbox_unread_count()
returns integer
language sql
stable
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(count(*), 0)::integer
  from public.notifications n
  where n.uid = bsdc.current_uid()
    and n.read_at is null
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
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Reading them
-- ---------------------------------------------------------------------------
-- The screen marks a line read when it is opened, and offers "mark all". Both
-- go through this, which is the only thing that writes `read_at`, so a future
-- caller cannot mark somebody else's notification read by naming its id: the
-- `and uid = ...` is the whole of the authorisation, and the policy behind it
-- says the same thing.
create or replace function public.mark_inbox_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_updated integer;
begin
  if bsdc.current_uid() is null then
    raise exception 'Sign in to read your notifications' using errcode = '42501';
  end if;

  update public.notifications n
     set read_at = coalesce(n.read_at, now())
   where n.uid = bsdc.current_uid()
     and n.read_at is null
     and (p_ids is null or n.id = any(p_ids));

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- The existing name the rest of the application already calls. Kept as a thin
-- wrapper rather than repointed in the client, because a deployed site and a
-- new migration disagree for the length of one deploy.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  return public.mark_inbox_read(p_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Clearing them
-- ---------------------------------------------------------------------------
-- An inbox that cannot be cleared fills up forever. This is a real delete of
-- the member's own read rows, which the policy on the table already permits;
-- offering it as a function gives the screen one call and gives the database
-- one place to say what clearing means: read, and older than the moment the
-- member asked.
create or replace function public.clear_inbox(p_keep_days integer default 0)
returns integer
language plpgsql
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_deleted integer;
begin
  if bsdc.current_uid() is null then
    raise exception 'Sign in to clear your notifications' using errcode = '42501';
  end if;

  delete from public.notifications n
   where n.uid = bsdc.current_uid()
     and n.read_at is not null
     and n.created_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 0), 0));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- One switch from the screen: this kind, or all of them.
create or replace function public.mute_notification_kind(p_kind bsdc_notification_kind)
returns void
language plpgsql
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if bsdc.current_uid() is null then
    raise exception 'Sign in to change your notifications' using errcode = '42501';
  end if;
  -- The switches live in `profiles.notifications` and `bsdc.notification_allowed`
  -- is the only reader of them, so writing here is enough for the next
  -- notification to respect it. A `message` is never muted: a message is
  -- addressed to somebody, not broadcast at them.
  if p_kind = 'message' or p_kind = 'moderation' then
    raise exception 'Messages and moderation notices cannot be muted' using errcode = '22023';
  end if;
  update public.profiles
     set notifications = jsonb_set(
       coalesce(notifications, '{}'::jsonb),
       array[p_kind::text],
       'false'::jsonb,
       true)
   where uid = bsdc.current_uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------------
grant execute on function public.my_inbox(integer) to authenticated;
grant execute on function public.inbox_unread_count() to authenticated;
grant execute on function public.mark_inbox_read(uuid[]) to authenticated;
grant execute on function public.clear_inbox(integer) to authenticated;
grant execute on function public.mute_notification_kind(bsdc_notification_kind) to authenticated;

-- Signed out, there is no inbox to read: `bsdc.current_uid()` is null and every
-- predicate above is false, but the honest answer is a refusal rather than an
-- empty list a screen could mistake for "you have nothing".
revoke execute on function public.my_inbox(integer) from anon;
revoke execute on function public.inbox_unread_count() from anon;
revoke execute on function public.mark_inbox_read(uuid[]) from anon;
revoke execute on function public.clear_inbox(integer) from anon;
revoke execute on function public.mute_notification_kind(bsdc_notification_kind) from anon;

comment on function public.my_inbox(integer) is
  'The member''s inbox, coalesced and with the actor resolved: the one call the notification screen makes.';
comment on function public.inbox_unread_count() is
  'The number the bell shows, computed from the same predicates as the inbox behind it.';
