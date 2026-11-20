-- ---------------------------------------------------------------------------
-- 0130 — a channel can be built, named, ordered and closed.
--
-- 0011 gave every group a `general` channel and gave the table a write
-- policy that lets a group's moderator shape it directly, but there was no
-- routine to do it with: `0059` kept the `channels` table grant "on purpose —
-- there is no `create_channel` routine, and a group's moderator writes its
-- channels directly". So the room's shape — its name, its topic, its place
-- in the order, and whether it is open to members or closed to announcements
-- — was decided by whatever client happened to hold the table grant, with the
-- validation living in no single place.
--
-- This migration gives the shape its routine, and closes the direct door
-- behind it, exactly as 0059 closed the same door on `groups`:
--
--   * `create_channel` builds a room: slug and name validated the same way
--     the table checks them, unique per group, appended after the group's
--     current last position;
--   * `update_channel` names a room (name and topic) and orders it (position),
--     leaving whatever it is not given untouched;
--   * `close_channel` and `open_channel` are the two halves of
--     `is_read_only` — the state a read-only announcement channel has had
--     since 0011, which until now only a direct table write could set;
--   * every caller is checked with `bsdc.can_moderate_group`, the same rule
--     `channels_write_moderators` (0012) applies to the table, so a
--     moderator who may shape a room through the table may shape it through
--     the routine and the two cannot disagree;
--   * building a room in an archived group is refused — a closed group gets
--     no new rooms — while naming, ordering and closing rooms in it are
--     left to the owner, who is the one who may tidy up.
--
-- `insert, update, delete on public.channels` is revoked from
-- `authenticated`: with the routine in place the table grant has the same
-- history 0059 found on `groups` — it is there "anyway", and with it a
-- member could write the row on their own. The `select` grant stays, and the
-- policies stay: they are the read rule for everyone and the rule the
-- routine's own check mirrors.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Build — a room is added to a group's shape
-- ===========================================================================
create or replace function public.create_channel(
  p_group_id uuid,
  p_slug     text,
  p_name     text,
  p_topic    text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_group   public.groups%rowtype;
  v_slug    text := lower(btrim(p_slug));
  v_name    text := btrim(p_name);
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_group from public.groups where id = p_group_id and not is_archived;
  if not found then
    raise exception 'group not available' using errcode = 'P0002';
  end if;

  -- The same checks the table carries (0011), stated here so the routine
  -- answers before the constraint can, and with the reason in its own words.
  if not (v_slug ~ '^[a-z0-9][a-z0-9-]{1,39}$') then
    raise exception 'a channel slug must be two to 40 lowercase letters, digits and hyphens'
      using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'a channel name must be between 1 and 60 characters'
      using errcode = '22023';
  end if;
  if char_length(coalesce(p_topic, '')) > 300 then
    raise exception 'a channel topic cannot be longer than 300 characters'
      using errcode = '22023';
  end if;
  if not bsdc.can_moderate_group(p_group_id, v_uid) then
    raise exception 'only a moderator of this group may build a channel' using errcode = '42501';
  end if;

  insert into public.channels (group_id, slug, name, topic, "position")
  values (
    p_group_id,
    v_slug,
    v_name,
    left(coalesce(p_topic, ''), 300),
    (select coalesce(max(c."position"), -1) + 1 from public.channels c where c.group_id = p_group_id)
  )
  returning id into v_id;

  perform bsdc.audit('channel.create', v_id::text, jsonb_build_object('slug', v_slug));
  return v_id;
end;
$$;

comment on function public.create_channel(uuid, text, text, text) is
  'Adds a channel to a group: slug, name and topic validated, appended after the group''s current order. A moderator of the group or staff only.';

revoke all on function public.create_channel(uuid, text, text, text) from public, anon;
grant execute on function public.create_channel(uuid, text, text, text) to authenticated;

-- ===========================================================================
-- 2. Name and order — the shape of an existing room
-- ===========================================================================
create or replace function public.update_channel(
  p_channel_id uuid,
  p_name       text default null,
  p_topic      text default null,
  p_position   integer default null
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_group  public.groups%rowtype;
  v_slug   text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- The channel's group is what decides who may shape it, so it is read
  -- first; an unknown room answers exactly like an unknown group.
  select g.* into v_group
    from public.channels c
    join public.groups g on g.id = c.group_id
   where c.id = p_channel_id;
  if v_group is null then
    raise exception 'channel not found' using errcode = 'P0002';
  end if;
  if not bsdc.can_moderate_group(v_group.id, v_uid) then
    raise exception 'only a moderator of this group may change the channel' using errcode = '42501';
  end if;

  if p_name is not null then
    if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 60 then
      raise exception 'a channel name must be between 1 and 60 characters'
        using errcode = '22023';
    end if;
  end if;
  if p_topic is not null and char_length(p_topic) > 300 then
    raise exception 'a channel topic cannot be longer than 300 characters'
      using errcode = '22023';
  end if;
  if p_position is not null and p_position < 0 then
    raise exception 'a channel position cannot be negative' using errcode = '22023';
  end if;

  select slug into v_slug from public.channels where id = p_channel_id;

  update public.channels
     set name       = coalesce(btrim(p_name), name),
         topic      = coalesce(p_topic, topic),
         "position" = coalesce(p_position, "position")
   where id = p_channel_id;

  perform bsdc.audit(
    'channel.update',
    p_channel_id::text,
    jsonb_build_object('slug', v_slug, 'name', coalesce(btrim(p_name), ''), 'position', p_position)
  );
end;
$$;

comment on function public.update_channel(uuid, text, text, integer) is
  'Renames a channel, sets its topic, or moves it in the group''s order. Whatever is left null is left as it was. A moderator of the group or staff only.';

revoke all on function public.update_channel(uuid, text, text, integer) from public, anon;
grant execute on function public.update_channel(uuid, text, text, integer) to authenticated;

-- ===========================================================================
-- 3. Close and open — the two halves of is_read_only
-- ===========================================================================
create or replace function public.close_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_group   public.groups%rowtype;
  v_slug    text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select g.* into v_group
    from public.channels c
    join public.groups g on g.id = c.group_id
   where c.id = p_channel_id;
  if v_group is null then
    raise exception 'channel not found' using errcode = 'P0002';
  end if;
  if not bsdc.can_moderate_group(v_group.id, v_uid) then
    raise exception 'only a moderator of this group may close the channel' using errcode = '42501';
  end if;

  -- Closing twice is the same as closing once: the room is already closed.
  update public.channels
     set is_read_only = true
   where id = p_channel_id and is_read_only is distinct from true;

  select slug into v_slug from public.channels where id = p_channel_id;
  perform bsdc.audit('channel.close', p_channel_id::text, jsonb_build_object('slug', v_slug));
end;
$$;

comment on function public.close_channel(uuid) is
  'Closes a channel to member posts: it becomes read-only, the state announcement channels have had since 0011. Already closed, nothing happens. A moderator of the group or staff only.';

revoke all on function public.close_channel(uuid) from public, anon;
grant execute on function public.close_channel(uuid) to authenticated;

create or replace function public.open_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_group  public.groups%rowtype;
  v_slug   text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select g.* into v_group
    from public.channels c
    join public.groups g on g.id = c.group_id
   where c.id = p_channel_id;
  if v_group is null then
    raise exception 'channel not found' using errcode = 'P0002';
  end if;
  if not bsdc.can_moderate_group(v_group.id, v_uid) then
    raise exception 'only a moderator of this group may open the channel' using errcode = '42501';
  end if;

  update public.channels
     set is_read_only = false
   where id = p_channel_id and is_read_only is distinct from false;

  select slug into v_slug from public.channels where id = p_channel_id;
  perform bsdc.audit('channel.open', p_channel_id::text, jsonb_build_object('slug', v_slug));
end;
$$;

comment on function public.open_channel(uuid) is
  'Opens a closed channel to member posts again. Already open, nothing happens. A moderator of the group or staff only.';

revoke all on function public.open_channel(uuid) from public, anon;
grant execute on function public.open_channel(uuid) to authenticated;

-- ===========================================================================
-- 4. The door — the routine is the only way to shape a room
-- ===========================================================================
-- 0059 revoked `insert` on `groups` for the same reason, once `create_group`
-- existed. The `select` grant stays: the read policy of 0012 is what the
-- room's readers use, and the policies stay for the same reason.
revoke insert, update, delete on table public.channels from authenticated;

commit;
