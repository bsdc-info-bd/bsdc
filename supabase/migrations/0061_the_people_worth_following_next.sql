-- The people worth following next, and the reason each one is worth it.
--
-- A community platform with no suggestions asks a new member to find everybody
-- themselves: search for a name they do not know yet, or scroll a feed ranked by
-- signals that a member with no follows has none of. The feed was empty for them
-- for exactly that reason, and an empty feed is a first impression.
--
-- What makes a suggestion honest is that it can say why. Four reasons, in the
-- order they are worth something to the person being asked:
--
--   mutual   somebody you already follow follows them;
--   skills   you list the same skill;
--   city     you are in the same place;
--   active   none of the above, so the members this community actually reads.
--
-- The score behind the order is written out in full below rather than tuned
-- invisibly: a mutual follow is worth more than any number of followers, a shared
-- skill is worth more than a city, and a member nobody has seen in a month is
-- worth less than one who was here this week.
--
-- Three kinds of member are never suggested: the caller, anybody they already
-- follow, and anybody on either side of a block. A fourth is left out on their
-- own instruction — `profiles.privacy.discoverable`, which is a setting a member
-- can turn off and which has never had anything to apply to until now.

create or replace function public.follow_suggestions(p_limit integer default 12)
returns table (
  uid             text,
  username        text,
  display_name    text,
  avatar_url      text,
  bio             text,
  location        text,
  followers_count integer,
  mutual_count    integer,
  shared_skills   text[],
  reason          text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
-- The returned columns have the same names as the columns they come from, and
-- plpgsql would otherwise refuse to guess which one `uid` means.
#variable_conflict use_column
declare
  v_uid     text := bsdc.current_uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    return;
  end if;

  select * into v_profile from public.profiles where uid = v_uid;
  if not found then
    return;
  end if;

  return query
  with never as (
    select v_uid as uid
    union
    select f.followee_uid from public.follows f where f.follower_uid = v_uid
    union
    -- A block in either direction ends the suggestion, the same way it ends a
    -- notification.
    select b.blocked_uid from public.blocks b where b.blocker_uid = v_uid
    union
    select b.blocker_uid from public.blocks b where b.blocked_uid = v_uid
  ),
  candidates as (
    select p.*
      from public.profiles p
     where not exists (select 1 from never n where n.uid = p.uid)
       and p.status = 'active'
       -- A member who has not claimed a handle has no page to be sent to.
       and p.username is not null
       and coalesce((p.privacy ->> 'discoverable')::boolean, true)
  ),
  mutual as (
    select f2.followee_uid as uid, count(*)::integer as n
      from public.follows f1
      join public.follows f2 on f2.follower_uid = f1.followee_uid
     where f1.follower_uid = v_uid
     group by f2.followee_uid
  ),
  enriched as (
    select
      c.uid,
      c.username,
      c.display_name,
      c.avatar_url,
      c.bio,
      c.location,
      c.followers_count,
      c.last_seen_at,
      coalesce(m.n, 0) as mutual_count,
      (select array_agg(skill) from unnest(c.skills) as skill
        where skill = any (v_profile.skills)) as shared_skills,
      (case
         when btrim(v_profile.location) <> ''
          and lower(btrim(c.location)) = lower(btrim(v_profile.location))
         then 1 else 0
       end) as same_city
    from candidates c
    left join mutual m on m.uid = c.uid
  )
  select
    e.uid,
    e.username::text,
    e.display_name,
    e.avatar_url,
    e.bio,
    e.location,
    e.followers_count,
    e.mutual_count,
    coalesce(e.shared_skills, array[]::text[]),
    case
      when e.mutual_count > 0 then 'mutual'
      when coalesce(array_length(e.shared_skills, 1), 0) > 0 then 'skills'
      when e.same_city = 1 then 'city'
      else 'active'
    end as reason
  from enriched e
  order by
    (e.mutual_count * 100)
    + (coalesce(array_length(e.shared_skills, 1), 0) * 20)
    + (e.same_city * 15)
    + least(e.followers_count, 50)
    + (case when e.last_seen_at > now() - interval '30 days' then 10 else 0 end)
    desc,
    e.followers_count desc,
    e.uid asc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

revoke all on function public.follow_suggestions(integer) from public;
grant execute on function public.follow_suggestions(integer) to authenticated;

comment on function public.follow_suggestions(integer) is
  'Who to follow next, and why: mutual follows, shared skills, the same city, then the members this community reads.';
