-- 0129 — a post finds its channel.
--
-- Groups have owned channels since 0011, and the database has known since
-- 0068 exactly who may read a channel and who may post in one:
-- `bsdc.can_read_channel` and `bsdc.can_post_in_channel` decide both,
-- `posts_read_visible`, `posts_insert_self` and `posts_update_own` consult
-- them, and `bsdc.sync_group_post_counts` keeps `groups.posts_count` correct
-- whenever a post's `channel_id` changes. The rules existed, the rooms
-- existed, and there was no door.
--
-- Verified against main: `save_post` (0124) inserts an explicit column list
-- that never mentions `channel_id`, so every post the web composer or the
-- Android app writes is a plain feed post. `feed_candidates` returns thirteen
-- columns, none of them a channel, so even a post placed in a channel by hand
-- arrives in the feed unattributed. The web composer offers a visibility
-- selector and nothing else; the group page lists channels as dead cards.
-- The rules never fired because nothing could name a channel when writing a
-- post or read one when reading a feed.
--
-- This file gives the door a shape:
--
--   1. `bsdc.channel_post_block` — the same question `can_post_in_channel`
--      answers, but as a *reason* beside the boolean, in the exact order the
--      policy applies it. A reason form is what turns a bare 42501 into a
--      sentence a form can show, and it lets the composer and the database
--      say the same words.
--   2. `save_post` learns `channel_id`: absent leaves the post's channel
--      alone, `null` moves the post out of its channel into the feed, and a
--      uuid places the post in that channel, if allowed. Refusals are
--      sentences, and a `private` post inside a channel is refused rather
--      than silently widened.
--   3. `feed_candidates` carries the channel the post was said to be in, plus
--      the group's address and name, so the feed can attribute a channel post
--      without a second round trip.
--   4. `channel_feed` — one channel, the same eighteen columns as
--      `feed_candidates`, so one hydrator serves both.
--   5. `channel_post_counts` — one round trip for a whole group page instead
--      of one per channel.
--   6. The sitemap gains a `channels` section for public, unarchived groups
--      only, so a crawler learns the rooms a stranger may walk into.

-- ===========================================================================
-- 1. A reason, not just a refusal
-- ===========================================================================
-- `bsdc.channel_post_block` answers the question `bsdc.can_post_in_channel`
-- answers, but returns the reason a refusal would have, so the composer can
-- say *why* before the post is sent and the save path can say the same words
-- if it is refused anyway.
--
-- The order is load-bearing, not cosmetic. `can_post_in_channel` puts
-- `not g.is_archived` *outside* the moderator branch, so an archived group
-- refuses everybody, including its owner and staff. This reason form repeats
-- that order exactly: the archived check comes before the moderator check, or
-- a moderator is told they may post and is then refused by the policy.
create or replace function bsdc.channel_post_block(p_channel_id uuid)
returns text
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select case
    when p_channel_id is null then null
    when not exists (select 1 from public.channels c where c.id = p_channel_id)
      then 'channel/not-found'
    when exists (
      select 1 from public.channels c join public.groups g on g.id = c.group_id
      where c.id = p_channel_id and g.is_archived
    ) then 'channel/archived'
    when bsdc.can_moderate_group(
           (select c.group_id from public.channels c where c.id = p_channel_id),
           bsdc.current_uid()
         ) then null
    when exists (select 1 from public.channels c where c.id = p_channel_id and c.is_read_only)
      then 'channel/read-only'
    when not exists (
      select 1 from public.channels c
      where c.id = p_channel_id
        and bsdc.is_group_member(c.group_id, bsdc.current_uid())
    ) then 'channel/not-member'
    else null
  end
$$;

revoke all on function bsdc.channel_post_block(uuid) from public, anon;
grant execute on function bsdc.channel_post_block(uuid) to authenticated, service_role;

-- invoker-rights wrapper so PostgREST callers never name the bsdc schema
create or replace function public.channel_post_block(p_channel_id uuid)
returns text language sql stable security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$ select bsdc.channel_post_block(p_channel_id) $$;
revoke all on function public.channel_post_block(uuid) from public, anon;
grant execute on function public.channel_post_block(uuid) to authenticated, service_role;

