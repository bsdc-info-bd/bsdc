-- ---------------------------------------------------------------------------
-- BSDC Messenger.
--
-- Durable messages live in Postgres; only ephemeral signals (typing, presence)
-- go to Realtime Database. A conversation is either a direct pair or a named
-- group. Direct pairs are deduplicated by a deterministic key, so opening a
-- chat twice can never create a second thread.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_conversation_kind') then
    create type bsdc_conversation_kind as enum ('direct', 'group');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_message_kind') then
    create type bsdc_message_kind as enum ('text', 'image', 'file', 'snippet', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_member_role') then
    create type bsdc_member_role as enum ('owner', 'admin', 'member');
  end if;
end;
$$;

create table if not exists public.conversations (
  id             uuid primary key default gen_random_uuid(),
  kind           bsdc_conversation_kind not null default 'direct',
  title          text not null default '' check (char_length(title) <= 80),
  avatar_url     text not null default '',
  created_by     text references public.profiles (uid) on delete set null,
  -- For a direct chat this is the two uids sorted and joined, which gives the
  -- pair a single canonical row enforced by the unique index below.
  direct_key     text,
  last_message_at timestamptz,
  last_message_preview text not null default '' check (char_length(last_message_preview) <= 160),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint conversations_direct_key_shape
    check (kind <> 'direct' or direct_key is not null),
  constraint conversations_group_has_title
    check (kind <> 'group' or char_length(btrim(title)) >= 1)
);

create unique index if not exists conversations_direct_key_idx
  on public.conversations (direct_key) where direct_key is not null;
create index if not exists conversations_recent_idx
  on public.conversations (last_message_at desc nulls last);

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  uid             text not null references public.profiles (uid) on delete cascade,
  role            bsdc_member_role not null default 'member',
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default to_timestamp(0),
  muted_until     timestamptz,
  left_at         timestamptz,
  primary key (conversation_id, uid)
);

create index if not exists conversation_members_uid_idx
  on public.conversation_members (uid) where left_at is null;

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_uid      text references public.profiles (uid) on delete set null,
  kind            bsdc_message_kind not null default 'text',
  body            text not null default '' check (char_length(body) <= 8000),
  media_url       text not null default '',
  media_name      text not null default '' check (char_length(media_name) <= 160),
  code_language   text not null default '',
  reply_to        uuid references public.messages (id) on delete set null,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint messages_text_has_body
    check (kind <> 'text' or char_length(btrim(body)) >= 1),
  constraint messages_media_has_url
    check (kind not in ('image', 'file') or char_length(media_url) >= 1)
);

create index if not exists messages_thread_idx
  on public.messages (conversation_id, created_at desc);

-- Membership test used by every policy below. A member who left keeps their
-- history but stops receiving anything new.
create or replace function bsdc.is_conversation_member(p_conversation_id uuid, p_uid text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.uid = p_uid
      and cm.left_at is null
  );
$$;

-- The conversation list is sorted by activity, so the preview and timestamp
-- are denormalised onto the conversation as messages arrive.
create or replace function bsdc.sync_conversation_activity()
returns trigger
language plpgsql
as $$
declare
  v_preview text;
begin
  v_preview := case new.kind
    when 'text' then left(new.body, 160)
    when 'image' then 'image'
    when 'file' then coalesce(nullif(left(new.media_name, 160), ''), 'file')
    when 'snippet' then 'snippet'
    else left(new.body, 160)
  end;

  update public.conversations
    set last_message_at = new.created_at,
        last_message_preview = v_preview
    where id = new.conversation_id;

  -- The sender has by definition read their own message.
  update public.conversation_members
    set last_read_at = greatest(last_read_at, new.created_at)
    where conversation_id = new.conversation_id and uid = new.sender_uid;

  return null;
end;
$$;

drop trigger if exists messages_sync_activity on public.messages;
create trigger messages_sync_activity after insert on public.messages
  for each row execute function bsdc.sync_conversation_activity();

-- ---------------------------------------------------------------------------
-- opening a conversation
-- ---------------------------------------------------------------------------

-- Deterministic pair key so the same two members always map to one row.
create or replace function bsdc.direct_key(p_a text, p_b text)
returns text
language sql
immutable
as $$
  select case when p_a < p_b then p_a || ':' || p_b else p_b || ':' || p_a end;
$$;

