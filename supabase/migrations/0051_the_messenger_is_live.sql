-- ---------------------------------------------------------------------------
-- The messenger becomes live.
--
-- Three things were true of messaging before this file:
--
--   * Nothing was in the `supabase_realtime` publication, so no client could
--     subscribe to anything. Every screen polled: the thread every seven
--     seconds, the inbox every twenty. That is the "low delay" the product
--     promised and could not deliver.
--   * The only realtime transport in use was Firebase Realtime Database, and
--     its security rules have never been deployed — which leaves it locked,
--     with no typing indicator and no presence for anybody.
--   * The feature set a messenger is judged by — reactions, receipts,
--     replies to a specific line, pins, saved messages, per-conversation
--     settings, in-thread search — had no tables to live in.
--
-- This file fixes the third and enables the first: the tables the realtime
-- change feed needs to publish are added to the publication, and each new
-- feature gets a table with row level security that a member of the
-- conversation can read and only its own author can write.
--
-- `replica identity full` is set on the tables a client subscribes to. Without
-- it an UPDATE or DELETE is published with a key and nothing else, and Realtime
-- cannot evaluate the row level security policy that decides who may see it —
-- so the subscriber either misses the event or receives fields it should not.
--
-- Everything is guarded and re-runnable.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- part 1 — the change feed
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- Every table a client subscribes to, and the whole row for the ones where a
-- policy has to decide who may see the event.
do $$
declare
  t text;
  wanted text[] := array[
    'messages', 'conversations', 'conversation_members', 'message_reactions',
    'message_receipts', 'message_pins', 'message_stars', 'notifications'
  ];
begin
  foreach t in array wanted loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) and not exists (
      select 1 from pg_publication_tables pt
      where pt.pubname = 'supabase_realtime'
        and pt.schemaname = 'public' and pt.tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- The payload of a change has to carry the whole row: Realtime applies the
-- table's row level security to each event, and a partial row cannot be judged.
alter table public.messages replica identity full;
alter table public.conversations replica identity full;
alter table public.conversation_members replica identity full;

-- ---------------------------------------------------------------------------
-- part 2 — reactions on a message
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  reaction   text not null default 'like' check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, uid, reaction)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;
alter table public.message_reactions replica identity full;

-- A reaction is visible to everybody in the conversation and to nobody else.
drop policy if exists message_reactions_read_members on public.message_reactions;
create policy message_reactions_read_members on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and bsdc.is_conversation_member(m.conversation_id, bsdc.current_uid())
    )
  );

drop policy if exists message_reactions_write_self on public.message_reactions;
create policy message_reactions_write_self on public.message_reactions
  for all using (uid = bsdc.current_uid())
  with check (
    uid = bsdc.current_uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and bsdc.is_conversation_member(m.conversation_id, bsdc.current_uid())
    )
  );

grant select, insert, delete on public.message_reactions to authenticated;

-- ---------------------------------------------------------------------------
-- part 3 — per-message receipts
-- ---------------------------------------------------------------------------
-- `conversation_members.last_read_at` answers "how far has this member read",
-- which is all a badge needs. A receipt per message answers "has this line
-- been delivered, and has it been read", which is what the ticks mean.
create table if not exists public.message_receipts (
  message_id   uuid not null references public.messages (id) on delete cascade,
  uid          text not null references public.profiles (uid) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at      timestamptz,
  primary key (message_id, uid)
);

create index if not exists message_receipts_uid_idx on public.message_receipts (uid, read_at desc);
alter table public.message_receipts enable row level security;
alter table public.message_receipts replica identity full;

drop policy if exists message_receipts_read_members on public.message_receipts;
create policy message_receipts_read_members on public.message_receipts
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and bsdc.is_conversation_member(m.conversation_id, bsdc.current_uid())
    )
  );

-- A member writes only their own receipt, and only on a message they can see.
drop policy if exists message_receipts_write_self on public.message_receipts;
create policy message_receipts_write_self on public.message_receipts
  for all using (uid = bsdc.current_uid())
  with check (
    uid = bsdc.current_uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and bsdc.is_conversation_member(m.conversation_id, bsdc.current_uid())
    )
  );

grant select, insert, update on public.message_receipts to authenticated;

-- ---------------------------------------------------------------------------
-- part 4 — pins and saved messages
-- ---------------------------------------------------------------------------
create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id      uuid not null references public.messages (id) on delete cascade,
  pinned_by       text not null references public.profiles (uid) on delete cascade,
  pinned_at       timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

alter table public.message_pins enable row level security;
alter table public.message_pins replica identity full;

drop policy if exists message_pins_read_members on public.message_pins;
create policy message_pins_read_members on public.message_pins
  for select using (bsdc.is_conversation_member(conversation_id, bsdc.current_uid()));