-- the whole list in one round trip
--
-- `security invoker` and a read of `public.channels`, so row security already
-- removes a private group's rooms from a stranger's answer: the function
-- cannot name a room the caller cannot see. That property is asserted in t89
-- and is why this is not a definer wrapper.
create or replace function public.channel_post_block_many(p_channel_ids uuid[])
returns table (channel_id uuid, block text)
language sql stable security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
  select c.id, bsdc.channel_post_block(c.id)
    from public.channels c
   where c.id = any (coalesce(p_channel_ids, '{}'::uuid[]))
   order by c.name
$$;
revoke all on function public.channel_post_block_many(uuid[]) from public, anon;
grant execute on function public.channel_post_block_many(uuid[]) to authenticated, service_role;

-- ===========================================================================
-- 2. save_post learns the channel
-- ===========================================================================
-- The signature does not change — seven parameters, all defaulted.
-- `p_post ->> 'channel_id'` is the shape every other optional field arrives
-- in, and an eighth defaulted parameter would make every existing call site
-- ambiguous.
--
-- Three semantics for `p_post ->> 'channel_id'`:
--
--   absent    leave the post's channel alone (an update that does not touch
--             the channel);
--   null or   move the post out of its channel, into the feed;
--   empty
--   a uuid    place the post in that channel, if allowed.
--
-- `private` inside a channel is *refused*, not raised to `followers`: a
-- member who asked for "only me" and got "the whole group" has been
-- overruled on the one field that decides who reads their words. A draft is
-- exempt — nobody reads it yet.
create or replace function public.save_post(
  p_id uuid default null,
  p_post jsonb default '{}'::jsonb,
  p_slug text default null,
  p_tags text[] default '{}'::text[],
  p_media jsonb default '[]'::jsonb,
  p_mentions text[] default '{}'::text[],
  p_poll jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid        text := bsdc.current_uid();
  v_id         uuid := p_id;
  v_slug       text;
  v_status     bsdc_post_status := coalesce((p_post ->> 'status')::bsdc_post_status, 'draft');
  v_attempt    integer := 0;
  v_stored     jsonb;
  v_incoming   jsonb;
  v_tags       text[];
  v_has_channel boolean := p_post ? 'channel_id';
  v_channel    uuid;
  v_block      text;
  v_visibility bsdc_visibility := coalesce((p_post ->> 'visibility')::bsdc_visibility, 'public');
begin
  -- The tags this save carries, normalised and de-duplicated once, so every
  -- later step reads the same list.
  select coalesce(array_agg(distinct w order by w), '{}')
    into v_tags
    from unnest(coalesce(p_tags, '{}'::text[])) as w
   where char_length(btrim(w)) >= 2;

  -- The vocabulary grows by exactly the words this post uses.
  if array_length(v_tags, 1) is not null then
    insert into public.tags (slug, label_en, label_bn)
    select w, initcap(replace(w, '-', ' ')), ''
      from unnest(v_tags) as w
    on conflict (slug) do nothing;
  end if;

  -- ------------------------------------------------------ the channel ----
  -- A malformed uuid is a "not found", not a cast error: the member typed
  -- an address that does not exist, and that is the answer.
  if v_has_channel and coalesce(p_post ->> 'channel_id', '') <> '' then
    begin
      v_channel := (p_post ->> 'channel_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'channel/not-found';
    end;
  end if;

  if v_has_channel and v_channel is not null then
    v_block := bsdc.channel_post_block(v_channel);
    if v_block is not null then
      raise exception '%', v_block using errcode = '42501';
    end if;

    if v_visibility = 'private'
       and coalesce((p_post ->> 'status')::bsdc_post_status, 'draft') = 'published' then
      raise exception 'channel/private-post' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    if coalesce(btrim(p_slug), '') = '' then
      raise exception 'post/slug-missing';
    end if;

    loop
      v_attempt := v_attempt + 1;
      begin
        insert into public.posts (
          author_uid, slug, kind, status, visibility, title, body, excerpt, cover_url,
          language, code, code_language, reading_time, is_sensitive, allow_comments,
          published_at, channel_id
        )
        values (
          v_uid,
          btrim(p_slug) || case when v_attempt = 1 then '' else '-' || v_attempt::text end,
          coalesce((p_post ->> 'kind')::bsdc_post_kind, 'post'),
          v_status,
          v_visibility,
          coalesce(p_post ->> 'title', ''),
          coalesce(p_post ->> 'body', ''),
          coalesce(p_post ->> 'excerpt', ''),
          coalesce(p_post ->> 'cover_url', ''),
          coalesce(p_post ->> 'language', 'bn'),
          coalesce(p_post ->> 'code', ''),
          coalesce(p_post ->> 'code_language', ''),
          coalesce((p_post ->> 'reading_time')::integer, 1),
          coalesce((p_post ->> 'is_sensitive')::boolean, false),
          coalesce((p_post ->> 'allow_comments')::boolean, true),
          case when v_status = 'published' then now() else null end,
          v_channel
        )
        returning id, slug into v_id, v_slug;
        exit;
      exception
        when unique_violation then
          if v_attempt >= 10 then
            raise;
          end if;
      end;
    end loop;
  else
    update public.posts p
       set kind           = coalesce((p_post ->> 'kind')::bsdc_post_kind, p.kind),
           status         = v_status,
           visibility     = case when p_post ? 'visibility' then v_visibility else p.visibility end,
           title          = coalesce(p_post ->> 'title', p.title),
           body           = coalesce(p_post ->> 'body', p.body),
           excerpt        = coalesce(p_post ->> 'excerpt', p.excerpt),
           cover_url      = coalesce(p_post ->> 'cover_url', p.cover_url),
           language       = coalesce(p_post ->> 'language', p.language),
           code           = coalesce(p_post ->> 'code', p.code),
           code_language  = coalesce(p_post ->> 'code_language', p.code_language),
           reading_time   = coalesce((p_post ->> 'reading_time')::integer, p.reading_time),
           is_sensitive   = coalesce((p_post ->> 'is_sensitive')::boolean, p.is_sensitive),
           allow_comments = coalesce((p_post ->> 'allow_comments')::boolean, p.allow_comments),
           published_at   = case
                              when v_status = 'published' then coalesce(p.published_at, now())
                              else null
                            end,
           channel_id     = case when v_has_channel then v_channel else p.channel_id end
     where p.id = v_id
    returning p.slug into v_slug;

    if not found then
      raise exception 'post/not-found';
    end if;
  end if;

  -- ---------------------------------------------------------------- tags ---
  delete from public.post_tags where post_id = v_id;
  insert into public.post_tags (post_id, tag_slug)
  select v_id, w from unnest(v_tags) as w
  on conflict do nothing;

  -- --------------------------------------------------------------- media ---
  delete from public.post_media where post_id = v_id;
  insert into public.post_media (post_id, media_id, "position", alt_text)
  select v_id,
         (item ->> 'media_id')::uuid,
         coalesce((item ->> 'position')::integer, (fpos - 1)::integer),
         coalesce(item ->> 'alt_text', '')
    from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) with ordinality as f(item, fpos)
   where coalesce(item ->> 'media_id', '') <> ''
  on conflict do nothing;

  -- ------------------------------------------------------------ mentions ---
  delete from public.post_mentions where post_id = v_id;
  insert into public.post_mentions (post_id, mentioned_uid)
  select v_id, pr.uid
    from public.profiles pr
   where pr.username = any (coalesce(p_mentions, '{}'::text[]))
  on conflict do nothing;

  -- ---------------------------------------------------------------- poll ---
  if p_poll is not null and jsonb_typeof(p_poll) = 'array' then
    if jsonb_array_length(p_poll) = 0 then
      delete from public.poll_options where post_id = v_id;
    else
      select jsonb_agg(st.label order by st."position")
        into v_stored
        from public.poll_options st
       where st.post_id = v_id;

      select jsonb_agg(o.label order by o.opos)
        into v_incoming
        from jsonb_array_elements_text(p_poll) with ordinality as o(label, opos);

      if v_stored is distinct from v_incoming then
        delete from public.poll_options where post_id = v_id;
        insert into public.poll_options (post_id, "position", label)
        select v_id, (o.opos - 1)::integer, o.label
          from jsonb_array_elements_text(p_poll) with ordinality as o(label, opos);
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

revoke all on function public.save_post(uuid, jsonb, text, text[], jsonb, text[], jsonb) from public;
grant execute on function public.save_post(uuid, jsonb, text, text[], jsonb, text[], jsonb)
  to authenticated;

-- ===========================================================================
-- 3. feed_candidates carries where a post was said
-- ===========================================================================
-- An OUT-list change cannot be done with `create or replace` (42P13), so the
-- function is dropped and recreated below.
--
-- The five new columns are appended at the end so an existing caller that
-- ignores them is unaffected. The body is 0050's body, plus the channel
-- joins, the five columns, and one guard.
--
-- `and p.deleted_at is null` is kept, deliberately: 0050 added it, and a
-- rewrite is exactly where it gets lost. A post in the trash is offered to
-- nobody.
--
-- The extra `can_read_channel` guard is deliberate even though
-- `posts_read_visible` already applies: this function is `security invoker`,
-- and a channel post whose channel became invisible after the post was
-- written must not leak the room's existence.
drop function if exists public.feed_candidates(integer, timestamptz);
create function public.feed_candidates(
  p_limit integer default 60,
  p_before timestamptz default null
)
returns table (
  post_id uuid, author_uid text, published_at timestamptz,
  likes_count integer, comments_count integer, views_count integer,
  language text, is_sensitive boolean, kind bsdc_post_kind,
  author_followed boolean, affinity real, already_seen boolean, tags text[],
  channel_id uuid, channel_name text, channel_slug text,
  group_slug text, group_name text
)
language sql
stable
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    p.id,
    p.author_uid,
    p.published_at,
    p.likes_count,
    p.comments_count,
    p.views_count,
    p.language,
    p.is_sensitive,
    p.kind,
    exists (
      select 1 from public.follows f
      where f.follower_uid = bsdc.current_uid() and f.followee_uid = p.author_uid
    ) as author_followed,
    coalesce((
      select sum(ta.score)
      from public.topic_affinity ta
      join public.post_tags pt on pt.tag_slug = ta.tag_slug
      where ta.uid = bsdc.current_uid() and pt.post_id = p.id
    ), 0)::real as affinity,
    exists (
      select 1 from public.feed_seen s
      where s.uid = bsdc.current_uid() and s.post_id = p.id
    ) as already_seen,
    coalesce(array(
      select pt.tag_slug::text from public.post_tags pt where pt.post_id = p.id
    ), '{}') as tags,
    p.channel_id,
    c.name,
    c.slug::text,
    g.slug::text,
    g.name
  from public.posts p
  left join public.channels c on c.id = p.channel_id
  left join public.groups g on g.id = c.group_id
  where p.status = 'published'
    and p.deleted_at is null
    and (p_before is null or p.published_at < p_before)
    and (p.channel_id is null or bsdc.can_read_channel(p.channel_id))
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = p.author_uid)
         or (b.blocker_uid = p.author_uid and b.blocked_uid = bsdc.current_uid())
    )
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 120);
$$;