create or replace function public.open_direct_conversation(p_other_uid text)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid  text := bsdc.current_uid();
  v_key  text;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_other_uid = v_uid then
    raise exception 'cannot open a conversation with yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where uid = p_other_uid) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  -- A block in either direction closes the channel.
  if exists (
    select 1 from public.blocks
    where (blocker_uid = v_uid and blocked_uid = p_other_uid)
       or (blocker_uid = p_other_uid and blocked_uid = v_uid)
  ) then
    raise exception 'conversation not available' using errcode = '42501';
  end if;

  v_key := bsdc.direct_key(v_uid, p_other_uid);
  select id into v_id from public.conversations where direct_key = v_key;

  if v_id is null then
    insert into public.conversations (kind, created_by, direct_key)
      values ('direct', v_uid, v_key)
      returning id into v_id;
    insert into public.conversation_members (conversation_id, uid, role)
      values (v_id, v_uid, 'owner'), (v_id, p_other_uid, 'member');
  else
    -- Re-opening after leaving restores membership rather than duplicating it.
    update public.conversation_members
      set left_at = null
      where conversation_id = v_id and uid = v_uid;
  end if;

  return v_id;
end;
$$;

create or replace function public.create_group_conversation(
  p_title   text,
  p_members text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_id  uuid;
  v_member text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'a group needs a name' using errcode = '22023';
  end if;
  if coalesce(array_length(p_members, 1), 0) > 256 then
    raise exception 'a group may hold at most 256 members' using errcode = '22023';
  end if;

  insert into public.conversations (kind, title, created_by)
    values ('group', btrim(p_title), v_uid)
    returning id into v_id;

  insert into public.conversation_members (conversation_id, uid, role)
    values (v_id, v_uid, 'owner');

  foreach v_member in array coalesce(p_members, array[]::text[]) loop
    if v_member <> v_uid and exists (select 1 from public.profiles where uid = v_member) then
      insert into public.conversation_members (conversation_id, uid)
        values (v_id, v_member)
        on conflict do nothing;
    end if;
  end loop;

  return v_id;
end;
$$;

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
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_message public.messages%rowtype;
  v_member  text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not bsdc.is_conversation_member(p_conversation_id, v_uid) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;

  insert into public.messages (
    conversation_id, sender_uid, kind, body, media_url, media_name, code_language, reply_to
  )
  values (
    p_conversation_id, v_uid, p_kind, coalesce(p_body, ''), coalesce(p_media_url, ''),
    coalesce(p_media_name, ''), coalesce(p_code_language, ''), p_reply_to
  )
  returning * into v_message;

  -- Every other member who has not muted the thread gets one inbox line,
  -- collapsed per conversation by bsdc.notify()'s unique index.
  for v_member in
    select cm.uid from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.uid <> v_uid
      and cm.left_at is null
      and (cm.muted_until is null or cm.muted_until < now())
  loop
    perform bsdc.notify(v_member, v_uid, 'comment', null, v_message.id, left(v_message.body, 280));
  end loop;

  return v_message;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public, bsdc, pg_temp
as $$
  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and uid = bsdc.current_uid();
$$;

create or replace function public.leave_conversation(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public, bsdc, pg_temp
as $$
  update public.conversation_members
    set left_at = now()
    where conversation_id = p_conversation_id and uid = bsdc.current_uid();
$$;

-- The inbox in one round trip: the conversation, who else is in it, and how
-- much of it this member has not read.
create or replace function public.conversation_inbox(p_limit integer default 40)
returns table (
  id              uuid,
  kind            bsdc_conversation_kind,
  title           text,
  avatar_url      text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count    integer,
  muted           boolean,
  other_uid       text,
  other_username  text,
  other_name      text,
  other_avatar    text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with mine as (
    select cm.conversation_id, cm.last_read_at, cm.muted_until
    from public.conversation_members cm
    where cm.uid = bsdc.current_uid() and cm.left_at is null
  )
  select
    c.id,
    c.kind,
    c.title,
    c.avatar_url,
    c.last_message_at,
    c.last_message_preview,
    (
      select count(*)::integer from public.messages m
      where m.conversation_id = c.id
        and m.created_at > mine.last_read_at
        and m.sender_uid is distinct from bsdc.current_uid()
        and m.deleted_at is null
    ) as unread_count,
    (mine.muted_until is not null and mine.muted_until > now()) as muted,
    other.uid,
    other.username::text,
    other.display_name,
    other.avatar_url
  from mine
  join public.conversations c on c.id = mine.conversation_id
  left join lateral (
    select p.uid, p.username, p.display_name, p.avatar_url
    from public.conversation_members cm2
    join public.profiles p on p.uid = cm2.uid
    where cm2.conversation_id = c.id
      and cm2.uid <> bsdc.current_uid()
    order by cm2.joined_at
    limit 1
  ) as other on c.kind = 'direct'
  order by c.last_message_at desc nulls last
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(sum(
    (
      select count(*) from public.messages m
      where m.conversation_id = cm.conversation_id
        and m.created_at > cm.last_read_at
        and m.sender_uid is distinct from cm.uid
        and m.deleted_at is null
    )
  ), 0)::integer
  from public.conversation_members cm
  where cm.uid = bsdc.current_uid() and cm.left_at is null;
$$;
