-- ---------------------------------------------------------------------------
-- 0092: Social privacy (followers visibility), paginated follower/following
-- RPCs, rich live search autocomplete, messenger member picker RPC, and
-- hardened group conversation creation.
-- ---------------------------------------------------------------------------

set search_path = public, bsdc, extensions, pg_temp;

-- 1. Include `showFollowers` in default profile privacy preferences so newly
-- created profiles carry the complete privacy object shape.
alter table public.profiles
  alter column privacy
  set default '{"discoverable":true,"showActivity":true,"showEmail":false,"showFollowers":true}'::jsonb;

-- Backfill existing profiles that do not yet carry a `showFollowers` key so
-- client payloads and raw queries see a consistent boolean default.
update public.profiles
set privacy = privacy || '{"showFollowers":true}'::jsonb
where privacy is not null
  and not (privacy ? 'showFollowers');

-- 2. Protect raw `public.follows` queries when either participant has set
-- `privacy.showFollowers = false`, while letting the viewer check their own
-- follow state (`follower_uid = bsdc.current_uid()`) and staff inspect safely.
drop policy if exists follows_read_all on public.follows;
create policy follows_read_all on public.follows
  for select using (
    follower_uid = bsdc.current_uid()
    or followee_uid = bsdc.current_uid()
    or bsdc.is_staff()
    or (
      coalesce((
        select (p.privacy ->> 'showFollowers')::boolean
        from public.profiles p
        where p.uid = follows.followee_uid
      ), true)
      and coalesce((
        select (p.privacy ->> 'showFollowers')::boolean
        from public.profiles p
        where p.uid = follows.follower_uid
      ), true)
    )
  );

-- 3. Paginated followers list respecting target privacy (`showFollowers`),
-- account status, and mutual blocks.
create or replace function public.profile_followers(
  p_uid    text,
  p_limit  integer default 30,
  p_offset integer default 0
)
returns table (
  uid            text,
  username       text,
  display_name   text,
  avatar_url     text,
  bio            text,
  location       text,
  verified       boolean,
  viewer_follows boolean,
  followed_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_viewer text := bsdc.current_uid();
  v_uid    text := nullif(btrim(coalesce(p_uid, '')), '');
  v_target public.profiles%rowtype;
  v_limit  integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.profiles
  where profiles.uid = v_uid;

  if not found or (
    v_target.status <> 'active'
    and v_viewer is distinct from v_uid
    and not bsdc.is_staff()
  ) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_viewer is not null
     and not bsdc.is_staff()
     and exists (
       select 1 from public.blocks b
       where (b.blocker_uid = v_viewer and b.blocked_uid = v_uid)
          or (b.blocker_uid = v_uid and b.blocked_uid = v_viewer)
     ) then
    raise exception 'profile not available' using errcode = '42501';
  end if;

  if not coalesce((v_target.privacy ->> 'showFollowers')::boolean, true)
     and v_viewer is distinct from v_uid
     and not bsdc.is_staff() then
    raise exception 'followers list is private' using errcode = '42501';
  end if;

  return query
  select
    p.uid,
    coalesce(p.username::text, '') as username,
    p.display_name,
    p.avatar_url,
    left(p.bio, 160) as bio,
    p.location,
    (p.role in ('moderator', 'manager', 'admin', 'owner')) as verified,
    (
      v_viewer is not null
      and exists (
        select 1 from public.follows vf
        where vf.follower_uid = v_viewer and vf.followee_uid = p.uid
      )
    ) as viewer_follows,
    f.created_at as followed_at
  from public.follows f
  join public.profiles p on p.uid = f.follower_uid
  where f.followee_uid = v_uid
    and p.status = 'active'
    and (
      bsdc.is_staff()
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_uid = v_uid and b.blocked_uid = p.uid)
           or (b.blocker_uid = p.uid and b.blocked_uid = v_uid)
           or (
             v_viewer is not null
             and (
               (b.blocker_uid = v_viewer and b.blocked_uid = p.uid)
               or (b.blocker_uid = p.uid and b.blocked_uid = v_viewer)
             )
           )
      )
    )
  order by f.created_at desc, p.uid asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.profile_followers(text, integer, integer) from public;
grant execute on function public.profile_followers(text, integer, integer) to anon, authenticated;

