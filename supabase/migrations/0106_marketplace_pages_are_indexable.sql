-- 0106: the public marketplace is findable by crawlers.
--
-- The marketplace product and shop pages were listed nowhere a crawler looks:
-- the sitemap advertised the retired /shop/<slug> product table (which now
-- redirects), and the edge metadata answered only for that table. The
-- cash-on-delivery marketplace lives in mk_products and mk_vendors, so this
-- migration makes those the source of truth for:
--
--   * sitemap_urls / sitemap_sections   /marketplace/product/<id>, /marketplace/shop/<slug>
--                                       (active products of active shops only)
--   * seo_for_path                      title, description, image and robots for both
--                                       pages, noindex for anything not live
--
-- A shop or product is public only while it can take orders, which is the same
-- rule mk_vendor_page and mk_product_detail apply (active, and order credits
-- above zero). A page is never advertised or indexed while it would refuse a visitor.
--
-- The legacy products section is removed, so no sitemap points at a redirect.
-- Grants are unchanged: create or replace keeps the anon/authenticated
-- execute privileges that 0068 and 0084 granted.

create or replace function public.sitemap_urls(
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

create or replace function public.sitemap_sections(p_size integer default 1000)
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

  elsif v_path like '/marketplace/product/%' then
    v_slug := substr(v_path, 22);
    return query
    with hit as (
      select pr.id, pr.name, pr.description, pr.images, pr.updated_at,
             v.name as shop_name,
             (pr.status = 'active' and v.status = 'active'
              and bsdc.mk_vendor_credits(v.id) > 0) as public_ok
        from public.mk_products pr
        join public.mk_vendors v on v.id = pr.vendor_id
       where pr.id::text = lower(v_slug)
    )
    select v_path,
           case when hit.public_ok
                then bsdc.clip_text(hit.name, 60) || ' — BSDC Marketplace'
                else 'Product — BSDC Marketplace' end,
           case when hit.public_ok
                then bsdc.clip_text(coalesce(nullif(hit.description, ''),
                       hit.name || ' from ' || hit.shop_name), 155)
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

  elsif v_path like '/marketplace/shop/%' then
    v_slug := substr(v_path, 19);
    return query
    with hit as (
      select v.name, v.description, v.cover_url, v.logo_url, v.updated_at,
             (v.status = 'active' and bsdc.mk_vendor_credits(v.id) > 0) as public_ok
        from public.mk_vendors v
       where v.slug = v_slug
    )
    select v_path,
           case when hit.public_ok
                then bsdc.clip_text(hit.name, 60) || ' — BSDC Marketplace'
                else 'Shop — BSDC Marketplace' end,
           case when hit.public_ok
                then bsdc.clip_text(coalesce(nullif(hit.description, ''),
                       hit.name || ' sells on BSDC Marketplace, with cash on delivery.'), 155)
                else 'This shop is not listed.' end,
           case when hit.public_ok and coalesce(hit.cover_url, '') <> ''
                then hit.cover_url
                when hit.public_ok and coalesce(hit.logo_url, '') <> ''
                then hit.logo_url
                else '/og/og-image.png' end,
           v_path,
           case when hit.public_ok then 'index' else 'noindex' end,
           'shop'::text,
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
    case when v_path ~ '^/(messages|settings|notifications|bookmarks|trash|history|ads|vendor|checkout|cart|orders|compose|create|onboarding|admin|offline|api|auth|search|system-check|marketplace/(cart|checkout|orders))(/|$)'
           or v_path ~ '^/[^/]+/[^/]+/edit$'
         then 'noindex' else 'index' end,
    'default'::text,
    now();
end;
$function$;
