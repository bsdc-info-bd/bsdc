-- ---------------------------------------------------------------------------
-- SEO metadata privacy redaction for non-public groups, profiles, draft
-- products, draft courses, and search/system-check utility pages.
--
-- Migration 0068 redacted non-public posts, closed jobs, non-public events,
-- and closed freelance gigs inside public.seo_for_path, while private or
-- archived groups, non-discoverable/suspended profiles, and unpublished
-- products or courses still returned real titles, descriptions, and cover/avatar
-- URLs alongside robots='noindex'. Crawlers and preview scrapers reading raw
-- HTML still received private metadata. This migration closes that leak.
-- ---------------------------------------------------------------------------

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
set search_path = public, bsdc, extensions, pg_temp
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
    with hit as (
      select pr.*,
             (
               pr.status in ('active', 'out_of_stock')
               and exists (
                 select 1 from public.shops s
                  where s.id = pr.shop_id and s.status = 'active'
               )
             ) as public_ok
        from public.products pr
       where pr.slug = v_slug
    )
    select v_path,
           case when hit.public_ok
                then bsdc.clip_text(hit.title, 60) || ' — BSDC Shop'
                else 'Product — BSDC Shop' end,
           case when hit.public_ok
                then bsdc.clip_text(coalesce(nullif(hit.summary, ''), hit.description), 155)
                else 'This product is not listed.' end,
           case when hit.public_ok and coalesce(hit.images[1], '') <> ''
                then hit.images[1]
                else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok then 'index' else 'noindex' end,
           'product'::text,
           hit.updated_at
      from hit;
    if found then return; end if;

  elsif v_path like '/learn/%' then
    v_slug := substr(v_path, 8);
    return query
    with hit as (
      select c.*, (c.status = 'published') as public_ok
        from public.courses c
       where c.slug = v_slug
    )
    select v_path,
           case when hit.public_ok
                then bsdc.clip_text(hit.title, 60) || ' — BSDC Learning'
                else 'Course — BSDC Learning' end,
           case when hit.public_ok
                then bsdc.clip_text(coalesce(nullif(hit.summary, ''), hit.description), 155)
                else 'This course is not published.' end,
           case when hit.public_ok and hit.cover_url <> ''
                then hit.cover_url
                else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok then 'index' else 'noindex' end,
           'course'::text,
           hit.updated_at
      from hit;
    if found then return; end if;

  elsif v_path like '/g/%' then
    v_slug := substr(v_path, 4);
    return query
    with hit as (
      select g.*, (g.privacy = 'public' and not g.is_archived) as public_ok
        from public.groups g
       where g.slug = v_slug
    )
    select v_path,
           case when hit.public_ok
                then bsdc.clip_text(hit.name, 60) || ' — BSDC Groups'
                else 'Group — BSDC Groups' end,
           case when hit.public_ok
                then bsdc.clip_text(hit.description, 155)
                else 'This group is not public.' end,
           case when hit.public_ok
                then coalesce(nullif(hit.cover_url, ''), nullif(hit.avatar_url, ''), '/og/og-image.png')
                else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok then 'index' else 'noindex' end,
           'group'::text,
           hit.updated_at
      from hit;
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
                 where g.id = e.group_id and g.privacy = 'public' and not g.is_archived)) as public_ok
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
    with hit as (
      select pf.*,
             (
               pf.status = 'active'
               and coalesce((pf.privacy ->> 'discoverable')::boolean, true)
             ) as public_ok
        from public.profiles pf
       where pf.username = v_slug
    )
    select v_path,
           case when hit.public_ok
                then hit.display_name || ' (@' || hit.username || ') — BSDC'
                else 'Profile — BSDC' end,
           case when hit.public_ok
                then bsdc.clip_text(
                  coalesce(nullif(hit.bio, ''), hit.display_name || ' on the BSDC developer community.'),
                  155)
                else 'This profile is not public.' end,
           case when hit.public_ok and hit.avatar_url <> ''
                then hit.avatar_url
                else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok then 'index' else 'noindex' end,
           'profile'::text,
           hit.updated_at
      from hit;
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
    case when v_path ~ '^/(messages|settings|notifications|bookmarks|trash|history|ads|vendor|checkout|cart|orders|compose|create|onboarding|admin|offline|api|auth|search|system-check)(/|$)'
           or v_path ~ '^/[^/]+/[^/]+/edit$'
         then 'noindex' else 'index' end,
    'default'::text,
    now();
end;
$function$;

grant execute on function public.seo_for_path(text) to anon, authenticated;
