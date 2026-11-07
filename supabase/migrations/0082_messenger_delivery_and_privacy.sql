-- Reliable messenger delivery and conversation privacy.
-- Apply before deploying the client which calls send_message_once. The old
-- send_message signature remains available to older clients.

-- A deleted text message is a tombstone, not an invalid empty message.
alter table public.messages drop constraint if exists messages_text_has_body;
alter table public.messages add constraint messages_text_has_body
  check (deleted_at is not null or kind <> 'text' or char_length(btrim(body)) >= 1);

-- Conversation members can see each other's membership and read markers, but
-- an unsent draft belongs only to its author. conversation_state() is a
-- SECURITY DEFINER function which returns the caller's own draft. Keep column
-- UPDATE privileges so existing clients can continue to save their own draft.
revoke select on public.conversation_members from public, anon, authenticated;
revoke select (draft_body) on public.conversation_members from public, anon, authenticated;
grant select (conversation_id, uid, role, joined_at, last_read_at, muted_until,
              left_at, is_pinned, is_archived)
  on public.conversation_members to authenticated;

-- Reject cross-thread reply targets, including requests from old clients.
-- A direct conversation must stop accepting new messages after either member
-- blocks the other, not just when somebody opens it for the first time.
create or replace function bsdc.guard_message_context()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages parent
    where parent.id = new.reply_to and parent.conversation_id = new.conversation_id
  ) then
    raise exception 'reply target is not in this conversation' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    join public.blocks b on
      (b.blocker_uid = new.sender_uid and b.blocked_uid = cm.uid)
      or (b.blocked_uid = new.sender_uid and b.blocker_uid = cm.uid)
    where c.id = new.conversation_id and c.kind = 'direct'
      and cm.uid <> new.sender_uid
  ) then
    raise exception 'conversation not available' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function bsdc.guard_message_context() from public, anon, authenticated;
drop trigger if exists messages_guard_context on public.messages;
create trigger messages_guard_context
  before insert or update of reply_to, conversation_id on public.messages
  for each row execute function bsdc.guard_message_context();

-- Keep the request key on the delivered line as well. The sender can then
-- reconcile a committed message received through Realtime or a later read
-- even when the original HTTP response was lost. Only the definer send RPC
-- writes this column; existing member update grants do not include it.
alter table public.messages add column if not exists client_id uuid;
-- A table-level UPDATE grant would override a column-level revoke. Preserve
-- only the existing editable message columns for authenticated clients.
revoke update on public.messages from public, anon, authenticated;
revoke update (client_id) on public.messages from public, anon, authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;

-- A request key is scoped to a sender and bound to the entire original input.
-- The advisory lock and the insert happen in the same transaction. A timeout
-- after commit can therefore be retried without a duplicate message or a
-- second notification, even when two retries arrive at the same time.
create table if not exists bsdc.message_send_requests (
  sender_uid text not null references public.profiles(uid) on delete cascade,
  client_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  request_hash bytea not null,
  created_at timestamptz not null default now(),
  primary key (sender_uid, client_id)
);
-- Preserve the request key even if somebody hard-deletes the original row.
-- This also makes reapplication safe after an earlier version of the table.
alter table bsdc.message_send_requests alter column message_id drop not null;
alter table bsdc.message_send_requests drop constraint if exists message_send_requests_message_id_fkey;
alter table bsdc.message_send_requests add constraint message_send_requests_message_id_fkey
  foreign key (message_id) references public.messages(id) on delete set null;
revoke all on table bsdc.message_send_requests from public, anon, authenticated;

