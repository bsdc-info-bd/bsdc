-- ---------------------------------------------------------------------------
-- Interactions: reactions, threaded comments, bookmarks, shares and the
-- notification write path.
--
-- Everything that changes a counter does so inside a trigger, so a client can
-- never report a number the database did not compute. Every interaction that
-- another member should hear about funnels through bsdc.notify(), which is
-- the single place where notification policy lives: no self-notifications,
-- no notifications across a block, and collapsing of repeats.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_reaction') then
    create type bsdc_reaction as enum ('like', 'insightful', 'celebrate', 'support', 'curious');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_notification_kind') then
    create type bsdc_notification_kind as enum (
      'follow', 'reaction', 'comment', 'reply', 'mention', 'bookmark', 'share',
      'post_published', 'moderation'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  uid          text not null references public.profiles (uid) on delete cascade,
  actor_uid    text references public.profiles (uid) on delete cascade,
  kind         bsdc_notification_kind not null,
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid,
  body         text not null default '' check (char_length(body) <= 280),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_inbox_idx
  on public.notifications (uid, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (uid) where read_at is null;

-- One row per (recipient, actor, kind, target): a member who reacts, undoes
-- and reacts again does not produce a second line in somebody's inbox.
create unique index if not exists notifications_unique_idx
  on public.notifications (uid, actor_uid, kind, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function bsdc.notify(
  p_uid        text,
  p_actor_uid  text,
  p_kind       bsdc_notification_kind,
  p_post_id    uuid default null,
  p_comment_id uuid default null,
  p_body       text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if p_uid is null or p_uid = p_actor_uid then
    return;
  end if;

  -- A block in either direction silences the notification entirely.
  if exists (
    select 1 from public.blocks
    where (blocker_uid = p_uid and blocked_uid = p_actor_uid)
       or (blocker_uid = p_actor_uid and blocked_uid = p_uid)
  ) then
    return;
  end if;

  insert into public.notifications (uid, actor_uid, kind, post_id, comment_id, body)
  values (p_uid, p_actor_uid, p_kind, p_post_id, p_comment_id, left(coalesce(p_body, ''), 280))
  on conflict (uid, actor_uid, kind, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set created_at = now(), read_at = null, body = excluded.body;
end;
$$;

-- ---------------------------------------------------------------------------
-- reactions
-- ---------------------------------------------------------------------------
create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  reaction   bsdc_reaction not null default 'like',
  created_at timestamptz not null default now(),
  primary key (post_id, uid)
);

create index if not exists post_reactions_uid_idx on public.post_reactions (uid, created_at desc);

-- likes_count counts reacted members, not reaction kinds: switching from
-- 'like' to 'celebrate' must not inflate the total.
create or replace function bsdc.sync_reaction_counts()
returns trigger
language plpgsql
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
  elsif tg_op = 'DELETE' then
    update public.posts
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_reactions_sync on public.post_reactions;
create trigger post_reactions_sync after insert or delete on public.post_reactions
  for each row execute function bsdc.sync_reaction_counts();

-- Toggling is a single round trip and is idempotent under double clicks.
create or replace function public.toggle_reaction(p_post_id uuid, p_reaction bsdc_reaction)
returns table (reacted boolean, reaction bsdc_reaction, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_existing bsdc_reaction;
  v_total    integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
      and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
  ) then
    raise exception 'post not available' using errcode = 'P0002';
  end if;

  select pr.reaction into v_existing
    from public.post_reactions pr
    where pr.post_id = p_post_id and pr.uid = v_uid;

  if v_existing is null then
    insert into public.post_reactions (post_id, uid, reaction)
      values (p_post_id, v_uid, p_reaction);
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select true, p_reaction, v_total;
  elsif v_existing = p_reaction then
    delete from public.post_reactions pr where pr.post_id = p_post_id and pr.uid = v_uid;
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select false, p_reaction, v_total;
  else
    update public.post_reactions pr
      set reaction = p_reaction, created_at = now()
      where pr.post_id = p_post_id and pr.uid = v_uid;
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select true, p_reaction, v_total;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  author_uid    text not null references public.profiles (uid) on delete cascade,
  parent_id     uuid references public.comments (id) on delete cascade,
  root_id       uuid,
  depth         smallint not null default 0 check (depth between 0 and 3),
  body          text not null check (char_length(btrim(body)) between 1 and 4000),
  status        bsdc_post_status not null default 'published',
  likes_count   integer not null default 0 check (likes_count >= 0),
  replies_count integer not null default 0 check (replies_count >= 0),
  is_answer     boolean not null default false,
  edited_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_thread_idx on public.comments (root_id, created_at);
create index if not exists comments_author_idx on public.comments (author_uid, created_at desc);
-- A question has at most one accepted answer.
create unique index if not exists comments_single_answer_idx
  on public.comments (post_id) where is_answer;

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before update on public.comments
  for each row execute function bsdc.touch_updated_at();

-- Depth, thread root and the comment's own reachability are decided by the
-- database, so a client cannot forge a reply into somebody else's thread.
create or replace function bsdc.prepare_comment()
returns trigger
language plpgsql
as $$
declare
  v_parent public.comments%rowtype;
  v_post   public.posts%rowtype;
begin
  select * into v_post from public.posts where id = new.post_id;
  if not found or v_post.status <> 'published' then
    raise exception 'post not available' using errcode = 'P0002';
  end if;
  if not v_post.allow_comments then
    raise exception 'comments are closed on this post' using errcode = '42501';
  end if;

  if new.parent_id is null then
    new.depth := 0;
    new.root_id := null;
  else
    select * into v_parent from public.comments where id = new.parent_id;
    if not found or v_parent.post_id <> new.post_id then
      raise exception 'parent comment does not belong to this post' using errcode = 'P0002';
    end if;
    -- Beyond three levels a reply joins its grandparent's thread rather than
    -- disappearing into an unreadable indent.
    new.depth := least(v_parent.depth + 1, 3);
    new.root_id := coalesce(v_parent.root_id, v_parent.id);
  end if;

  new.is_answer := false;
  return new;
end;
$$;

drop trigger if exists comments_prepare on public.comments;
create trigger comments_prepare before insert on public.comments
  for each row execute function bsdc.prepare_comment();

create or replace function bsdc.sync_comment_counts()
returns trigger
language plpgsql
as $$
declare
  v_author text;
  v_parent_author text;
begin
  if tg_op = 'INSERT' then
    update public.posts
      set comments_count = comments_count + 1
      where id = new.post_id
      returning author_uid into v_author;
    if new.parent_id is not null then
      update public.comments
        set replies_count = replies_count + 1
        where id = new.parent_id
        returning author_uid into v_parent_author;
      perform bsdc.notify(
        v_parent_author, new.author_uid, 'reply', new.post_id, new.id, left(new.body, 280)
      );
    end if;
    perform bsdc.notify(
      v_author, new.author_uid, 'comment', new.post_id, new.id, left(new.body, 280)
    );
  elsif tg_op = 'DELETE' then
    update public.posts
      set comments_count = greatest(comments_count - 1, 0)
      where id = old.post_id;
    if old.parent_id is not null then
      update public.comments
        set replies_count = greatest(replies_count - 1, 0)
        where id = old.parent_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists comments_sync_counts on public.comments;
create trigger comments_sync_counts after insert or delete on public.comments
  for each row execute function bsdc.sync_comment_counts();

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, uid)
);

create or replace function bsdc.sync_comment_reaction_counts()
returns trigger
language plpgsql
as $$
declare
  v_author text;
  v_post   uuid;
begin
  if tg_op = 'INSERT' then
    update public.comments
      set likes_count = likes_count + 1
      where id = new.comment_id
      returning author_uid, post_id into v_author, v_post;
    perform bsdc.notify(v_author, new.uid, 'reaction', v_post, new.comment_id, 'like');
  elsif tg_op = 'DELETE' then
    update public.comments
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.comment_id;
  end if;
  return null;
end;
$$;

drop trigger if exists comment_reactions_sync on public.comment_reactions;
create trigger comment_reactions_sync after insert or delete on public.comment_reactions
  for each row execute function bsdc.sync_comment_reaction_counts();

create or replace function public.toggle_comment_reaction(p_comment_id uuid)
returns table (reacted boolean, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_total integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.comment_reactions cr
    where cr.comment_id = p_comment_id and cr.uid = v_uid
  ) then
    delete from public.comment_reactions cr
      where cr.comment_id = p_comment_id and cr.uid = v_uid;
    select c.likes_count into v_total from public.comments c where c.id = p_comment_id;
    return query select false, v_total;
  else
    insert into public.comment_reactions (comment_id, uid) values (p_comment_id, v_uid);
    select c.likes_count into v_total from public.comments c where c.id = p_comment_id;
    return query select true, v_total;
  end if;
end;
$$;

-- Only the author of the question may mark an answer, and only one stands.
create or replace function public.mark_answer(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
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
      v_comment.author_uid, v_uid, 'moderation', v_comment.post_id, p_comment_id, 'answer_accepted'
    );
  end if;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- bookmarks and shares
-- ---------------------------------------------------------------------------
create table if not exists public.bookmark_collections (
  id         uuid primary key default gen_random_uuid(),
  uid        text not null references public.profiles (uid) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  unique (uid, name)
);

create table if not exists public.bookmarks (
  uid           text not null references public.profiles (uid) on delete cascade,
  post_id       uuid not null references public.posts (id) on delete cascade,
  collection_id uuid references public.bookmark_collections (id) on delete set null,
  note          text not null default '' check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  primary key (uid, post_id)
);

create index if not exists bookmarks_recent_idx on public.bookmarks (uid, created_at desc);

create or replace function public.toggle_bookmark(p_post_id uuid, p_collection_id uuid default null)
returns boolean
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

  if exists (select 1 from public.bookmarks b where b.uid = v_uid and b.post_id = p_post_id) then
    delete from public.bookmarks b where b.uid = v_uid and b.post_id = p_post_id;
    return false;
  end if;

  insert into public.bookmarks (uid, post_id, collection_id)
    values (v_uid, p_post_id, p_collection_id);
  return true;
end;
$$;

create table if not exists public.post_shares (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  uid        text references public.profiles (uid) on delete set null,
  channel    text not null check (channel in ('copy', 'facebook', 'x', 'linkedin', 'whatsapp', 'telegram', 'native')),
  created_at timestamptz not null default now()
);

create index if not exists post_shares_post_idx on public.post_shares (post_id, created_at desc);

create or replace function public.record_share(p_post_id uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_author text;
begin
  insert into public.post_shares (post_id, uid, channel) values (p_post_id, v_uid, p_channel);
  if v_uid is not null then
    select author_uid into v_author from public.posts where id = p_post_id;
    perform bsdc.notify(v_author, v_uid, 'share', p_post_id, null, p_channel);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- notification write paths for follows and mentions
-- ---------------------------------------------------------------------------
create or replace function bsdc.notify_follow()
returns trigger
language plpgsql
as $$
begin
  perform bsdc.notify(new.followee_uid, new.follower_uid, 'follow');
  return null;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows
  for each row execute function bsdc.notify_follow();

create or replace function bsdc.notify_mention()
returns trigger
language plpgsql
as $$
declare
  v_author text;
begin
  select author_uid into v_author from public.posts where id = new.post_id;
  perform bsdc.notify(new.mentioned_uid, v_author, 'mention', new.post_id);
  return null;
end;
$$;

drop trigger if exists post_mentions_notify on public.post_mentions;
create trigger post_mentions_notify after insert on public.post_mentions
  for each row execute function bsdc.notify_mention();

-- ---------------------------------------------------------------------------
-- inbox helpers
-- ---------------------------------------------------------------------------
create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select count(*)::integer
    from public.notifications
    where uid = bsdc.current_uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_changed integer;
begin
  if v_uid is null then
    return 0;
  end if;

  update public.notifications
    set read_at = now()
    where uid = v_uid
      and read_at is null
      and (p_ids is null or id = any (p_ids));
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

-- Interaction state for a batch of posts in one round trip, so a feed does
-- not fire one query per card.
create or replace function public.post_interaction_state(p_post_ids uuid[])
returns table (
  post_id    uuid,
  reaction   bsdc_reaction,
  bookmarked boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    p.id,
    pr.reaction,
    (b.post_id is not null) as bookmarked
  from unnest(p_post_ids) as p (id)
  left join public.post_reactions pr
    on pr.post_id = p.id and pr.uid = bsdc.current_uid()
  left join public.bookmarks b
    on b.post_id = p.id and b.uid = bsdc.current_uid();
$$;
