-- ---------------------------------------------------------------------------
-- Row level security for the interaction module.
--
-- Comments inherit the visibility of the post they hang from, reactions are
-- public but writable only by their owner, bookmarks are private, and an
-- inbox belongs to exactly one member.
-- ---------------------------------------------------------------------------

alter table public.notifications        enable row level security;
alter table public.post_reactions       enable row level security;
alter table public.comments             enable row level security;
alter table public.comment_reactions    enable row level security;
alter table public.bookmark_collections enable row level security;
alter table public.bookmarks            enable row level security;
alter table public.post_shares          enable row level security;

-- --------------------------- notifications ---------------------------------
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select using (uid = bsdc.current_uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (uid = bsdc.current_uid());

-- Inserts only ever happen through bsdc.notify(), which is security definer.

-- ---------------------------- post_reactions -------------------------------
drop policy if exists post_reactions_read on public.post_reactions;
create policy post_reactions_read on public.post_reactions
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status <> 'removed'
        and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
    )
  );

drop policy if exists post_reactions_write_self on public.post_reactions;
create policy post_reactions_write_self on public.post_reactions
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- ------------------------------- comments ----------------------------------
drop policy if exists comments_read_visible on public.comments;
create policy comments_read_visible on public.comments
  for select using (
    status <> 'removed'
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status <> 'removed'
        and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = author_uid)
         or (b.blocker_uid = author_uid and b.blocked_uid = bsdc.current_uid())
    )
  );

drop policy if exists comments_insert_self on public.comments;
create policy comments_insert_self on public.comments
  for insert with check (
    author_uid = bsdc.current_uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and p.allow_comments
        and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
    )
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update using (author_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (author_uid = bsdc.current_uid() or bsdc.is_staff());

-- The post author may remove a comment from their own thread; so may staff.
drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments
  for delete using (
    author_uid = bsdc.current_uid()
    or bsdc.is_staff()
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_uid = bsdc.current_uid()
    )
  );

-- --------------------------- comment_reactions -----------------------------
drop policy if exists comment_reactions_read on public.comment_reactions;
create policy comment_reactions_read on public.comment_reactions
  for select using (
    exists (select 1 from public.comments c where c.id = comment_id and c.status <> 'removed')
  );

drop policy if exists comment_reactions_write_self on public.comment_reactions;
create policy comment_reactions_write_self on public.comment_reactions
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- ------------------------------ bookmarks ----------------------------------
drop policy if exists bookmark_collections_own on public.bookmark_collections;
create policy bookmark_collections_own on public.bookmark_collections
  for all using (uid = bsdc.current_uid() or not is_private)
  with check (uid = bsdc.current_uid());

drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- ------------------------------- shares ------------------------------------
drop policy if exists post_shares_read_staff on public.post_shares;
create policy post_shares_read_staff on public.post_shares
  for select using (bsdc.is_staff() or uid = bsdc.current_uid());

-- Inserts go through public.record_share(), which is security definer.

-- ------------------------------- grants ------------------------------------
grant select, update, delete on public.notifications to authenticated;
grant select on public.post_reactions to anon, authenticated;
grant insert, update, delete on public.post_reactions to authenticated;
grant select on public.comments to anon, authenticated;
grant insert, update, delete on public.comments to authenticated;
grant select on public.comment_reactions to anon, authenticated;
grant insert, delete on public.comment_reactions to authenticated;
grant select, insert, update, delete on public.bookmark_collections to authenticated;
grant select, insert, update, delete on public.bookmarks to authenticated;
grant select on public.post_shares to authenticated;

-- Counters and thread bookkeeping are server-owned.
revoke update (likes_count, replies_count, depth, root_id, is_answer, post_id, author_uid)
  on public.comments from authenticated;

grant execute on function public.toggle_reaction(uuid, bsdc_reaction) to authenticated;
grant execute on function public.toggle_comment_reaction(uuid) to authenticated;
grant execute on function public.mark_answer(uuid) to authenticated;
grant execute on function public.toggle_bookmark(uuid, uuid) to authenticated;
grant execute on function public.record_share(uuid, text) to anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.post_interaction_state(uuid[]) to authenticated;
