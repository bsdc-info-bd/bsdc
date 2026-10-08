-- ---------------------------------------------------------------------------
-- Delete means thirty days of recovery.
--
-- Until now the delete button — where it existed at all — ran
-- `delete from posts`. The row was gone, its comments were gone with it
-- (on delete cascade), and a comment's replies went with the comment. There
-- was nothing to undo and nothing to recover, which is not what a delete
-- button should mean on a community site.
--
-- This file adds the trash:
--
--   * `deleted_at` on `posts` and `comments`. Setting it is the delete.
--     The row leaves every reader's view — feed, search, sitemap, comments,
--     counters — and stays visible to its author alone.
--   * Recovery for thirty days. `deleted_at` back to null restores the row,
--     and a trigger refuses the restore after the window closes. Permanent
--     deletion is always available to the author, at any time, and is what
--     happens to whatever is left after thirty days.
--   * `my_deleted_content()` lists the author's trash with the exact moment
--     each item stops being recoverable.
--   * `purge_deleted_content()` is the only thing that erases rows on a
--     schedule, it belongs to `service_role`, and it will not look at
--     anything deleted less than a week ago.
--
-- Everything here is additive and re-runnable: the columns are guarded, the
-- functions are `create or replace`, the triggers are dropped before they are
-- created, the policies are dropped before they are created, and the grants
-- are idempotent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- part 1 — the trash itself
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists deleted_at timestamptz;
alter table public.comments add column if not exists deleted_at timestamptz;

create index if not exists posts_trash_idx
  on public.posts (author_uid, deleted_at desc) where deleted_at is not null;
create index if not exists comments_trash_idx
  on public.comments (author_uid, deleted_at desc) where deleted_at is not null;

-- The author writes `deleted_at` directly — that is the delete button — but
-- nothing else on the row moves with it.
grant update (deleted_at) on public.posts to authenticated;
grant update (deleted_at) on public.comments to authenticated;

-- ---------------------------------------------------------------------------
-- part 2 — a deleted row is its author's business
-- ---------------------------------------------------------------------------
drop policy if exists posts_read_visible on public.posts;
create policy posts_read_visible on public.posts
  for select using (
    (
      deleted_at is null
      and status <> 'removed'
      and bsdc.can_read_post(author_uid, status, visibility)
    )
    -- The trash is private: only the author sees a row they deleted, and a
    -- post staff removed is not theirs to see again.
    or (deleted_at is not null and status <> 'removed' and author_uid = bsdc.current_uid())
  );

drop policy if exists comments_read_visible on public.comments;
create policy comments_read_visible on public.comments
  for select using (
    status <> 'removed'
    and (
      (
        deleted_at is null
        and exists (
          select 1 from public.posts p
          where p.id = post_id
            and p.status <> 'removed'
            and p.deleted_at is null
            and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
        )
      )
      or (deleted_at is not null and author_uid = bsdc.current_uid())
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = author_uid)
         or (b.blocker_uid = author_uid and b.blocked_uid = bsdc.current_uid())
    )
  );

-- Nobody writes a comment, a reply or a reaction onto a post in the trash.
drop policy if exists comments_insert_self on public.comments;
create policy comments_insert_self on public.comments
  for insert with check (
    author_uid = bsdc.current_uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and p.deleted_at is null
        and p.allow_comments
        and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
    )
  );

-- ---------------------------------------------------------------------------
-- part 3 — the counters, the readers and the crawlers know the trash
-- ---------------------------------------------------------------------------
-- These eight functions are re-created from the definitions that are in the
-- database, each changed only by the clause its comment names. `gen-0050.mjs`
-- in the round's proof harness generates them and prints a fidelity report:
-- with the added `deleted_at` clause removed, six of the eight are character
-- for character what was already deployed, and the two counter triggers are the
-- intended rewrite (the report lists exactly what changed in them).
--
--   feed_candidates    the feed never offers a post in the trash
--   global_search      a post in the trash is not a search result
--   sitemap_urls       a post in the trash is not offered to a crawler
--   seo_for_path       a post in the trash says noindex
--   toggle_reaction    a post in the trash accepts no reaction
--   record_share       a share of a post in the trash is neither stored nor announced
--   sync_post_counts   a post in the trash is not a published post
--   sync_comment_counts a comment in the trash is not a comment on anything
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.feed_candidates(p_limit integer DEFAULT 60, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(post_id uuid, author_uid text, published_at timestamp with time zone, likes_count integer, comments_count integer, views_count integer, language text, is_sensitive boolean, kind bsdc_post_kind, author_followed boolean, affinity real, already_seen boolean, tags text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'bsdc'
AS $function$
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
    ), '{}') as tags
  from public.posts p
  where p.status = 'published'
    and p.deleted_at is null
    and (p_before is null or p.published_at < p_before)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_uid = bsdc.current_uid() and b.blocked_uid = p.author_uid)
         or (b.blocker_uid = p.author_uid and b.blocked_uid = bsdc.current_uid())
    )
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 120);
$function$;