revoke all on function public.feed_candidates(integer, timestamptz) from public;
grant execute on function public.feed_candidates(integer, timestamptz) to anon, authenticated;

-- ===========================================================================
-- 4. channel_feed and channel_post_counts
-- ===========================================================================
-- One channel's posts, the same eighteen columns as `feed_candidates`, so
-- the one hydrator the home feed already has serves both. `p_before` is the
-- same cursor convention: the last `published_at` the reader saw.
create or replace function public.channel_feed(
  p_channel_id uuid,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  post_id uuid, author_uid text, published_at timestamptz,
  likes_count integer, comments_count integer, views_count integer,
  language text, is_sensitive boolean, kind bsdc_post_kind,
  author_followed boolean, affinity real, already_seen boolean, tags text[],
  channel_id uuid, channel_name text, channel_slug text,
  group_slug text, group_name text
)
language sql
stable
security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    p.id,
    p.author_uid,
    p.published_at,
    p.likes_count,
    p.comments_count,
    p.views_count,
    p.language,
    p.is_sensitive,
    p.kind,
    exists (
      select 1 from public.follows f
      where f.follower_uid = bsdc.current_uid() and f.followee_uid = p.author_uid
    ) as author_followed,
    coalesce((
      select sum(ta.score)
      from public.topic_affinity ta
      join public.post_tags pt on pt.tag_slug = ta.tag_slug
      where ta.uid = bsdc.current_uid() and pt.post_id = p.id
    ), 0)::real as affinity,
    exists (
      select 1 from public.feed_seen s
      where s.uid = bsdc.current_uid() and s.post_id = p.id
    ) as already_seen,
    coalesce(array(
      select pt.tag_slug::text from public.post_tags pt where pt.post_id = p.id
    ), '{}') as tags,
    p.channel_id,
    c.name,
    c.slug::text,
    g.slug::text,
    g.name
  from public.posts p
  join public.channels c on c.id = p.channel_id
  join public.groups g on g.id = c.group_id
  where p.channel_id = p_channel_id
    and p.status = 'published'
    and p.deleted_at is null
    and (p_before is null or p.published_at < p_before)
    and bsdc.can_read_channel(p.channel_id)
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.channel_feed(uuid, integer, timestamptz) from public, anon;
grant execute on function public.channel_feed(uuid, integer, timestamptz) to anon, authenticated;