create or replace function public.send_message_once(
  p_conversation_id uuid,
  p_client_id uuid,
  p_body text,
  p_kind bsdc_message_kind default 'text',
  p_media_url text default '',
  p_media_name text default '',
  p_code_language text default '',
  p_reply_to uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_hash bytea;
  v_existing bsdc.message_send_requests%rowtype;
  v_message public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'message request key is required' using errcode = '22023';
  end if;
  if not bsdc.is_conversation_member(p_conversation_id, v_uid) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;

  v_hash := extensions.digest(
    convert_to(jsonb_build_array(p_conversation_id, coalesce(p_body, ''), p_kind,
      coalesce(p_media_url, ''), coalesce(p_media_name, ''),
      coalesce(p_code_language, ''), p_reply_to)::text, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(v_uid || ':' || p_client_id::text, 0));
  select * into v_existing from bsdc.message_send_requests
    where sender_uid = v_uid and client_id = p_client_id;
  if found then
    if v_existing.conversation_id <> p_conversation_id or v_existing.request_hash <> v_hash then
      raise exception 'message request key already used for different content' using errcode = '22023';
    end if;
    if v_existing.message_id is null then
      raise exception 'previously sent message is no longer available' using errcode = '22023';
    end if;
    select * into strict v_message from public.messages where id = v_existing.message_id;
    if v_message.client_id is null then
      update public.messages set client_id = p_client_id
        where id = v_message.id returning * into v_message;
    end if;
    return v_message;
  end if;

  v_message := public.send_message(p_conversation_id, p_body, p_kind, p_media_url,
                                   p_media_name, p_code_language, p_reply_to);
  update public.messages set client_id = p_client_id
    where id = v_message.id returning * into v_message;
  insert into bsdc.message_send_requests (sender_uid, client_id, conversation_id, message_id, request_hash)
    values (v_uid, p_client_id, p_conversation_id, v_message.id, v_hash);
  return v_message;
end;
$$;
revoke all on function public.send_message_once(uuid, uuid, text, bsdc_message_kind, text, text, text, uuid)
  from public, anon;
grant execute on function public.send_message_once(uuid, uuid, text, bsdc_message_kind, text, text, text, uuid)
  to authenticated;

-- Opening the same direct conversation concurrently must not produce a unique
-- constraint error. The conflicting row lock serializes the two creators.
create or replace function public.open_direct_conversation(p_other_uid text)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_id uuid;
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
  if exists (
    select 1 from public.blocks
    where (blocker_uid = v_uid and blocked_uid = p_other_uid)
       or (blocker_uid = p_other_uid and blocked_uid = v_uid)
  ) then
    raise exception 'conversation not available' using errcode = '42501';
  end if;

  insert into public.conversations (kind, created_by, direct_key)
    values ('direct', v_uid, bsdc.direct_key(v_uid, p_other_uid))
    on conflict (direct_key) where direct_key is not null
    do update set direct_key = excluded.direct_key
    returning id into v_id;
  insert into public.conversation_members (conversation_id, uid, role)
    values (v_id, v_uid, 'owner'), (v_id, p_other_uid, 'member')
    on conflict (conversation_id, uid) do nothing;
  update public.conversation_members set left_at = null
    where conversation_id = v_id and uid = v_uid;
  return v_id;
end;
$$;

-- Existing cross-thread replies must not reveal the other thread.
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
set search_path = public, bsdc, extensions, pg_temp
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
    and parent.conversation_id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and bsdc.is_conversation_member(p_conversation_id, bsdc.current_uid())
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(p_limit, 120));
$$;

-- Timestamp-only cursors lose messages when several share a transaction's
-- timestamp. Keep the old RPC for deployed clients, and page by (time, id)
-- in the new client so ties are deterministic and no rows are skipped.
create or replace function public.conversation_messages_page(
  p_conversation_id uuid,
  p_before          timestamptz default null,
  p_before_id       uuid default null,
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
  client_id         uuid,
  reactions         jsonb,
  my_reactions      text[],
  read_by           text[],
  starred           boolean,
  pinned            boolean
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
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
    m.client_id,
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
    and parent.conversation_id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and bsdc.is_conversation_member(p_conversation_id, bsdc.current_uid())
    and (p_before is null or m.created_at < p_before
         or (p_before_id is not null and m.created_at = p_before and m.id < p_before_id))
  order by m.created_at desc, m.id desc
  limit greatest(1, least(p_limit, 120));
$$;
revoke all on function public.conversation_messages_page(uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.conversation_messages_page(uuid, timestamptz, uuid, integer)
  to authenticated;


-- A receipt must not mark newer, unseen lines as read just because they arrived
-- between rendering a message and the receipt transaction reaching Postgres.
create or replace function public.mark_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_conversation uuid;
  v_created_at timestamptz;
begin
  if v_uid is null then return; end if;
  select m.conversation_id, m.created_at into v_conversation, v_created_at
    from public.messages m
    where m.id = p_message_id and bsdc.is_conversation_member(m.conversation_id, v_uid);
  if v_conversation is null then return; end if;
  insert into public.message_receipts (message_id, uid, read_at)
    values (p_message_id, v_uid, now())
    on conflict (message_id, uid)
    do update set read_at = coalesce(public.message_receipts.read_at, now());
  update public.conversation_members
    set last_read_at = greatest(last_read_at, v_created_at)
    where conversation_id = v_conversation and uid = v_uid;
end;
$$;

-- An admin of one group is not an admin of every conversation. Qualify the
-- outer target row and disallow inserting people into a two-person direct chat.
drop policy if exists conversation_members_insert_admin on public.conversation_members;
create policy conversation_members_insert_admin on public.conversation_members
  for insert with check (
    role = 'member'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_members.conversation_id and c.kind = 'group'
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id
        and cm.uid = bsdc.current_uid()
        and cm.left_at is null
        and cm.role in ('owner', 'admin')
    )
  );

create or replace function public.conversation_state(p_conversation_id uuid)
returns table (
  is_member boolean,
  muted boolean,
  is_pinned boolean,
  is_archived boolean,
  draft_body text,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select true, (cm.muted_until is not null and cm.muted_until > now()),
         cm.is_pinned, cm.is_archived, cm.draft_body, cm.last_read_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.uid = bsdc.current_uid()
    and cm.left_at is null;
$$;
