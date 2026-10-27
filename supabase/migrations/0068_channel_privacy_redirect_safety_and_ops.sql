-- ---------------------------------------------------------------------------
-- 0068 — channel post privacy, redirect origin safety, OAuth email proof,
--        and staff review queues for pending shops and ad campaigns.
--
-- Four platform-level gaps are closed here in Postgres, where no client or
-- edge caller can forget to check them:
--
--   1. Group channel post isolation. `0011` added `posts.channel_id`, yet
--      `posts_read_visible`, `posts_insert_self`, `sitemap_urls`,
--      `sitemap_sections` and `seo_for_path` never inspected the channel's
--      group privacy or `is_read_only` flag. A post inside a private or secret
--      group's channel was readable by anonymous visitors, indexed in the
--      sitemap, and described in crawlers' meta tags; any signed-in stranger
--      could also insert a post into another group's channel or into a
--      read-only announcement channel. Both directions are now enforced by
--      `bsdc.can_read_channel()` and `bsdc.can_post_in_channel()`, and
--      `groups.posts_count` stays synchronised by trigger.
--
--   2. Bootstrap administrator OAuth proof. Only providers that verify domain
--      mailboxes unconditionally (`google.com`, `apple.com`) earn bootstrap
--      authority without `email_verified = true`; providers that can attach or
--      expose unverified addresses (`github.com`, `yahoo.com`, `twitter.com`,
--      `facebook.com`) must present `email_verified = true`.
--
--   3. Redirect origin safety. `set_redirect` previously accepted any
--      `http://` or third-party `https://` URL, allowing a trusted BSDC URL to
--      act as an open redirector. Absolute redirect targets must now use
--      `https://` on `bsdc.info.bd` (or a subdomain of `bsdc.info.bd`).
--
--   4. Staff review queues for pending shops and pending ad campaigns.
--      `admin_overview()` counted `shops_pending` and `campaigns_pending` and
--      `decide_shop()` / `decide_campaign()` acted on them, while staff had no
--      read model listing those pending submissions. `admin_pending_shops()`
--      and `admin_pending_campaigns()` complete the loop.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 0. Four-argument bsdc.audit overload for SEO, Branding & Performance RPCs
-- ===========================================================================
create or replace function bsdc.audit(
  p_action       text,
  p_subject_type text,
  p_subject_id   text,
  p_metadata     jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, bsdc, pg_temp
as $$
  select bsdc.audit(
    p_action,
    case
      when coalesce(p_subject_type, '') = '' then coalesce(p_subject_id, '')
      else p_subject_type || ':' || coalesce(p_subject_id, '')
    end,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

revoke all on function bsdc.audit(text, text, text, jsonb) from public;
revoke all on function bsdc.audit(text, text, text, jsonb) from anon, authenticated;

-- ===========================================================================
-- 1. Bootstrap administrator OAuth email proof
-- ===========================================================================
create or replace function bsdc.bootstrap_role()
returns bsdc_role
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with claims as (
    select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb as c
  )
  select b.role
  from claims, bsdc.bootstrap_admins b
  where lower(coalesce(claims.c ->> 'email', '')) = lower(b.email::text)
    and coalesce(claims.c ->> 'email', '') <> ''
    and (
      coalesce((claims.c ->> 'email_verified')::boolean, false)
      or coalesce(claims.c -> 'firebase' ->> 'sign_in_provider', '')
         in ('google.com', 'apple.com')
    )
  limit 1;
$$;

revoke all on function bsdc.bootstrap_role() from public;
grant execute on function bsdc.bootstrap_role() to authenticated, service_role;

-- ===========================================================================
-- 2. Group channel visibility, write guards, and post counter sync
-- ===========================================================================
create or replace function bsdc.can_read_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select p_channel_id is null
      or bsdc.is_staff()
      or exists (
        select 1
        from public.channels c
        join public.groups g on g.id = c.group_id
        where c.id = p_channel_id
          and (
            g.privacy = 'public'
            or bsdc.is_group_member(g.id, bsdc.current_uid())
          )
      );
$$;

create or replace function bsdc.can_post_in_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select p_channel_id is null
      or exists (
        select 1
        from public.channels c
        join public.groups g on g.id = c.group_id
        where c.id = p_channel_id
          and not g.is_archived
          and (
            bsdc.can_moderate_group(g.id, bsdc.current_uid())
            or (
              not c.is_read_only
              and bsdc.is_group_member(g.id, bsdc.current_uid())
            )
          )
      );
$$;

revoke all on function bsdc.can_read_channel(uuid) from public;
revoke all on function bsdc.can_post_in_channel(uuid) from public;
grant execute on function bsdc.can_read_channel(uuid) to anon, authenticated, service_role;
grant execute on function bsdc.can_post_in_channel(uuid) to authenticated, service_role;

drop policy if exists posts_read_visible on public.posts;
create policy posts_read_visible on public.posts
  for select using (
    (
      deleted_at is null
      and status <> 'removed'
      and bsdc.can_read_post(author_uid, status, visibility)
      and bsdc.can_read_channel(channel_id)
    )
    or (deleted_at is not null and status <> 'removed' and author_uid = bsdc.current_uid())
  );

drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts
  for insert with check (
    author_uid = bsdc.current_uid()
    and bsdc.can_post_in_channel(channel_id)
  );

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update
  using (author_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (
    bsdc.is_staff()
    or (author_uid = bsdc.current_uid() and bsdc.can_post_in_channel(channel_id))
  );

grant update (channel_id) on public.posts to authenticated;

create or replace function bsdc.sync_group_post_counts()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_old_live boolean := false;
  v_new_live boolean := false;
  v_old_group uuid;
  v_new_group uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.channel_id is not null then
    v_old_live := (old.status = 'published' and old.deleted_at is null);
    if v_old_live then
      select c.group_id into v_old_group from public.channels c where c.id = old.channel_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.channel_id is not null then
    v_new_live := (new.status = 'published' and new.deleted_at is null);
    if v_new_live then
      select c.group_id into v_new_group from public.channels c where c.id = new.channel_id;
    end if;
  end if;

  if v_old_group is distinct from v_new_group then
    if v_old_group is not null then
      update public.groups set posts_count = greatest(posts_count - 1, 0) where id = v_old_group;
    end if;
    if v_new_group is not null then
      update public.groups set posts_count = posts_count + 1 where id = v_new_group;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function bsdc.sync_group_post_counts() from public;

drop trigger if exists posts_sync_group_counts on public.posts;
create trigger posts_sync_group_counts
  after insert or update or delete on public.posts
  for each row execute function bsdc.sync_group_post_counts();

-- Reconcile existing groups too; subsequent writes are maintained by trigger.
update public.groups g set posts_count = (
  select count(*)::integer from public.posts p
  join public.channels c on c.id = p.channel_id
  where c.group_id = g.id and p.status = 'published' and p.deleted_at is null
);

-- ===========================================================================
-- 3. Crawler sitemaps and edge metadata respect non-public channels
-- ===========================================================================
create or replace function public.sitemap_urls(
  p_section text,
  p_page integer default 1,
  p_size integer default 1000
)
returns table(loc text, lastmod timestamptz, changefreq text, priority numeric)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
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

create or replace function public.sitemap_sections(p_size integer default 1000)
returns table(section text, urls integer, pages integer, lastmod timestamptz)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
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
    select 'products', count(*)::integer, max(updated_at)
      from public.products where status in ('active', 'out_of_stock')
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

create or replace function public.seo_for_path(p_path text)
returns table(
  path text,
  title text,
  description text,
  image_url text,
  canonical text,
  robots text,
  source text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, pg_temp
as $function$
declare
  v_path text := bsdc.normalise_path(p_path);
  v_slug text;
  v_site text := 'Bangladesh Software Development Community';
  v_row record;
begin
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

  if v_path like '/p/%' then
    v_slug := substr(v_path, 4);
    return query
    with hit as (
      select p.*,
             (
               p.status = 'published'
               and p.visibility = 'public'
               and p.deleted_at is null
               and (
                 p.channel_id is null
                 or exists (
                   select 1 from public.channels ch
                   join public.groups grp on grp.id = ch.group_id
                   where ch.id = p.channel_id and grp.privacy = 'public' and not grp.is_archived
                 )
               )
             ) as public_ok
        from public.posts p
       where p.slug = v_slug
    )
    select v_path,
           case when hit.public_ok
                then bsdc.clip_text(coalesce(nullif(hit.title, ''), 'Post'), 65) || ' — BSDC'
                else 'Post — BSDC' end,
           case when hit.public_ok
                then bsdc.clip_text(coalesce(nullif(hit.excerpt, ''), hit.body), 155)
                else 'This post is not public.' end,
           case when hit.public_ok and hit.cover_url <> '' then hit.cover_url else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok then 'index' else 'noindex' end,
           'post'::text,
           hit.updated_at
      from hit;
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

  elsif v_path like '/projects/%' then
    v_slug := substr(v_path, 11);
    return query
    select v_path,
           bsdc.clip_text(pj.name, 60) || ' — BSDC Projects',
           bsdc.clip_text(coalesce(nullif(pj.tagline, ''), pj.description), 155),
           coalesce(nullif(pj.cover_url, ''), '/og/og-image.png'),
           v_path,
           'index'::text,
           'project'::text,
           pj.updated_at
      from public.projects pj
     where pj.slug = v_slug;
    if found then return; end if;

  elsif v_path like '/jobs/%' then
    v_slug := substr(v_path, 7);
    return query
    with hit as (
      select j.*,
             (j.status = 'open' and (j.expires_at is null or j.expires_at > now())) as live
        from public.jobs j
       where j.slug = v_slug
    )
    select v_path,
           case when hit.live then bsdc.clip_text(hit.title, 60) || ' — BSDC Jobs' else 'Job — BSDC Jobs' end,
           case when hit.live then bsdc.clip_text(coalesce(nullif(hit.description, ''), hit.company), 155)
                else 'This job listing is not open.' end,
           '/og/og-image.png'::text,
           v_path,
           case when hit.live then 'index' else 'noindex' end,
           'job'::text,
           hit.updated_at
      from hit;
    if found then return; end if;
    return query select v_path, 'Job not found — BSDC Jobs',
      'This job listing does not exist.', '/og/og-image.png'::text, v_path,
      'noindex'::text, 'missing'::text, null::timestamptz;
    return;

  elsif v_path like '/events/%' then
    v_slug := substr(v_path, 9);
    return query
    with hit as (
      select e.*,
             (e.group_id is null or exists (
                select 1 from public.groups g
                 where g.id = e.group_id and g.privacy = 'public')) as public_ok
        from public.events e
       where e.slug = v_slug
    )
    select v_path,
           case when hit.public_ok then bsdc.clip_text(hit.title, 60) || ' — BSDC Events'
                else 'Event — BSDC Events' end,
           case when hit.public_ok then bsdc.clip_text(coalesce(nullif(hit.description, ''), hit.title), 155)
                else 'This event is not public.' end,
           case when hit.public_ok and hit.cover_url <> '' then hit.cover_url else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok and not hit.is_cancelled then 'index' else 'noindex' end,
           'event'::text,
           hit.updated_at
      from hit;
    if found then return; end if;
    return query select v_path, 'Event not found — BSDC Events',
      'This event does not exist.', '/og/og-image.png'::text, v_path,
      'noindex'::text, 'missing'::text, null::timestamptz;
    return;

  elsif v_path like '/freelance/%' then
    v_slug := substr(v_path, 12);
    return query
    with hit as (
      select g.*, (g.status = 'open') as live
        from public.gigs g
       where g.slug = v_slug
    )
    select v_path,
           case when hit.live then bsdc.clip_text(hit.title, 60) || ' — BSDC Freelance'
                else 'Gig — BSDC Freelance' end,
           case when hit.live then bsdc.clip_text(coalesce(nullif(hit.description, ''), hit.title), 155)
                else 'This gig is not open for proposals.' end,
           '/og/og-image.png'::text,
           v_path,
           case when hit.live then 'index' else 'noindex' end,
           'gig'::text,
           hit.updated_at
      from hit;
    if found then return; end if;

  elsif v_path like '/tag/%' then
    v_slug := substr(v_path, 6);
    return query
    select v_path,
           bsdc.clip_text(t.label_en, 60) || ' — BSDC',
           bsdc.clip_text(coalesce(nullif(t.description, ''), 'Posts tagged ' || t.label_en || ' on BSDC.'), 155),
           '/og/og-image.png'::text,
           v_path,
           case when t.posts_count > 0 then 'index' else 'noindex' end,
           'tag'::text,
           null::timestamptz
      from public.tags t
     where t.slug = v_slug;
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

  if v_path like '/p/%' or v_path like '/shop/%' or v_path like '/learn/%'
     or v_path like '/g/%' or v_path like '/projects/%' or v_path like '/jobs/%'
     or v_path like '/events/%' or v_path like '/freelance/%' or v_path like '/tag/%'
     or v_path like '/@%' then
    return query select v_path, 'Not found — BSDC', 'This page does not exist.',
      '/og/og-image.png'::text, v_path, 'noindex'::text, 'missing'::text, null::timestamptz;
    return;
  end if;

  return query select
    v_path,
    v_site,
    'The open community platform for Bangladeshi and worldwide software '
      || 'developers: posts, groups, jobs, learning, projects and marketplace.',
    '/og/og-image.png'::text,
    v_path,
    case when v_path ~ '^/(messages|settings|notifications|bookmarks|trash|history|ads|vendor|checkout|cart|orders|compose|create|onboarding|admin|offline|api|auth)(/|$)'
           or v_path ~ '^/[^/]+/[^/]+/edit$'
         then 'noindex' else 'index' end,
    'default'::text,
    now();
end;
$function$;

-- ===========================================================================
-- 4. Redirect destination allowlist (BSDC origins or internal paths only)
-- ===========================================================================
create or replace function public.set_redirect(
  p_from text,
  p_to text,
  p_status smallint default 301,
  p_note text default ''
)
returns public.redirects
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_from text := bsdc.normalise_path(p_from);
  v_to   text := btrim(coalesce(p_to, ''));
  v_to_path text;
  v_row  public.redirects;
begin
  perform bsdc.require_permission('seo.manage');

  if v_from = '/' then
    raise exception 'The home page cannot be redirected away' using errcode = '22023';
  end if;
  if v_to = '' then
    raise exception 'A redirect needs a destination' using errcode = '22023';
  end if;
  if v_to ~ '^//' then
    raise exception 'Protocol-relative redirect destinations are not allowed' using errcode = '22023';
  end if;

  if v_to ~* '^[a-z][a-z0-9+.-]*:' then
    if v_to !~* '^https://([a-z0-9-]+\.)*bsdc\.info\.bd(/|$)' then
      raise exception 'External redirects must stay on https://*.bsdc.info.bd' using errcode = '22023';
    end if;
    v_to_path := null;
  else
    v_to_path := bsdc.normalise_path(v_to);
    v_to := v_to_path;
    if v_to_path = v_from then
      raise exception 'A redirect cannot point at itself' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.redirects r
      where r.from_path = v_to_path and r.is_enabled
    ) then
      raise exception 'The destination % is itself redirected; point at the final page',
        v_to_path using errcode = '22023';
    end if;
    if exists (
      select 1 from public.redirects r
      where r.to_path = v_from and r.from_path = v_to_path
    ) then
      raise exception 'That would create a redirect loop' using errcode = '22023';
    end if;
  end if;

  insert into public.redirects (from_path, to_path, status, note, created_by)
  values (v_from, v_to, coalesce(p_status, 301), btrim(coalesce(p_note, '')), bsdc.current_uid())
  on conflict (from_path) do update
    set to_path = excluded.to_path,
        status  = excluded.status,
        note    = excluded.note,
        is_enabled = true
  returning * into v_row;

  perform bsdc.audit('redirect.set', 'redirect', v_from,
    jsonb_build_object('to', v_to, 'status', v_row.status));
  return v_row;
end;
$$;

-- ===========================================================================
-- 5. Fix ad_creatives target_url check (Postgres POSIX regex DUPMAX = 255)
--    and staff review queues for pending shops and ad campaigns
-- ===========================================================================
alter table public.ad_creatives drop constraint if exists ad_creatives_target_url_check;
alter table public.ad_creatives add constraint ad_creatives_target_url_check
  check (char_length(target_url) between 12 and 500 and target_url ~ '^https://[^\s]+$');

create or replace function public.admin_pending_shops(p_limit integer default 50)
returns table (
  id          uuid,
  slug        text,
  name        text,
  tagline     text,
  city        text,
  owner_uid   text,
  owner_name  text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    s.id,
    s.slug::text,
    s.name,
    s.tagline,
    s.city,
    s.owner_uid,
    coalesce(pf.display_name, s.owner_uid),
    s.created_at
  from public.shops s
  left join public.profiles pf on pf.uid = s.owner_uid
  where s.status = 'pending'
    and bsdc.current_uid() is not null
    and (bsdc.has_permission('moderation.read') or bsdc.is_staff())
  order by s.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.admin_pending_campaigns(p_limit integer default 50)
returns table (
  id             uuid,
  name           text,
  pricing        bsdc_ad_pricing,
  bid            integer,
  total_budget   integer,
  daily_budget   integer,
  owner_uid      text,
  owner_name     text,
  creative_count integer,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    a.id,
    a.name,
    a.pricing,
    a.bid,
    a.total_budget,
    a.daily_budget,
    a.owner_uid,
    coalesce(pf.display_name, a.owner_uid),
    (select count(*)::integer from public.ad_creatives c where c.campaign_id = a.id),
    a.created_at
  from public.ad_campaigns a
  left join public.profiles pf on pf.uid = a.owner_uid
  where a.status = 'pending_review'
    and bsdc.current_uid() is not null
    and (bsdc.has_permission('moderation.read') or bsdc.is_staff())
  order by a.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.admin_pending_shops(integer) from public;
revoke all on function public.admin_pending_campaigns(integer) from public;
grant execute on function public.admin_pending_shops(integer) to authenticated, service_role;
grant execute on function public.admin_pending_campaigns(integer) to authenticated, service_role;