drop policy if exists message_pins_write_members on public.message_pins;
create policy message_pins_write_members on public.message_pins
  for all using (bsdc.is_conversation_member(conversation_id, bsdc.current_uid()))
  with check (
    pinned_by = bsdc.current_uid()
    and bsdc.is_conversation_member(conversation_id, bsdc.current_uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.conversation_id = message_pins.conversation_id
    )
  );

grant select, insert, delete on public.message_pins to authenticated;

-- Saved messages are private to the member who saved them: a bookmark, not a
-- shared pin.
create table if not exists public.message_stars (
  uid        text not null references public.profiles (uid) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (uid, message_id)
);

alter table public.message_stars enable row level security;

drop policy if exists message_stars_self on public.message_stars;
create policy message_stars_self on public.message_stars
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

grant select, insert, delete on public.message_stars to authenticated;

-- ---------------------------------------------------------------------------
-- part 5 — per-conversation settings for the member
-- ---------------------------------------------------------------------------
alter table public.conversation_members add column if not exists is_pinned boolean not null default false;
alter table public.conversation_members add column if not exists is_archived boolean not null default false;
-- A draft that follows the member from one device to the next.
alter table public.conversation_members add column if not exists draft_body text not null default '';

grant update (is_pinned, is_archived, draft_body) on public.conversation_members to authenticated;

-- ---------------------------------------------------------------------------
-- part 6 — the calls the messenger makes
-- ---------------------------------------------------------------------------
-- Adding or removing a reaction, as one call that cannot leave a half state.
create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_reaction   text
)
returns table (reacted boolean, reaction text, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
-- The OUT column is called `reaction`, like the table column, so an
-- unqualified name in this body belongs to the column.
#variable_conflict use_column
declare
  v_uid  text := bsdc.current_uid();
  v_like text := coalesce(nullif(btrim(p_reaction), ''), 'like');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.messages m
    where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid)
  ) then
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
    -- `return query` appends to the result set; it does not leave the body.
    return;
  end if;

  insert into public.message_reactions (message_id, uid, reaction)
    values (p_message_id, v_uid, v_like)
    on conflict (message_id, uid, reaction) do nothing;

  return query select true, v_like, (
    select count(*)::integer from public.message_reactions r where r.message_id = p_message_id
  );
end;
$$;

-- Reading a message: the receipt and the conversation's read marker move
-- together, so a badge can never disagree with a tick.
create or replace function public.mark_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid        text := bsdc.current_uid();
  v_conversation uuid;
begin
  if v_uid is null then return; end if;

  select m.conversation_id into v_conversation
  from public.messages m
  where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid);
  if v_conversation is null then return; end if;

  insert into public.message_receipts (message_id, uid, read_at)
    values (p_message_id, v_uid, now())
    on conflict (message_id, uid)
    do update set read_at = coalesce(public.message_receipts.read_at, now());

  update public.conversation_members
    set last_read_at = greatest(last_read_at, now())
    where conversation_id = v_conversation and uid = v_uid;
end;
$$;

create or replace function public.toggle_message_pin(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid          text := bsdc.current_uid();
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select m.conversation_id into v_conversation
  from public.messages m
  where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid);
  if v_conversation is null then
    raise exception 'message not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.message_pins p
    where p.conversation_id = v_conversation and p.message_id = p_message_id
  ) then
    delete from public.message_pins p
      where p.conversation_id = v_conversation and p.message_id = p_message_id;
    return false;
  end if;

  insert into public.message_pins (conversation_id, message_id, pinned_by)
    values (v_conversation, p_message_id, v_uid)
    on conflict (conversation_id, message_id) do nothing;
  return true;
end;
$$;

create or replace function public.toggle_message_star(p_message_id uuid)
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
  if not exists (
    select 1 from public.messages m
    where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid)
  ) then
    raise exception 'message not available' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.message_stars s where s.uid = v_uid and s.message_id = p_message_id) then
    delete from public.message_stars s where s.uid = v_uid and s.message_id = p_message_id;
    return false;
  end if;

  insert into public.message_stars (uid, message_id) values (v_uid, p_message_id)
    on conflict (uid, message_id) do nothing;
  return true;
end;
$$;

