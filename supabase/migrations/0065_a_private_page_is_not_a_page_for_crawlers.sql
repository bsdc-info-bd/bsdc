-- ---------------------------------------------------------------------------
-- 0065 — a private page is not a page for crawlers
--
-- Two lists decided which pages an index may hold, and they had drifted apart.
-- robots.txt carried fourteen Disallow prefixes; the default branch of
-- `seo_for_path` noindexed six of them. Every path in the first list but not
-- the second was served to a crawler as `index,follow` — and simultaneously
-- Disallowed, so the crawler could never fetch it to learn otherwise. That is
-- the one combination guaranteed to put a bare, contentless URL in a search
-- index: robots.txt hides the page from the only reader that could see the tag
-- telling it to go away.
--
-- This became urgent because a project gained an editor at
-- `/projects/<slug>/edit`, which no list mentioned at all. It resolved to no
-- project (its slug arrives as `<slug>/edit`), fell through to the default
-- branch, and was answered with the site's generic description, a canonical of
-- itself and `index` — a second, empty, indexable copy of every permalink on
-- the platform.
--
-- The rule is now written once here and once in
-- `src/lib/seo/static-routes.json`, and `t37` fails if the two disagree. The
-- database copy is the one a crawler's HTML carries, so it is the one that has
-- to be right.
--
-- Auditing every route behind `RequireAuth` against both lists found three
-- more pages in neither: `/trash`, `/ads` and `/offline`. The first two are a
-- member's deleted posts and a vendor's ad console; the third is the shell a
-- service worker shows with no network, whose entire text is that there is no
-- network. All three were being served to a crawler as indexable pages with
-- the site's generic description attached.
--
-- `/verify` was left alone on purpose, because it looks like a member route and
-- is not: `ROUTES.verify` is `/auth/verify`, while `/verify` is the public
-- certificate page that `ROUTES.verifyCertificate` names and that the build
-- prerenders. Disallowing the word would have removed a genuine public page
-- from the index while leaving the private one exactly where it was.
--
-- Two details that are easy to get wrong and were gotten wrong first:
--
--   The prefix match is anchored with `(/|$)`. The old pattern `^/(auth)` also
--   matched `/author/…` and anything else beginning with those letters. A rule
--   that noindexes by accident is as much a defect as one that misses.
--
--   The editor rule needs three path segments, not two. A member is free to
--   publish a project whose slug is `edit`, so `/projects/edit` is a real
--   permalink that must stay crawlable, while `/projects/edit/edit` is that
--   project's editor and must not. `/*/edit` cannot tell those apart;
--   `^/[^/]+/[^/]+/edit$` can, and reads the same way in the TypeScript that
--   decides it in a browser.
--
-- The function is replaced in place with its signature and grants unchanged, so
-- this is safe on a database that has already run 0032 and 0063.
-- ---------------------------------------------------------------------------

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
    CASE WHEN v_path ~ '^/(messages|settings|notifications|bookmarks|trash|history|ads|vendor|checkout|cart|orders|compose|create|onboarding|admin|offline|api|auth)(/|$)'
           OR v_path ~ '^/[^/]+/[^/]+/edit$'
         THEN 'noindex' ELSE 'index' END,
    'default'::text,
    now();
END;
$function$;