-- 4. Paginated following list respecting the same privacy, block, and status rules.
create or replace function public.profile_following(
  p_uid    text,
  p_limit  integer default 30,
  p_offset integer default 0
)
returns table (
  uid            text,
  username       text,
  display_name   text,
  avatar_url     text,
  bio            text,
  location       text,
  verified       boolean,
  viewer_follows boolean,
  followed_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_viewer text := bsdc.current_uid();
  v_uid    text := nullif(btrim(coalesce(p_uid, '')), '');
  v_target public.profiles%rowtype;
  v_limit  integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.profiles
  where profiles.uid = v_uid;

  if not found or (
    v_target.status <> 'active'
    and v_viewer is distinct from v_uid
    and not bsdc.is_staff()
  ) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_viewer is not null
     and not bsdc.is_staff()
     and exists (
       select 1 from public.blocks b
       where (b.blocker_uid = v_viewer and b.blocked_uid = v_uid)
          or (b.blocker_uid = v_uid and b.blocked_uid = v_viewer)
     ) then
    raise exception 'profile not available' using errcode = '42501';
  end if;

  if not coalesce((v_target.privacy ->> 'showFollowers')::boolean, true)
     and v_viewer is distinct from v_uid
     and not bsdc.is_staff() then
    raise exception 'following list is private' using errcode = '42501';
  end if;

  return query
  select
    p.uid,
    coalesce(p.username::text, '') as username,
    p.display_name,
    p.avatar_url,
    left(p.bio, 160) as bio,
    p.location,
    (p.role in ('moderator', 'manager', 'admin', 'owner')) as verified,
    (
      v_viewer is not null
      and exists (
        select 1 from public.follows vf
        where vf.follower_uid = v_viewer and vf.followee_uid = p.uid
      )
    ) as viewer_follows,
    f.created_at as followed_at
  from public.follows f
  join public.profiles p on p.uid = f.followee_uid
  where f.follower_uid = v_uid
    and p.status = 'active'
    and (
      bsdc.is_staff()
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_uid = v_uid and b.blocked_uid = p.uid)
           or (b.blocker_uid = p.uid and b.blocked_uid = v_uid)
           or (
             v_viewer is not null
             and (
               (b.blocker_uid = v_viewer and b.blocked_uid = p.uid)
               or (b.blocker_uid = p.uid and b.blocked_uid = v_viewer)
             )
           )
      )
    )
  order by f.created_at desc, p.uid asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.profile_following(text, integer, integer) from public;
grant execute on function public.profile_following(text, integer, integer) to anon, authenticated;

