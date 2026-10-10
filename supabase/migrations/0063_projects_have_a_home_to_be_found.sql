-- ---------------------------------------------------------------------------
-- 0063 — projects have a page, and crawlers have a path to it
--
-- The project directory used to be the only destination for every project
-- search result and every new submission. Give each project a public permalink,
-- teach the edge SEO middleware to describe it before JavaScript runs, and put
-- every project in the live sitemap. These functions are replaced in place so
-- the migration is safe on databases that have already run older SEO files.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sitemap_urls(
  p_section text,
  p_page integer DEFAULT 1,
  p_size integer DEFAULT 1000
)
RETURNS TABLE(loc text, lastmod timestamptz, changefreq text, priority numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, bsdc, pg_temp
AS $function$
  WITH page AS (
    SELECT greatest(1, coalesce(p_page, 1)) AS n,
           least(5000, greatest(1, coalesce(p_size, 1000))) AS size
  ),
  rows AS (
    SELECT '/p/' || p.slug AS loc, p.updated_at AS lastmod, 'weekly'::text AS changefreq,
           0.7::numeric AS priority
      FROM public.posts p
     WHERE p_section = 'posts'
       AND p.status = 'published' AND p.visibility = 'public'
       AND to_jsonb(p) ->> 'deleted_at' IS NULL
    UNION ALL
    SELECT '/shop/' || pr.slug, pr.updated_at, 'daily', 0.8
      FROM public.products pr
     WHERE p_section = 'products' AND pr.status IN ('active', 'out_of_stock')
    UNION ALL
    SELECT '/learn/' || c.slug, c.updated_at, 'weekly', 0.8
      FROM public.courses c
     WHERE p_section = 'courses' AND c.status = 'published'
    UNION ALL
    SELECT '/g/' || g.slug, g.updated_at, 'weekly', 0.6
      FROM public.groups g
     WHERE p_section = 'groups' AND g.privacy = 'public' AND NOT g.is_archived
    UNION ALL
    SELECT '/events/' || e.slug, e.updated_at, 'daily', 0.6
      FROM public.events e
     WHERE p_section = 'events' AND NOT e.is_cancelled
       AND e.ends_at > now() - interval '30 days'
    UNION ALL
    SELECT '/jobs/' || j.slug, j.updated_at, 'daily', 0.7
      FROM public.jobs j
     WHERE p_section = 'jobs' AND j.status = 'open'
    UNION ALL
    SELECT '/projects/' || pj.slug, pj.updated_at, 'weekly', 0.7
      FROM public.projects pj
     WHERE p_section = 'projects'
    UNION ALL
    SELECT '/tag/' || t.slug, now(), 'weekly', 0.4
      FROM public.tags t
     WHERE p_section = 'tags' AND t.posts_count > 0
    UNION ALL
    SELECT '/@' || pf.username, pf.updated_at, 'weekly', 0.5
      FROM public.profiles pf
     WHERE p_section = 'profiles'
       AND pf.username IS NOT NULL
       AND pf.status = 'active'
       AND coalesce((pf.privacy ->> 'discoverable')::boolean, true)
  )
  SELECT r.loc,
         r.lastmod,
         coalesce(o.changefreq::text, r.changefreq),
         coalesce(o.priority, r.priority)
    FROM rows r
    LEFT JOIN public.seo_overrides o ON o.path = r.loc
   WHERE coalesce(o.robots, 'index') = 'index'
   ORDER BY r.lastmod DESC NULLS LAST, r.loc
   OFFSET (SELECT (n - 1) * size FROM page)
   LIMIT (SELECT size FROM page);
$function$;

CREATE OR REPLACE FUNCTION public.sitemap_sections(p_size integer DEFAULT 1000)
RETURNS TABLE(section text, urls integer, pages integer, lastmod timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, bsdc, pg_temp
AS $function$
  WITH sizes AS (
    SELECT least(5000, greatest(1, coalesce(p_size, 1000))) AS size
  ),
  counted AS (
    SELECT 'posts'::text AS section, count(*)::integer AS urls, max(updated_at) AS lastmod
      FROM public.posts p
     WHERE p.status = 'published' AND p.visibility = 'public'
       AND to_jsonb(p) ->> 'deleted_at' IS NULL
    UNION ALL
    SELECT 'products', count(*)::integer, max(updated_at)
      FROM public.products WHERE status IN ('active', 'out_of_stock')
    UNION ALL
    SELECT 'courses', count(*)::integer, max(updated_at)
      FROM public.courses WHERE status = 'published'
    UNION ALL
    SELECT 'groups', count(*)::integer, max(updated_at)
      FROM public.groups WHERE privacy = 'public' AND NOT is_archived
    UNION ALL
    SELECT 'events', count(*)::integer, max(updated_at)
      FROM public.events WHERE NOT is_cancelled AND ends_at > now() - interval '30 days'
    UNION ALL
    SELECT 'jobs', count(*)::integer, max(updated_at)
      FROM public.jobs WHERE status = 'open'
    UNION ALL
    SELECT 'projects', count(*)::integer, max(updated_at)
      FROM public.projects
    UNION ALL
    SELECT 'tags', count(*)::integer, NULL::timestamptz
      FROM public.tags WHERE posts_count > 0
    UNION ALL
    SELECT 'profiles', count(*)::integer, max(updated_at)
      FROM public.profiles
     WHERE username IS NOT NULL AND status = 'active'
       AND coalesce((privacy ->> 'discoverable')::boolean, true)
  )
  SELECT c.section,
         c.urls,
         greatest(1, ceil(c.urls::numeric / (SELECT size FROM sizes))::integer),
         c.lastmod
    FROM counted c
   WHERE c.urls > 0
   ORDER BY c.section;
$function$;

CREATE OR REPLACE FUNCTION public.seo_for_path(p_path text)
RETURNS TABLE(
  path text,
  title text,
  description text,
  image_url text,
  canonical text,
  robots text,
  source text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, bsdc, pg_temp
AS $function$
DECLARE
  v_path text := bsdc.normalise_path(p_path);
  v_slug text;
  v_site text := 'Bangladesh Software Development Community';
  v_row record;
BEGIN
  -- An editor's override wins over the record's own metadata.
  SELECT o.* INTO v_row FROM public.seo_overrides o WHERE o.path = v_path;
  IF FOUND AND (v_row.title <> '' OR v_row.description <> '') THEN
    RETURN QUERY SELECT
      v_path,
      coalesce(nullif(v_row.title, ''), v_site),
      v_row.description,
      v_row.image_url,
      coalesce(nullif(v_row.canonical, ''), v_path),
      v_row.robots::text,
      'override'::text,
      v_row.updated_at;
    RETURN;
  END IF;

  IF v_path LIKE '/p/%' THEN
    v_slug := substr(v_path, 4);
    RETURN QUERY
    SELECT v_path,
           bsdc.clip_text(coalesce(nullif(p.title, ''), 'Post'), 65) || ' — BSDC',
           bsdc.clip_text(coalesce(nullif(p.excerpt, ''), p.body), 155),
           p.cover_url,
           v_path,
           CASE WHEN p.status = 'published' AND p.visibility = 'public'
                     AND p.deleted_at IS NULL
                THEN 'index' ELSE 'noindex' END,
           'post'::text,
           p.updated_at
      FROM public.posts p
     WHERE p.slug = v_slug;
    IF FOUND THEN RETURN; END IF;

  ELSIF v_path LIKE '/shop/%' THEN
    v_slug := substr(v_path, 7);
    RETURN QUERY
    SELECT v_path,
           bsdc.clip_text(pr.title, 60) || ' — BSDC Shop',
           bsdc.clip_text(coalesce(nullif(pr.summary, ''), pr.description), 155),
           coalesce(pr.images[1], ''),
           v_path,
           CASE WHEN pr.status IN ('active', 'out_of_stock') THEN 'index' ELSE 'noindex' END,
           'product'::text,
           pr.updated_at
      FROM public.products pr
     WHERE pr.slug = v_slug;
    IF FOUND THEN RETURN; END IF;

  ELSIF v_path LIKE '/learn/%' THEN
    v_slug := substr(v_path, 8);
    RETURN QUERY
    SELECT v_path,
           bsdc.clip_text(c.title, 60) || ' — BSDC Learning',
           bsdc.clip_text(coalesce(nullif(c.summary, ''), c.description), 155),
           c.cover_url,
           v_path,
           CASE WHEN c.status = 'published' THEN 'index' ELSE 'noindex' END,
           'course'::text,
           c.updated_at
      FROM public.courses c
     WHERE c.slug = v_slug;
    IF FOUND THEN RETURN; END IF;

  ELSIF v_path LIKE '/g/%' THEN
    v_slug := substr(v_path, 4);
    RETURN QUERY
    SELECT v_path,
           bsdc.clip_text(g.name, 60) || ' — BSDC Groups',
           bsdc.clip_text(g.description, 155),
           g.cover_url,
           v_path,
           CASE WHEN g.privacy = 'public' AND NOT g.is_archived THEN 'index' ELSE 'noindex' END,
           'group'::text,
           g.updated_at
      FROM public.groups g
     WHERE g.slug = v_slug;
    IF FOUND THEN RETURN; END IF;

  ELSIF v_path LIKE '/projects/%' THEN
    v_slug := substr(v_path, 11);
    RETURN QUERY
    SELECT v_path,
           bsdc.clip_text(pj.name, 60) || ' — BSDC Projects',
           bsdc.clip_text(coalesce(nullif(pj.tagline, ''), pj.description), 155),
           coalesce(nullif(pj.cover_url, ''), '/og/og-image.png'),
           v_path,
           'index'::text,
           'project'::text,
           pj.updated_at
      FROM public.projects pj
     WHERE pj.slug = v_slug;
    IF FOUND THEN RETURN; END IF;

  ELSIF v_path LIKE '/@%' THEN
    v_slug := substr(v_path, 3);
    RETURN QUERY
    SELECT v_path,
           pf.display_name || ' (@' || pf.username || ') — BSDC',
           bsdc.clip_text(
             coalesce(nullif(pf.bio, ''), pf.display_name || ' on the BSDC developer community.'),
             155),
           pf.avatar_url,
           v_path,
           CASE WHEN pf.status = 'active'
                     AND coalesce((pf.privacy ->> 'discoverable')::boolean, true)
                THEN 'index' ELSE 'noindex' END,
           'profile'::text,
           pf.updated_at
      FROM public.profiles pf
     WHERE pf.username = v_slug;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY SELECT
    v_path,
    v_site,
    'The open community platform for Bangladeshi and worldwide software '
      || 'developers: posts, groups, jobs, learning, projects and marketplace.',
    '/og/og-image.png'::text,
    v_path,
    CASE WHEN v_path ~ '^/(messages|settings|notifications|bookmarks|vendor|auth)'
         THEN 'noindex' ELSE 'index' END,
    'default'::text,
    now();
END;
$function$;