-- One round trip for a whole group page instead of one per channel.
create or replace function public.channel_post_counts(p_group_id uuid)
returns table (channel_id uuid, post_count integer)
language sql stable security invoker
set search_path = public, bsdc, extensions, pg_temp
as $$
  select c.id, count(p.id)::integer
  from public.channels c
  left join public.posts p
    on p.channel_id = c.id
   and p.status = 'published'
   and p.deleted_at is null
  where c.group_id = p_group_id
  group by c.id
$$;

revoke all on function public.channel_post_counts(uuid) from public, anon;
grant execute on function public.channel_post_counts(uuid) to anon, authenticated;

-- ===========================================================================
-- 5. The crawler learns the public rooms
-- ===========================================================================
-- A channel page is a real address now, so the sitemap lists the rooms of
-- public, unarchived groups. A private or archived group's channels appear
-- for nobody: the same rule `sitemap_urls` already applies to a post inside
-- a channel.
--
-- Both functions are re-created from the definitions in the database — the
-- body is 0106's, plus the channel branch — because the OUT list did not
-- change but a branch did, and `create or replace` would otherwise leave the
-- older body in place.
drop function if exists public.sitemap_urls(text, integer, integer);
create function public.sitemap_urls(
  p_section text,
  p_page integer default 1,
  p_size integer default 1000
)
returns table(loc text, lastmod timestamptz, changefreq text, priority numeric)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $function$
  with page as (
    select greatest(1, coalesce(p_page, 1)) as n,
           least(5000, greatest(1, coalesce(p_size, 1000))) as size
  ),
  rows as (
    select '/p/' || p.slug as loc, p.updated_at as lastmod, 'weekly'::text as changefreq,
           0.7::numeric as priority
      from public.posts p
     where p_section = 'posts'
       and p.status = 'published' and p.visibility = 'public'
       and p.deleted_at is null
       and (
         p.channel_id is null
         or exists (
           select 1 from public.channels ch
           join public.groups grp on grp.id = ch.group_id
           where ch.id = p.channel_id and grp.privacy = 'public' and not grp.is_archived
         )
       )
    union all
    select '/g/' || g.slug || '/c/' || c.slug, c.created_at, 'weekly', 0.6
      from public.channels c
      join public.groups g on g.id = c.group_id
     where p_section = 'channels'
       and g.privacy = 'public' and not g.is_archived
    union all
    select '/marketplace/product/' || pr.id::text, pr.updated_at, 'daily', 0.8
      from public.mk_products pr
      join public.mk_vendors v on v.id = pr.vendor_id
     where p_section = 'marketproducts' and pr.status = 'active' and v.status = 'active'
       and bsdc.mk_vendor_credits(v.id) > 0
    union all
    select '/marketplace/shop/' || v.slug, v.updated_at, 'weekly', 0.7
      from public.mk_vendors v
     where p_section = 'shops' and v.status = 'active'
       and bsdc.mk_vendor_credits(v.id) > 0
    union all
    select '/learn/' || c.slug, c.updated_at, 'weekly', 0.8
      from public.courses c
     where p_section = 'courses' and c.status = 'published'
    union all
    select '/g/' || g.slug, g.updated_at, 'weekly', 0.6
      from public.groups g
     where p_section = 'groups' and g.privacy = 'public' and not g.is_archived
    union all
    select '/events/' || e.slug, e.updated_at, 'daily', 0.6
      from public.events e
     where p_section = 'events' and not e.is_cancelled
       and e.ends_at > now() - interval '30 days'
       and (e.group_id is null or exists (select 1 from public.groups g where g.id = e.group_id and g.privacy = 'public'))
    union all
    select '/jobs/' || j.slug, j.updated_at, 'daily', 0.7
      from public.jobs j
     where p_section = 'jobs' and j.status = 'open' and (j.expires_at is null or j.expires_at > now())
    union all
    select '/freelance/' || g.slug, g.updated_at, 'weekly', 0.6
      from public.gigs g
     where p_section = 'gigs' and g.status = 'open'
    union all
    select '/projects/' || pj.slug, pj.updated_at, 'weekly', 0.7
      from public.projects pj
     where p_section = 'projects'
    union all
    select '/tag/' || t.slug, now(), 'weekly', 0.4
      from public.tags t
     where p_section = 'tags' and t.posts_count > 0
    union all
    select '/@' || pf.username, pf.updated_at, 'weekly', 0.5
      from public.profiles pf
     where p_section = 'profiles'
       and pf.username is not null
       and pf.status = 'active'
       and coalesce((pf.privacy ->> 'discoverable')::boolean, true)
  )
  select r.loc,
         r.lastmod,
         coalesce(o.changefreq::text, r.changefreq),
         coalesce(o.priority, r.priority)
    from rows r
  left join public.seo_overrides o on o.path = r.loc
  where coalesce(o.robots, 'index') = 'index'
  order by r.lastmod desc nulls last, r.loc
  offset (select (n - 1) * size from page)
  limit (select size from page);