-- 5. Enhanced rich live search suggestions across people, posts, groups, courses,
-- jobs, and projects; handles leading `@`, respects `deleted_at is null`,
-- `discoverable`, group visibility, and mutual blocks.
create or replace function public.search_suggestions_rich(
  p_prefix text,
  p_limit  integer default 10
)
returns table (
  kind      text,
  id        text,
  slug      text,
  title     text,
  subtitle  text,
  image_url text
)
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  with params as (
    select
      btrim(coalesce(p_prefix, '')) as raw_q,
      ltrim(btrim(coalesce(p_prefix, '')), '@') as clean_q,
      bsdc.current_uid() as viewer_uid,
      least(greatest(coalesce(p_limit, 10), 1), 20) as max_rows
  ),
  people as (
    select
      'person'::text as kind,
      pr.uid as id,
      coalesce(pr.username::text, pr.uid) as slug,
      pr.display_name as title,
      case
        when pr.username is not null and pr.location <> '' then '@' || pr.username::text || ' · ' || pr.location
        when pr.username is not null then '@' || pr.username::text
        else pr.location
      end as subtitle,
      pr.avatar_url as image_url,
      case
        when pr.username is not null and lower(pr.username::text) like lower(pa.clean_q) || '%' then 0
        when lower(pr.display_name) like lower(pa.clean_q) || '%' then 1
        else 2
      end as priority,
      greatest(
        similarity(coalesce(pr.username::text, ''), pa.clean_q),
        similarity(pr.display_name, pa.clean_q)
      ) as sim
    from public.profiles pr
    cross join params pa
    where char_length(pa.clean_q) >= 2
      and pr.status = 'active'
      and coalesce((pr.privacy ->> 'discoverable')::boolean, true)
      and (
        (pr.username is not null and pr.username::text ilike '%' || pa.clean_q || '%')
        or pr.display_name ilike '%' || pa.clean_q || '%'
      )
      and (
        pa.viewer_uid is null
        or not exists (
          select 1 from public.blocks b
          where (b.blocker_uid = pa.viewer_uid and b.blocked_uid = pr.uid)
             or (b.blocker_uid = pr.uid and b.blocked_uid = pa.viewer_uid)
        )
      )
  ),
  posts as (
    select
      'post'::text as kind,
      p.id::text as id,
      p.slug::text as slug,
      coalesce(nullif(p.title, ''), left(p.body, 80)) as title,
      coalesce(pr.display_name, 'Member') as subtitle,
      coalesce(nullif(p.cover_url, ''), pr.avatar_url, '') as image_url,
      case when lower(coalesce(nullif(p.title, ''), left(p.body, 80))) like lower(pa.clean_q) || '%' then 1 else 2 end as priority,
      similarity(coalesce(nullif(p.title, ''), left(p.body, 80)), pa.clean_q) as sim
    from public.posts p
    left join public.profiles pr on pr.uid = p.author_uid
    cross join params pa
    where char_length(pa.clean_q) >= 2
      and left(pa.raw_q, 1) <> '@'
      and p.status = 'published'
      and p.deleted_at is null
      and p.visibility = 'public'
      and (p.title ilike '%' || pa.clean_q || '%' or p.excerpt ilike '%' || pa.clean_q || '%')
  ),
  groups_match as (
    select
      'group'::text as kind,
      g.id::text as id,
      g.slug::text as slug,
      g.name as title,
      g.members_count::text || ' members' as subtitle,
      g.avatar_url as image_url,
      case when lower(g.name) like lower(pa.clean_q) || '%' then 0 else 2 end as priority,
      similarity(g.name, pa.clean_q) as sim
    from public.groups g
    cross join params pa
    where char_length(pa.clean_q) >= 2
      and left(pa.raw_q, 1) <> '@'
      and not g.is_archived
      and bsdc.can_see_group(g.id, g.privacy)
      and (g.name ilike '%' || pa.clean_q || '%' or g.slug::text ilike pa.clean_q || '%')
  ),
  courses as (
    select
      'course'::text as kind,
      c.id::text as id,
      c.slug::text as slug,
      c.title as title,
      c.level::text as subtitle,
      c.cover_url as image_url,
      case when lower(c.title) like lower(pa.clean_q) || '%' then 1 else 2 end as priority,
      similarity(c.title, pa.clean_q) as sim
    from public.courses c
    cross join params pa
    where char_length(pa.clean_q) >= 2
      and left(pa.raw_q, 1) <> '@'
      and c.status = 'published'
      and c.title ilike '%' || pa.clean_q || '%'
  ),
  jobs as (
    select
      'job'::text as kind,
      j.id::text as id,
      j.slug::text as slug,
      j.title as title,
      j.company as subtitle,
      ''::text as image_url,
      case when lower(j.title) like lower(pa.clean_q) || '%' then 1 else 2 end as priority,
      similarity(j.title, pa.clean_q) as sim
    from public.jobs j
    cross join params pa
    where char_length(pa.clean_q) >= 2
      and left(pa.raw_q, 1) <> '@'
      and j.status = 'open'
      and (j.expires_at is null or j.expires_at > now())
      and (j.title ilike '%' || pa.clean_q || '%' or j.company ilike '%' || pa.clean_q || '%')
  ),
  projects as (
    select
      'project'::text as kind,
      pj.id::text as id,
      pj.slug::text as slug,
      pj.name as title,
      pj.tagline as subtitle,
      pj.cover_url as image_url,
      case when lower(pj.name) like lower(pa.clean_q) || '%' then 1 else 2 end as priority,
      similarity(pj.name, pa.clean_q) as sim
    from public.projects pj
    cross join params pa
    where char_length(pa.clean_q) >= 2
      and left(pa.raw_q, 1) <> '@'
      and (pj.name ilike '%' || pa.clean_q || '%' or pj.tagline ilike '%' || pa.clean_q || '%')
  ),
  combined as (
    select * from people
    union all
    select * from groups_match
    union all
    select * from courses
    union all
    select * from jobs
    union all
    select * from projects
    union all
    select * from posts
  )
  select c.kind, c.id, c.slug, c.title, c.subtitle, c.image_url
  from combined c
  order by c.priority asc, c.sim desc, c.title asc
  limit (select max_rows from params);
