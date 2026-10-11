-- 0067: a gig has a page, and an address that is not a page answers as missing.
--
-- Three things the 0066 sitemap and metadata got wrong or did not cover:
--   * gigs had no detail page and no sitemap entry. Open gigs are now both;
--     closed and draft gigs are neither, and seo_for_path answers them noindex
--     with a generic title so a closed gig's title does not reach a crawler.
--   * tags had no record branch, so a tag address was served the site
--     description. A tag with posts is indexed; an unknown tag is missing.
--   * a post, product, course, group, project, job, event, gig, tag or profile
--     address that matches nothing used to fall through to the site home
--     description with index. It is now answered as missing with noindex, and
--     the middleware serves it with status 404 (the soft-404 fix).
--
-- Everything else in the three functions is copied unchanged from 0066.

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
       AND (e.group_id IS NULL OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = e.group_id AND g.privacy = 'public'))
    UNION ALL
    SELECT '/jobs/' || j.slug, j.updated_at, 'daily', 0.7
      FROM public.jobs j
     WHERE p_section = 'jobs' AND j.status = 'open' AND (j.expires_at IS NULL OR j.expires_at > now())
    UNION ALL
    SELECT '/freelance/' || g.slug, g.updated_at, 'weekly', 0.6
      FROM public.gigs g
     WHERE p_section = 'gigs' AND g.status = 'open'
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
      FROM public.events e
     WHERE NOT e.is_cancelled AND e.ends_at > now() - interval '30 days'
       AND (e.group_id IS NULL OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = e.group_id AND g.privacy = 'public'))
    UNION ALL
    SELECT 'jobs', count(*)::integer, max(updated_at)
      FROM public.jobs j WHERE j.status = 'open' AND (j.expires_at IS NULL OR j.expires_at > now())
    UNION ALL
    SELECT 'gigs', count(*)::integer, max(updated_at)
      FROM public.gigs WHERE status = 'open'
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

  ELSIF v_path LIKE '/jobs/%' THEN
    v_slug := substr(v_path, 7);
    RETURN QUERY
    WITH hit AS (
      SELECT j.*,
             (j.status = 'open' AND (j.expires_at IS NULL OR j.expires_at > now())) AS live
        FROM public.jobs j
       WHERE j.slug = v_slug
    )
    SELECT v_path,
           CASE WHEN hit.live THEN bsdc.clip_text(hit.title, 60) || ' — BSDC Jobs' ELSE 'Job — BSDC Jobs' END,
           CASE WHEN hit.live THEN bsdc.clip_text(coalesce(nullif(hit.description, ''), hit.company), 155)
                ELSE 'This job listing is not open.' END,
           '/og/og-image.png'::text,
           v_path,
           CASE WHEN hit.live THEN 'index' ELSE 'noindex' END,
           'job'::text,
           hit.updated_at
      FROM hit;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT v_path, 'Job not found — BSDC Jobs',
      'This job listing does not exist.', '/og/og-image.png'::text, v_path,
      'noindex'::text, 'missing'::text, NULL::timestamptz;
    RETURN;

  ELSIF v_path LIKE '/events/%' THEN
    v_slug := substr(v_path, 9);
    RETURN QUERY
    WITH hit AS (
      SELECT e.*,
             (e.group_id IS NULL OR EXISTS (
                SELECT 1 FROM public.groups g
                 WHERE g.id = e.group_id AND g.privacy = 'public')) AS public_ok
        FROM public.events e
       WHERE e.slug = v_slug
    )
    SELECT v_path,
           CASE WHEN hit.public_ok THEN bsdc.clip_text(hit.title, 60) || ' — BSDC Events'
                ELSE 'Event — BSDC Events' END,
           CASE WHEN hit.public_ok THEN bsdc.clip_text(coalesce(nullif(hit.description, ''), hit.title), 155)
                ELSE 'This event is not public.' END,
           CASE WHEN hit.public_ok AND hit.cover_url <> '' THEN hit.cover_url ELSE '/og/og-image.png' END,
           v_path,
           CASE WHEN hit.public_ok AND NOT hit.is_cancelled THEN 'index' ELSE 'noindex' END,
           'event'::text,
           hit.updated_at
      FROM hit;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT v_path, 'Event not found — BSDC Events',
      'This event does not exist.', '/og/og-image.png'::text, v_path,
      'noindex'::text, 'missing'::text, NULL::timestamptz;
    RETURN;

  ELSIF v_path LIKE '/freelance/%' THEN
    v_slug := substr(v_path, 12);
    RETURN QUERY
    WITH hit AS (
      SELECT g.*, (g.status = 'open') AS live
        FROM public.gigs g
       WHERE g.slug = v_slug
    )
    SELECT v_path,
           CASE WHEN hit.live THEN bsdc.clip_text(hit.title, 60) || ' — BSDC Freelance'
                ELSE 'Gig — BSDC Freelance' END,
           CASE WHEN hit.live THEN bsdc.clip_text(coalesce(nullif(hit.description, ''), hit.title), 155)
                ELSE 'This gig is not open for proposals.' END,
           '/og/og-image.png'::text,
           v_path,
           CASE WHEN hit.live THEN 'index' ELSE 'noindex' END,
           'gig'::text,
           hit.updated_at
      FROM hit;
    IF FOUND THEN RETURN; END IF;

  ELSIF v_path LIKE '/tag/%' THEN
    v_slug := substr(v_path, 6);
    RETURN QUERY
    SELECT v_path,
           bsdc.clip_text(t.label_en, 60) || ' — BSDC',
           bsdc.clip_text(coalesce(nullif(t.description, ''), 'Posts tagged ' || t.label_en || ' on BSDC.'), 155),
           '/og/og-image.png'::text,
           v_path,
           CASE WHEN t.posts_count > 0 THEN 'index' ELSE 'noindex' END,
           'tag'::text,
           NULL::timestamptz
      FROM public.tags t
     WHERE t.slug = v_slug;
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

  -- A record-shaped address that matched nothing is a missing page, not the
  -- site's home description. It is answered as missing (the middleware turns
  -- that into a 404) and kept out of the index.
  IF v_path LIKE '/p/%' OR v_path LIKE '/shop/%' OR v_path LIKE '/learn/%'
     OR v_path LIKE '/g/%' OR v_path LIKE '/projects/%' OR v_path LIKE '/jobs/%'
     OR v_path LIKE '/events/%' OR v_path LIKE '/freelance/%' OR v_path LIKE '/tag/%'
     OR v_path LIKE '/@%' THEN
    RETURN QUERY SELECT v_path, 'Not found — BSDC', 'This page does not exist.',
      '/og/og-image.png'::text, v_path, 'noindex'::text, 'missing'::text, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_path,
    v_site,
    'The open community platform for Bangladeshi and worldwide software '
      || 'developers: posts, groups, jobs, learning, projects and marketplace.',
    '/og/og-image.png'::text,
    v_path,
    CASE WHEN v_path ~ '^/(messages|settings|notifications|bookmarks|trash|history|ads|vendor|checkout|cart|orders|compose|create|onboarding|admin|offline|api|auth)(/|$)'
           OR v_path ~ '^/[^/]+/[^/]+/edit$'
         THEN 'noindex' ELSE 'index' END,
    'default'::text,
    now();
END;
$function$;