$function$;

drop function if exists public.sitemap_sections(integer);
create function public.sitemap_sections(p_size integer default 1000)
returns table(section text, urls integer, pages integer, lastmod timestamptz)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $function$
  with sizes as (
    select least(5000, greatest(1, coalesce(p_size, 1000))) as size
  ),
  counted as (
    select 'posts'::text as section, count(*)::integer as urls, max(updated_at) as lastmod
      from public.posts p
     where p.status = 'published' and p.visibility = 'public'
       and p.deleted_at is null
       and (
         p.channel_id is null
         or exists (
           select 1 from public.channels ch
           join public.groups grp on grp.id = ch.group_id
           where ch.id = p.channel_id and grp.privacy = 'public' and not grp.is_archived
         )
       )
    union all
    select 'channels', count(*)::integer, max(c.created_at)
      from public.channels c
      join public.groups g on g.id = c.group_id
     where g.privacy = 'public' and not g.is_archived
    union all
    select 'marketproducts', count(*)::integer, max(pr.updated_at)
      from public.mk_products pr
      join public.mk_vendors v on v.id = pr.vendor_id
     where pr.status = 'active' and v.status = 'active'
       and bsdc.mk_vendor_credits(v.id) > 0
    union all
    select 'shops', count(*)::integer, max(v.updated_at)
      from public.mk_vendors v
     where v.status = 'active' and bsdc.mk_vendor_credits(v.id) > 0
    union all
    select 'courses', count(*)::integer, max(updated_at)
      from public.courses where status = 'published'
    union all
    select 'groups', count(*)::integer, max(updated_at)
      from public.groups where privacy = 'public' and not is_archived
    union all
    select 'events', count(*)::integer, max(updated_at)
      from public.events e
     where not e.is_cancelled and e.ends_at > now() - interval '30 days'
       and (e.group_id is null or exists (select 1 from public.groups g where g.id = e.group_id and g.privacy = 'public'))
    union all
    select 'jobs', count(*)::integer, max(updated_at)
      from public.jobs j where j.status = 'open' and (j.expires_at is null or j.expires_at > now())
    union all
    select 'gigs', count(*)::integer, max(updated_at)
      from public.gigs where status = 'open'
    union all
    select 'projects', count(*)::integer, max(updated_at)
      from public.projects
    union all
    select 'tags', count(*)::integer, null::timestamptz
      from public.tags where posts_count > 0
    union all
    select 'profiles', count(*)::integer, max(updated_at)
      from public.profiles
     where username is not null and status = 'active'
       and coalesce((privacy ->> 'discoverable')::boolean, true)
  )
  select c.section,
         c.urls,
         greatest(1, ceil(c.urls::numeric / (select size from sizes))::integer),
         c.lastmod
    from counted c
   where c.urls > 0
   order by c.section;
$function$;

commit;