$$;

revoke all on function public.search_suggestions_rich(text, integer) from public;
grant execute on function public.search_suggestions_rich(text, integer) to anon, authenticated;

-- Upgrade the existing 3-column `search_suggestions` RPC cleanly so older
-- clients also get `@handle` lookups, trashed-post exclusion, and better types.
create or replace function public.search_suggestions(
  p_prefix text,
  p_limit  integer default 8
)
returns table (
  kind  text,
  slug  text,
  title text
)
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select r.kind, r.slug, r.title
  from public.search_suggestions_rich(p_prefix, p_limit) r;
$$;

-- 6. Authenticated member autocomplete for Messenger direct/group sheets.
create or replace function public.search_members_for_chat(
  p_query text default '',
  p_limit integer default 12
)
returns table (
  uid          text,
  username     text,
  display_name text,
  avatar_url   text,
  bio          text,
  location     text,
  is_following boolean,
  verified     boolean
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_clean text := ltrim(btrim(coalesce(p_query, '')), '@');
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 30);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    p.uid,
    coalesce(p.username::text, '') as username,
    p.display_name,
    p.avatar_url,
    left(p.bio, 120) as bio,
    p.location,
    exists (
      select 1 from public.follows f
      where f.follower_uid = v_uid and f.followee_uid = p.uid
    ) as is_following,
    (p.role in ('moderator', 'manager', 'admin', 'owner')) as verified
  from public.profiles p
  where p.uid <> v_uid
    and p.status = 'active'
    and p.username is not null
    and coalesce((p.privacy ->> 'discoverable')::boolean, true)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = v_uid and b.blocked_uid = p.uid)
         or (b.blocker_uid = p.uid and b.blocked_uid = v_uid)
    )
    and (
      v_clean = ''
      or p.username::text ilike '%' || v_clean || '%'
      or p.display_name ilike '%' || v_clean || '%'
    )
  order by
    case
      when v_clean <> '' and lower(p.username::text) = lower(v_clean) then 0
      when v_clean <> '' and lower(p.username::text) like lower(v_clean) || '%' then 1
      when v_clean <> '' and lower(p.display_name) like lower(v_clean) || '%' then 2
      else 3
    end asc,
    exists (
      select 1 from public.follows f
      where f.follower_uid = v_uid and f.followee_uid = p.uid
    ) desc,
    p.followers_count desc,
    p.display_name asc
  limit v_limit;
end;
$$;

revoke all on function public.search_members_for_chat(text, integer) from public, anon;
grant execute on function public.search_members_for_chat(text, integer) to authenticated;

-- 7. Harden `create_group_conversation` so title length limits raise clean
-- validation errors and blocked or non-active targets are never added.
create or replace function public.create_group_conversation(
  p_title   text,
  p_members text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_title  text := btrim(coalesce(p_title, ''));
  v_id     uuid;
  v_member text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_title) = 0 then
    raise exception 'a group needs a name' using errcode = '22023';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'group name must be at most 80 characters' using errcode = '22023';
  end if;
  if coalesce(array_length(p_members, 1), 0) > 256 then
    raise exception 'a group may hold at most 256 members' using errcode = '22023';
  end if;

  insert into public.conversations (kind, title, created_by)
    values ('group', v_title, v_uid)
    returning id into v_id;

  insert into public.conversation_members (conversation_id, uid, role)
    values (v_id, v_uid, 'owner');

  foreach v_member in array coalesce(p_members, array[]::text[]) loop
    if v_member is not null
       and v_member <> v_uid
       and exists (
         select 1 from public.profiles p
         where p.uid = v_member and p.status = 'active'
       )
       and not exists (
         select 1 from public.blocks b
         where (b.blocker_uid = v_uid and b.blocked_uid = v_member)
            or (b.blocker_uid = v_member and b.blocked_uid = v_uid)
       ) then
      insert into public.conversation_members (conversation_id, uid, role)
        values (v_id, v_member, 'member')
        on conflict do nothing;
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.create_group_conversation(text, text[]) from public, anon;
grant execute on function public.create_group_conversation(text, text[]) to authenticated;
