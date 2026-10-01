-- ---------------------------------------------------------------------------
-- Row level security for BSDC Messenger.
--
-- A conversation is visible only to its members, and a message only to the
-- members of its conversation. Creating conversations and sending messages
-- go through the security-definer functions, which is what keeps the
-- membership rules in one place.
-- ---------------------------------------------------------------------------

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

-- ---------------------------- conversations --------------------------------
drop policy if exists conversations_read_members on public.conversations;
create policy conversations_read_members on public.conversations
  for select using (bsdc.is_conversation_member(id, bsdc.current_uid()));

-- Only an owner or admin may rename a group or change its picture.
drop policy if exists conversations_update_admins on public.conversations;
create policy conversations_update_admins on public.conversations
  for update using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id
        and cm.uid = bsdc.current_uid()
        and cm.left_at is null
        and cm.role in ('owner', 'admin')
    )
  )
  with check (kind = 'group');

-- ------------------------- conversation_members ----------------------------
drop policy if exists conversation_members_read on public.conversation_members;
create policy conversation_members_read on public.conversation_members
  for select using (
    uid = bsdc.current_uid()
    or bsdc.is_conversation_member(conversation_id, bsdc.current_uid())
  );

-- A member may change only their own row: read marker, mute, leaving.
drop policy if exists conversation_members_update_self on public.conversation_members;
create policy conversation_members_update_self on public.conversation_members
  for update using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- Admins invite; the invited row is created on their behalf.
drop policy if exists conversation_members_insert_admin on public.conversation_members;
create policy conversation_members_insert_admin on public.conversation_members
  for insert with check (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id
        and cm.uid = bsdc.current_uid()
        and cm.left_at is null
        and cm.role in ('owner', 'admin')
    )
  );

-- ------------------------------- messages ----------------------------------
drop policy if exists messages_read_members on public.messages;
create policy messages_read_members on public.messages
  for select using (bsdc.is_conversation_member(conversation_id, bsdc.current_uid()));

-- Inserts go through public.send_message(); direct inserts stay closed so the
-- activity trigger and notification fan-out can never be bypassed.

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update using (sender_uid = bsdc.current_uid())
  with check (sender_uid = bsdc.current_uid());

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
  for delete using (sender_uid = bsdc.current_uid() or bsdc.is_staff());

-- ------------------------------- grants ------------------------------------
grant select on public.conversations to authenticated;
grant update (title, avatar_url) on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant update (last_read_at, muted_until, left_at) on public.conversation_members to authenticated;
grant select on public.messages to authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;
grant delete on public.messages to authenticated;

grant execute on function public.open_direct_conversation(text) to authenticated;
grant execute on function public.create_group_conversation(text, text[]) to authenticated;
grant execute on function public.send_message(
  uuid, text, bsdc_message_kind, text, text, text, uuid
) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;
grant execute on function public.conversation_inbox(integer) to authenticated;
grant execute on function public.unread_message_count() to authenticated;
