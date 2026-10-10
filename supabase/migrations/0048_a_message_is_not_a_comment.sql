-- ---------------------------------------------------------------------------
-- A direct message is not a comment.
--
-- `send_message` told the recipient through `bsdc.notify(..., 'comment', ...)`,
-- because the notification vocabulary had no word for a message. The inbox
-- then rendered that kind with its sentence for a comment — "{{actor}}
-- commented on your post" — on a notification that had no post at all, and
-- carried the *message id* in the `comment_id` column, so even a correct
-- sentence would have had nothing to link to.
--
-- Three changes:
--
-- `message` joined the notification vocabulary in 0047, which has to be its
-- own file: a label added inside a transaction may not be used in that same
-- transaction, and one migration file is one transaction.
--
--   1. (0047) `message` joins the notification vocabulary.
--   2. `notifications` gains a `conversation_id` column, so a message
--      notification can open the thread it is about. It cascades with the
--      conversation, exactly like the post and comment columns already do.
--   3. The unique index that collapses repeats now includes the conversation,
--      so one line per person per thread — and a thread reopened a week later
--      still collapses into the same line, which is what a chat notification
--      should do.
--
-- `bsdc.notify()` gains the conversation parameter rather than a second
-- function, so every existing caller keeps working unchanged.
--
alter table public.notifications
  add column if not exists conversation_id uuid
    references public.conversations (id) on delete cascade;

-- The old index did not know about the new column, so a member with two
-- threads against the same actor collapsed both into one line.
drop index if exists public.notifications_unique_idx;
create unique index if not exists notifications_unique_idx
  on public.notifications (
    uid,
    actor_uid,
    kind,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- The signature grows, so the old one has to go: a second overload with a
-- defaulted last argument would leave two candidates for every existing call.
drop function if exists bsdc.notify(text, text, bsdc_notification_kind, uuid, uuid, text);

-- The preference switches gain the new category, and the mapping stays in one
-- place: `notification_allowed` is the only thing that decides what a member
-- hears, and `notify` asks it.
create or replace function bsdc.notification_allowed(
  p_uid  text,
  p_kind bsdc_notification_kind
)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select case p_kind
    when 'follow'  then coalesce((p.notifications ->> 'followers')::boolean, true)
    when 'comment' then coalesce((p.notifications ->> 'comments')::boolean, true)
    when 'reply'   then coalesce((p.notifications ->> 'comments')::boolean, true)
    when 'mention' then coalesce((p.notifications ->> 'mentions')::boolean, true)
    when 'message' then coalesce((p.notifications ->> 'messages')::boolean, true)
    else true
  end
  from public.profiles p
  where p.uid = p_uid;
$$;

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

  -- The member's own switches, read on the way in rather than filtered on the
  -- way out: a muted kind is never stored at all.
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
  do update set created_at = now(), read_at = null, body = excluded.body;
end;
$$;

-- `send_message` now names the message kind and points at the thread. The
-- collapsing index means a member hears once per thread, not once per line.
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
  -- collapsed per conversation by the unique index above.
  for v_member in
    select cm.uid from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.uid <> v_uid
      and cm.left_at is null
      and (cm.muted_until is null or cm.muted_until < now())
  loop
    perform bsdc.notify(
      v_member, v_uid, 'message', null, null, left(v_message.body, 280), p_conversation_id
    );
  end loop;

  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and uid = v_uid;

  return v_message;
end;
$$;
