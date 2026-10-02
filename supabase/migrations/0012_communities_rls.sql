-- ---------------------------------------------------------------------------
-- Row level security for communities.
--
-- Secret groups do not exist as far as outsiders are concerned, private
-- groups exist but keep their content to members, and public groups are open
-- to read. Pages and their events are public by nature; writing to any of
-- them is restricted to the people who run them.
-- ---------------------------------------------------------------------------

alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_join_requests enable row level security;
alter table public.channels            enable row level security;
alter table public.pages               enable row level security;
alter table public.page_followers      enable row level security;
alter table public.events              enable row level security;
alter table public.event_rsvps         enable row level security;

-- ------------------------------- groups ------------------------------------
drop policy if exists groups_read_visible on public.groups;
create policy groups_read_visible on public.groups
  for select using (bsdc.can_see_group(id, privacy));

drop policy if exists groups_insert_self on public.groups;
create policy groups_insert_self on public.groups
  for insert with check (owner_uid = bsdc.current_uid());

drop policy if exists groups_update_admins on public.groups;
create policy groups_update_admins on public.groups
  for update using (bsdc.can_moderate_group(id, bsdc.current_uid()))
  with check (bsdc.can_moderate_group(id, bsdc.current_uid()));

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete using (owner_uid = bsdc.current_uid() or bsdc.is_staff());

-- --------------------------- group_members ---------------------------------
drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.privacy = 'public' or bsdc.is_group_member(g.id, bsdc.current_uid()))
    )
  );

-- Joining goes through public.join_group(); moderators may remove members.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete using (
    uid = bsdc.current_uid() or bsdc.can_moderate_group(group_id, bsdc.current_uid())
  );

-- ------------------------ group_join_requests ------------------------------
drop policy if exists group_join_requests_read on public.group_join_requests;
create policy group_join_requests_read on public.group_join_requests
  for select using (
    uid = bsdc.current_uid() or bsdc.can_moderate_group(group_id, bsdc.current_uid())
  );

drop policy if exists group_join_requests_withdraw on public.group_join_requests;
create policy group_join_requests_withdraw on public.group_join_requests
  for delete using (uid = bsdc.current_uid());

-- ------------------------------ channels -----------------------------------
drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels
  for select using (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.privacy = 'public' or bsdc.is_group_member(g.id, bsdc.current_uid()))
    )
  );

drop policy if exists channels_write_moderators on public.channels;
create policy channels_write_moderators on public.channels
  for all using (bsdc.can_moderate_group(group_id, bsdc.current_uid()))
  with check (bsdc.can_moderate_group(group_id, bsdc.current_uid()));

-- -------------------------------- pages ------------------------------------
drop policy if exists pages_read_all on public.pages;
create policy pages_read_all on public.pages for select using (true);

drop policy if exists pages_insert_self on public.pages;
create policy pages_insert_self on public.pages
  for insert with check (owner_uid = bsdc.current_uid());

drop policy if exists pages_update_owner on public.pages;
create policy pages_update_owner on public.pages
  for update using (owner_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (owner_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists pages_delete_owner on public.pages;
create policy pages_delete_owner on public.pages
  for delete using (owner_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists page_followers_read on public.page_followers;
create policy page_followers_read on public.page_followers for select using (true);

drop policy if exists page_followers_write_self on public.page_followers;
create policy page_followers_write_self on public.page_followers
  for all using (uid = bsdc.current_uid()) with check (uid = bsdc.current_uid());

-- -------------------------------- events -----------------------------------
drop policy if exists events_read_visible on public.events;
create policy events_read_visible on public.events
  for select using (
    group_id is null
    or exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.privacy = 'public' or bsdc.is_group_member(g.id, bsdc.current_uid()))
    )
  );

drop policy if exists events_insert_host on public.events;
create policy events_insert_host on public.events
  for insert with check (
    host_uid = bsdc.current_uid()
    and (group_id is null or bsdc.can_moderate_group(group_id, bsdc.current_uid()))
    and (page_id is null or exists (
      select 1 from public.pages p where p.id = page_id and p.owner_uid = bsdc.current_uid()
    ))
  );

drop policy if exists events_update_host on public.events;
create policy events_update_host on public.events
  for update using (
    host_uid = bsdc.current_uid()
    or (group_id is not null and bsdc.can_moderate_group(group_id, bsdc.current_uid()))
  )
  with check (true);

drop policy if exists events_delete_host on public.events;
create policy events_delete_host on public.events
  for delete using (host_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists event_rsvps_read on public.event_rsvps;
create policy event_rsvps_read on public.event_rsvps
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.host_uid = bsdc.current_uid()
             or (e.group_id is not null
                 and bsdc.can_moderate_group(e.group_id, bsdc.current_uid())))
    )
  );

-- RSVPs are written through public.rsvp_event(), which enforces capacity.

-- ------------------------------- grants ------------------------------------
grant select on public.groups to anon, authenticated;
grant insert on public.groups to authenticated;
grant update (name, description, privacy, avatar_url, cover_url, rules, language, is_archived)
  on public.groups to authenticated;
grant delete on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, delete on public.group_join_requests to authenticated;
grant select on public.channels to anon, authenticated;
grant insert, update, delete on public.channels to authenticated;
grant select on public.pages to anon, authenticated;
grant insert, update, delete on public.pages to authenticated;
grant select on public.page_followers to anon, authenticated;
grant insert, delete on public.page_followers to authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select on public.event_rsvps to authenticated;

-- Counters stay server-owned.
revoke update (members_count, posts_count) on public.groups from authenticated;
revoke update (followers_count, is_verified) on public.pages from authenticated;
revoke update (going_count) on public.events from authenticated;

grant execute on function public.create_group(
  text, text, text, bsdc_group_privacy, text
) to authenticated;
grant execute on function public.join_group(uuid, text) to authenticated;
grant execute on function public.decide_join_request(uuid, text, boolean) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.set_group_role(uuid, text, bsdc_group_role) to authenticated;
grant execute on function public.rsvp_event(uuid, bsdc_rsvp_status) to authenticated;
grant execute on function public.toggle_page_follow(uuid) to authenticated;
grant execute on function public.group_directory(integer) to anon, authenticated;
grant execute on function public.event_calendar(integer) to anon, authenticated;