CREATE OR REPLACE FUNCTION public.global_search(p_query text, p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 30)
 RETURNS TABLE(kind text, id text, slug text, title text, subtitle text, image_url text, rank real, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
  with q as (select bsdc.to_search_query(p_query) as query),
  wanted as (
    select coalesce(p_kinds, array['post','person','group','course','job','project']) as kinds
  ),
  results as (
    select 'post' as kind, p.id::text as id, p.slug::text as slug,
           coalesce(nullif(p.title, ''), left(p.body, 80)) as title,
           left(p.excerpt, 160) as subtitle, p.cover_url as image_url,
           ts_rank(p.search_vector, q.query) as rank, p.created_at as created_at
    from public.posts p, q, wanted w
    where 'post' = any (w.kinds)
      and q.query is not null
      and p.status = 'published'
      and p.deleted_at is null
      and p.visibility = 'public'
      and p.search_vector @@ q.query

    union all
    select 'person', pr.uid, coalesce(pr.username::text, ''), pr.display_name,
           left(pr.bio, 160), pr.avatar_url,
           ts_rank(pr.search_vector, q.query), pr.created_at
    from public.profiles pr, q, wanted w
    where 'person' = any (w.kinds)
      and q.query is not null
      and pr.status = 'active'
      and coalesce((pr.privacy ->> 'discoverable')::boolean, true)
      and pr.search_vector @@ q.query

    union all
    select 'group', g.id::text, g.slug::text, g.name,
           left(g.description, 160), g.avatar_url,
           ts_rank(g.search_vector, q.query), g.created_at
    from public.groups g, q, wanted w
    where 'group' = any (w.kinds)
      and q.query is not null
      and not g.is_archived
      and g.search_vector @@ q.query

    union all
    select 'course', c.id::text, c.slug::text, c.title,
           left(c.summary, 160), c.cover_url,
           ts_rank(c.search_vector, q.query), c.created_at
    from public.courses c, q, wanted w
    where 'course' = any (w.kinds)
      and q.query is not null
      and c.status = 'published'
      and c.search_vector @@ q.query

    union all
    select 'job', j.id::text, j.slug::text, j.title,
           j.company || ' · ' || coalesce(nullif(j.city, ''), j.work_mode::text), '',
           ts_rank(j.search_vector, q.query), j.created_at
    from public.jobs j, q, wanted w
    where 'job' = any (w.kinds)
      and q.query is not null
      and j.status = 'open'
      and (j.expires_at is null or j.expires_at > now())
      and j.search_vector @@ q.query

    union all
    select 'project', pj.id::text, pj.slug::text, pj.name,
           left(pj.tagline, 160), pj.cover_url,
           ts_rank(pj.search_vector, q.query), pj.created_at
    from public.projects pj, q, wanted w
    where 'project' = any (w.kinds)
      and q.query is not null
      and pj.search_vector @@ q.query
  )
  select r.kind, r.id, r.slug, r.title, r.subtitle, r.image_url, r.rank, r.created_at
  from results r
  order by r.rank desc, r.created_at desc
  limit greatest(1, least(p_limit, 100));
$function$;

CREATE OR REPLACE FUNCTION public.sitemap_urls(p_section text, p_page integer DEFAULT 1, p_size integer DEFAULT 1000)
 RETURNS TABLE(loc text, lastmod timestamp with time zone, changefreq text, priority numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
  with page as (
    select greatest(1, coalesce(p_page, 1)) as n,
           least(5000, greatest(1, coalesce(p_size, 1000))) as size
  ),
  rows as (
    select '/p/' || p.slug as loc, p.updated_at as lastmod, 'weekly'::text as changefreq,
           0.7::numeric as priority
    from public.posts p
    where p_section = 'posts'
      and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null
    union all
    select '/shop/' || pr.slug, pr.updated_at, 'daily', 0.8
    from public.products pr
    where p_section = 'products' and pr.status in ('active', 'out_of_stock')
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
    where p_section = 'events' and not e.is_cancelled and e.ends_at > now() - interval '30 days'
    union all
    select '/jobs/' || j.slug, j.updated_at, 'daily', 0.7
    from public.jobs j
    where p_section = 'jobs' and j.status = 'open'
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
         -- An override may lower a URL's priority or change its rhythm
         -- without the sitemap generator knowing anything about that page.
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

CREATE OR REPLACE FUNCTION public.seo_for_path(p_path text)
 RETURNS TABLE(path text, title text, description text, image_url text, canonical text, robots text, source text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
declare
  v_path text := bsdc.normalise_path(p_path);
  v_slug text;
  v_site text := 'Bangladesh Software Development Community';
  v_row  record;
begin
  -- 1. An editor's override wins over everything.
  select o.* into v_row from public.seo_overrides o where o.path = v_path;
  if found and (v_row.title <> '' or v_row.description <> '') then
    return query select
      v_path,
      coalesce(nullif(v_row.title, ''), v_site),
      v_row.description,
      v_row.image_url,
      coalesce(nullif(v_row.canonical, ''), v_path),
      v_row.robots::text,
      'override'::text,
      v_row.updated_at;
    return;
  end if;

  -- 2. The thing at that path describes itself.
  if v_path like '/p/%' then
    v_slug := substr(v_path, 4);
    return query
    select v_path,
           bsdc.clip_text(coalesce(nullif(p.title, ''), 'Post'), 65) || ' — BSDC',
           bsdc.clip_text(coalesce(nullif(p.excerpt, ''), p.body), 155),
           p.cover_url,
           v_path,
           case when p.status = 'published' and p.visibility = 'public'
                     and p.deleted_at is null
                then 'index' else 'noindex' end,
           'post'::text,
           p.updated_at
    from public.posts p
    where p.slug = v_slug;
    if found then return; end if;

  elsif v_path like '/shop/%' then
    v_slug := substr(v_path, 7);
    return query
    select v_path,
           bsdc.clip_text(pr.title, 60) || ' — BSDC Shop',
           bsdc.clip_text(coalesce(nullif(pr.summary, ''), pr.description), 155),
           coalesce(pr.images[1], ''),
           v_path,
           case when pr.status in ('active', 'out_of_stock') then 'index' else 'noindex' end,
           'product'::text,
           pr.updated_at
    from public.products pr
    where pr.slug = v_slug;
    if found then return; end if;

  elsif v_path like '/learn/%' then
    v_slug := substr(v_path, 8);
    return query
    select v_path,
           bsdc.clip_text(c.title, 60) || ' — BSDC Learning',
           bsdc.clip_text(coalesce(nullif(c.summary, ''), c.description), 155),
           c.cover_url,
           v_path,
           case when c.status = 'published' then 'index' else 'noindex' end,
           'course'::text,
           c.updated_at
    from public.courses c
    where c.slug = v_slug;
    if found then return; end if;

  elsif v_path like '/g/%' then
    v_slug := substr(v_path, 4);
    return query
    select v_path,
           bsdc.clip_text(g.name, 60) || ' — BSDC Groups',
           bsdc.clip_text(g.description, 155),
           g.cover_url,
           v_path,
           case when g.privacy = 'public' and not g.is_archived then 'index' else 'noindex' end,
           'group'::text,
           g.updated_at
    from public.groups g
    where g.slug = v_slug;
    if found then return; end if;

  elsif v_path like '/@%' then
    v_slug := substr(v_path, 3);
    return query
    select v_path,
           pf.display_name || ' (@' || pf.username || ') — BSDC',
           bsdc.clip_text(
             coalesce(nullif(pf.bio, ''), pf.display_name || ' on the BSDC developer community.'),
             155),
           pf.avatar_url,
           v_path,
           case when pf.status = 'active'
                 and coalesce((pf.privacy ->> 'discoverable')::boolean, true)
                then 'index' else 'noindex' end,
           'profile'::text,
           pf.updated_at
    from public.profiles pf
    where pf.username = v_slug;
    if found then return; end if;
  end if;

  -- 3. The site default. Never empty, never invented by a crawler.
  return query select
    v_path,
    v_site,
    'The open community platform for Bangladeshi and worldwide software '
      || 'developers: posts, groups, jobs, learning, projects and marketplace.',
    '/og/og-image.png'::text,
    v_path,
    case when v_path ~ '^/(messages|settings|notifications|bookmarks|vendor|auth)'
         then 'noindex' else 'index' end,
    'default'::text,
    now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_reaction(p_post_id uuid, p_reaction bsdc_reaction)
 RETURNS TABLE(reacted boolean, reaction bsdc_reaction, total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
declare
  v_uid      text := bsdc.current_uid();
  v_existing bsdc_reaction;
  v_total    integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
      and p.deleted_at is null
      and bsdc.can_read_post(p.author_uid, p.status, p.visibility)
  ) then
    raise exception 'post not available' using errcode = 'P0002';
  end if;

  select pr.reaction into v_existing
    from public.post_reactions pr
    where pr.post_id = p_post_id and pr.uid = v_uid;

  if v_existing is not null and v_existing = p_reaction then
    -- The same reaction again means "take it back".
    delete from public.post_reactions pr
      where pr.post_id = p_post_id and pr.uid = v_uid;
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select false, p_reaction, v_total;
  else
    -- Either the first reaction or a change of mind, in one statement that
    -- two concurrent requests cannot turn into a duplicate-key failure.
    insert into public.post_reactions (post_id, uid, reaction)
      values (p_post_id, v_uid, p_reaction)
      on conflict (post_id, uid)
      do update set reaction = excluded.reaction, created_at = now();
    select p.likes_count into v_total from public.posts p where p.id = p_post_id;
    return query select true, p_reaction, v_total;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_share(p_post_id uuid, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
declare
  v_uid    text := bsdc.current_uid();
  v_author text;
begin
  -- A share of a post in the trash is not recorded and not announced.
  if not exists (
    select 1 from public.posts p where p.id = p_post_id and p.deleted_at is null
  ) then
    return;
  end if;

  insert into public.post_shares (post_id, uid, channel) values (p_post_id, v_uid, p_channel);
  if v_uid is not null then
    select author_uid into v_author from public.posts where id = p_post_id;
    perform bsdc.notify(v_author, v_uid, 'share', p_post_id, null, p_channel);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION bsdc.sync_post_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
declare
  -- "Live" is published and not in the trash: moving a post either way has to
  -- move the author's count the same way, and putting it back has to undo it.
  v_was_live boolean;
  v_is_live  boolean;
  v_uid      text;
begin
  v_was_live := tg_op <> 'INSERT' and old.status = 'published' and old.deleted_at is null;
  v_is_live  := tg_op <> 'DELETE' and new.status = 'published' and new.deleted_at is null;

  if v_is_live and not v_was_live then
    update public.profiles set posts_count = posts_count + 1 where uid = new.author_uid;
  elsif v_was_live and not v_is_live then
    v_uid := case when tg_op = 'DELETE' then old.author_uid else new.author_uid end;
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where uid = v_uid;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION bsdc.sync_comment_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'bsdc', 'pg_temp'
AS $function$
declare
  v_author text;
  v_parent_author text;
begin
  if tg_op = 'INSERT' then
    update public.posts
      set comments_count = comments_count + 1
      where id = new.post_id
      returning author_uid into v_author;
    if new.parent_id is not null then
      update public.comments
        set replies_count = replies_count + 1
        where id = new.parent_id
        returning author_uid into v_parent_author;
      perform bsdc.notify(
        v_parent_author, new.author_uid, 'reply', new.post_id, new.id, left(new.body, 280)
      );
    end if;
    perform bsdc.notify(
      v_author, new.author_uid, 'comment', new.post_id, new.id, left(new.body, 280)
    );

  elsif tg_op = 'UPDATE' then
    -- Only the move in and out of the trash changes a count; an edited body is
    -- still the same comment.
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts
        set comments_count = greatest(comments_count - 1, 0)
        where id = new.post_id;
      if new.parent_id is not null then
        update public.comments
          set replies_count = greatest(replies_count - 1, 0)
          where id = new.parent_id;
      end if;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.posts
        set comments_count = comments_count + 1
        where id = new.post_id;
      if new.parent_id is not null then
        update public.comments
          set replies_count = replies_count + 1
          where id = new.parent_id;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    -- A row already in the trash was already subtracted; deleting a trashed
    -- comment for good must not subtract it twice.
    if old.deleted_at is null then
      update public.posts
        set comments_count = greatest(comments_count - 1, 0)
        where id = old.post_id;
      if old.parent_id is not null then
        update public.comments
          set replies_count = greatest(replies_count - 1, 0)
          where id = old.parent_id;
      end if;
    end if;
  end if;
  return null;
end;
$function$;
-- The counter trigger has to see the trash move, and it only ever listened
-- for inserts and deletes. Re-creating it with UPDATE included is what makes
-- the counter follow a comment in and out of the trash.
drop trigger if exists comments_sync_counts on public.comments;
create trigger comments_sync_counts after insert or update or delete on public.comments
  for each row execute function bsdc.sync_comment_counts();

-- ---------------------------------------------------------------------------
-- part 4 — the thirty days are enforced by the database
-- ---------------------------------------------------------------------------
create or replace function bsdc.enforce_recovery_window()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if old.deleted_at is not null
     and new.deleted_at is null
     and old.deleted_at < now() - interval '30 days' then
    raise exception 'the 30 day recovery window has closed'
      using errcode = 'P0001', hint = 'recovery_window_closed';
  end if;
  return new;
end;
$$;

-- The trigger runs first so a refused restore never reaches another trigger.
drop trigger if exists posts_recovery_window on public.posts;
create trigger posts_recovery_window before update on public.posts
  for each row execute function bsdc.enforce_recovery_window();

drop trigger if exists comments_recovery_window on public.comments;
create trigger comments_recovery_window before update on public.comments
  for each row execute function bsdc.enforce_recovery_window();

-- Editing a post stamps the edit. The client has no grant for `edited_at`,
-- so the time cannot be written by hand — and it is not written at all when
-- the only change is the post going into or out of the trash.
create or replace function bsdc.stamp_post_edited()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.excerpt is distinct from old.excerpt
     or new.code is distinct from old.code
     or new.cover_url is distinct from old.cover_url then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_stamp_edited on public.posts;
create trigger posts_stamp_edited before update on public.posts
  for each row execute function bsdc.stamp_post_edited();

-- ---------------------------------------------------------------------------
-- part 5 — what the trash holds, and what it is called
-- ---------------------------------------------------------------------------
-- One list for both kinds: the trash screen shows a post and a comment the
-- same way, and the only number it needs from the database is whether the
-- thirty days are still open.
create or replace function public.my_deleted_content(p_limit integer default 50)
returns table (
  kind        text,
  id          uuid,
  post_id     uuid,
  title       text,
  preview     text,
  deleted_at  timestamptz,
  expires_at  timestamptz,
  restorable  boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with me as (select bsdc.current_uid() as uid)
  select
    'post'::text,
    p.id,
    p.id,
    coalesce(nullif(p.title, ''), left(p.body, 80)),
    left(p.body, 200),
    p.deleted_at,
    p.deleted_at + interval '30 days',
    p.deleted_at > now() - interval '30 days'
  from public.posts p, me
  where p.deleted_at is not null and p.author_uid = me.uid
  union all
  select
    'comment'::text,
    c.id,
    c.post_id,
    coalesce(nullif(parent.title, ''), left(parent.body, 80)),
    left(c.body, 200),
    c.deleted_at,
    c.deleted_at + interval '30 days',
    c.deleted_at > now() - interval '30 days'
  from public.comments c
  join public.posts parent on parent.id = c.post_id
  cross join me
  where c.deleted_at is not null and c.author_uid = me.uid
  order by deleted_at desc
  limit greatest(1, least(p_limit, 200));
$$;

grant execute on function public.my_deleted_content(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- part 6 — the purge belongs to the platform, not to a signed-in member
-- ---------------------------------------------------------------------------
create or replace function public.purge_deleted_content(p_days integer default 30)
returns table (posts_removed integer, comments_removed integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_days     integer := greatest(coalesce(p_days, 30), 7);
  v_posts    integer;
  v_comments integer;
begin
  delete from public.comments
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => v_days);
  get diagnostics v_comments = row_count;

  delete from public.posts
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => v_days);
  get diagnostics v_posts = row_count;

  return query select v_posts, v_comments;
end;
$$;

revoke execute on function public.purge_deleted_content(integer) from public;
grant execute on function public.purge_deleted_content(integer) to service_role;

-- ---------------------------------------------------------------------------
-- These run as their owner, so row level security does not stand between them
-- and a deleted row: each one has to say it.