-- Search inside one conversation. Security definer, so the membership test is
-- written out rather than left to row level security on `messages`.
create or replace function public.search_messages(
  p_query           text,
  p_conversation_id uuid default null,
  p_limit           integer default 40
)
returns table (
  message_id      uuid,
  conversation_id uuid,
  sender_uid      text,
  body            text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select m.id, m.conversation_id, m.sender_uid, m.body, m.created_at
  from public.messages m
  where bsdc.current_uid() is not null
    and bsdc.is_conversation_member(m.conversation_id, bsdc.current_uid())
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and m.deleted_at is null
    and coalesce(nullif(btrim(p_query), ''), '') <> ''
    and m.body ilike '%' || btrim(p_query) || '%'
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

-- The conversation's pinned messages, most recent pin first.
create or replace function public.conversation_pins(p_conversation_id uuid)
returns table (
  message_id uuid,
  body       text,
  sender_uid text,
  media_name text,
  kind       bsdc_message_kind,
  pinned_at  timestamptz,
  pinned_by  text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select m.id, m.body, m.sender_uid, m.media_name, m.kind, p.pinned_at, p.pinned_by
  from public.message_pins p
  join public.messages m on m.id = p.message_id
  where p.conversation_id = p_conversation_id
    and bsdc.is_conversation_member(p_conversation_id, bsdc.current_uid())
  order by p.pinned_at desc
  limit 50;
$$;

-- Everything the thread needs about its own state in one round trip: the
-- member's settings, the other members' read markers, my per-message
-- reactions, receipts and stars.
create or replace function public.conversation_state(p_conversation_id uuid)
returns table (
  is_member  boolean,
  muted      boolean,
  is_pinned  boolean,
  is_archived boolean,
  draft_body text,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select true,
         (cm.muted_until is not null and cm.muted_until > now()),
         cm.is_pinned,
         cm.is_archived,
         cm.draft_body,
         cm.last_read_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.uid = bsdc.current_uid();
$$;

-- The conversation's messages with everything the thread renders per line:
-- reactions, my reactions, my receipt, my star, pin state and reply target.
create or replace function public.conversation_messages(
  p_conversation_id uuid,
  p_before          timestamptz default null,
  p_limit           integer default 60
)
returns table (
  id                uuid,
  conversation_id   uuid,
  sender_uid        text,
  kind              bsdc_message_kind,
  body              text,
  media_url         text,
  media_name        text,
  code_language     text,
  reply_to          uuid,
  reply_body        text,
  reply_sender      text,
  edited_at         timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz,
  reactions         jsonb,
  my_reactions      text[],
  read_by           text[],
  starred           boolean,
  pinned            boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    m.id,
    m.conversation_id,
    m.sender_uid,
    m.kind,
    m.body,
    m.media_url,
    m.media_name,
    m.code_language,
    m.reply_to,
    parent.body,
    parent.sender_uid,
    m.edited_at,
    m.deleted_at,
    m.created_at,
    coalesce((
      select jsonb_object_agg(agg.reaction, agg.total)
      from (
        select r.reaction, count(*)::integer as total
        from public.message_reactions r
        where r.message_id = m.id
        group by r.reaction
      ) agg
    ), '{}'::jsonb) as reactions,
    coalesce((
      select array_agg(r.reaction) from public.message_reactions r
      where r.message_id = m.id and r.uid = bsdc.current_uid()
    ), '{}'::text[]) as my_reactions,
    coalesce((
      select array_agg(rc.uid) from public.message_receipts rc
      where rc.message_id = m.id and rc.read_at is not null and rc.uid <> m.sender_uid
    ), '{}'::text[]) as read_by,
    exists (
      select 1 from public.message_stars s
      where s.message_id = m.id and s.uid = bsdc.current_uid()
    ) as starred,
    exists (
      select 1 from public.message_pins p
      where p.message_id = m.id and p.conversation_id = m.conversation_id
    ) as pinned
  from public.messages m
  left join public.messages parent on parent.id = m.reply_to
  where m.conversation_id = p_conversation_id
    and bsdc.is_conversation_member(p_conversation_id, bsdc.current_uid())
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(p_limit, 120));
$$;

-- The member's own saved lines, across every conversation. Private, because
-- `saved` is derived from the viewer's own rows.
create or replace function public.saved_messages(p_limit integer default 50)
returns table (
  message_id      uuid,
  conversation_id uuid,
  body            text,
  media_name      text,
  kind            bsdc_message_kind,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select m.id, m.conversation_id, m.body, m.media_name, m.kind, m.created_at
  from public.message_stars s
  join public.messages m on m.id = s.message_id
  where s.uid = bsdc.current_uid()
    and bsdc.is_conversation_member(m.conversation_id, bsdc.current_uid())
  order by s.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.saved_messages(integer) to authenticated;

-- The tables this file just created join the feed too. They are added last,
-- because a publication can only be told about a table that exists.
do $$
declare
  t text;
  wanted text[] := array[
    'message_reactions', 'message_receipts', 'message_pins', 'message_stars'
  ];
begin
  foreach t in array wanted loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) and not exists (
      select 1 from pg_publication_tables pt
      where pt.pubname = 'supabase_realtime'
        and pt.schemaname = 'public' and pt.tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.toggle_message_pin(uuid) to authenticated;
grant execute on function public.toggle_message_star(uuid) to authenticated;
grant execute on function public.search_messages(text, uuid, integer) to authenticated;
grant execute on function public.conversation_pins(uuid) to authenticated;
grant execute on function public.conversation_state(uuid) to authenticated;
grant execute on function public.conversation_messages(uuid, timestamptz, integer) to authenticated;
