-- ---------------------------------------------------------------------------
-- The SEO engine and the branding studio.
--
-- Everything a crawler is told about BSDC, and everything a visitor sees of
-- its identity, decided in one place.
--
-- The rules kept by Postgres rather than by any screen:
--   1. A URL is one string. Paths are normalised on the way in, so /About/,
--      /about and /about?utm_source=x are the same page and cannot be given
--      two different titles by two different people.
--   2. Metadata is a chain with no empty link: an editor's override, then
--      what the thing itself says, then the site default. A page always has
--      a title and a description, because a page with neither is a page
--      search engines invent text for.
--   3. A redirect loop is refused at write time, not survived at read time.
--      The edge gets a destination in one hop or it gets nothing.
--   4. The sitemap is generated from the same visibility rules the pages
--      themselves use. A URL a crawler would be refused never appears in it.
--   5. A brand theme must be readable before it can be active. Contrast is
--      computed here, by the same arithmetic WCAG specifies, so an
--      unreadable palette cannot be saved by anybody in a hurry.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_robots') then
    create type bsdc_robots as enum ('index', 'noindex');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_changefreq') then
    create type bsdc_changefreq as enum ('always', 'hourly', 'daily', 'weekly', 'monthly',
                                         'yearly', 'never');
  end if;
end;
$$;

-- ===========================================================================
-- 0. One shape for a path
-- ===========================================================================
-- A path arrives from a browser bar, from a spreadsheet of redirects, or from
-- a crawler's log. It is lower-cased, stripped of its query and fragment,
-- freed of duplicate slashes and of the trailing slash that makes two URLs
-- out of one page. The root keeps its single slash because it has nothing
-- else.
create or replace function bsdc.normalise_path(p_path text)
returns text
language sql
immutable
as $$
  select case
    when v.cleaned = '' then '/'
    else v.cleaned
  end
  from (
    select rtrim(
      regexp_replace(
        '/' || btrim(
          lower(
            regexp_replace(split_part(split_part(coalesce(p_path, ''), '#', 1), '?', 1), '\s+', '', 'g')
          ),
          '/'
        ),
        '/{2,}', '/', 'g'
      ),
      case when length(coalesce(p_path, '')) > 1 then '/' else '' end
    ) as cleaned
  ) v;
$$;

comment on function bsdc.normalise_path(text) is
  'Canonical form of a site path: lower case, no query, no fragment, no trailing slash.';

-- A sentence that has to fit in a search result. Cut on a word boundary and
-- say so with an ellipsis rather than stopping mid-word.
create or replace function bsdc.clip_text(p_text text, p_limit integer)
returns text
language plpgsql
immutable
as $$
declare
  v_flat text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_cut  text;
  v_space integer;
begin
  if v_flat = '' or p_limit is null or p_limit < 2 then return v_flat; end if;
  if char_length(v_flat) <= p_limit then return v_flat; end if;
  v_cut := left(v_flat, p_limit - 1);
  v_space := length(v_cut) - position(' ' in reverse(v_cut)) + 1;
  if v_space > p_limit / 2 then
    v_cut := left(v_cut, v_space - 1);
  end if;
  return rtrim(v_cut, ' ,;:.-') || '…';
end;
$$;

comment on function bsdc.clip_text(text, integer) is
  'Shortens a sentence to fit a search result, cutting on a word boundary.';

-- ===========================================================================
-- 1. Editor overrides
-- ===========================================================================
create table if not exists public.seo_overrides (
  path         text primary key check (path = bsdc.normalise_path(path)),
  title        text not null default '' check (char_length(title) <= 70),
  description  text not null default '' check (char_length(description) <= 180),
  image_url    text not null default '' check (char_length(image_url) <= 500),
  canonical    text not null default '' check (char_length(canonical) <= 500),
  robots       bsdc_robots not null default 'index',
  changefreq   bsdc_changefreq not null default 'weekly',
  priority     numeric(2, 1) not null default 0.5 check (priority between 0.0 and 1.0),
  note         text not null default '' check (char_length(note) <= 300),
  updated_by   text references public.profiles (uid) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists seo_overrides_touch on public.seo_overrides;
create trigger seo_overrides_touch before update on public.seo_overrides
  for each row execute function bsdc.touch_updated_at();

comment on table public.seo_overrides is
  'Per-path metadata written by the SEO centre. The top link of the fallback chain.';

-- ===========================================================================
-- 2. Redirects
-- ===========================================================================
create table if not exists public.redirects (
  from_path  text primary key check (from_path = bsdc.normalise_path(from_path)),
  to_path    text not null check (char_length(to_path) between 1 and 500),
  status     smallint not null default 301 check (status in (301, 302, 307, 308)),
  note       text not null default '' check (char_length(note) <= 300),
  hits       bigint not null default 0 check (hits >= 0),
  last_hit   timestamptz,
  is_enabled boolean not null default true,
  created_by text references public.profiles (uid) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint redirects_not_self check (bsdc.normalise_path(to_path) <> from_path)
);

drop trigger if exists redirects_touch on public.redirects;
create trigger redirects_touch before update on public.redirects
  for each row execute function bsdc.touch_updated_at();

-- ===========================================================================
-- 3. Brand themes
-- ===========================================================================
create table if not exists public.brand_themes (
  key        text primary key check (key ~ '^[a-z][a-z0-9-]{2,40}$'),
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  tokens     jsonb not null,
  is_active  boolean not null default false,
  updated_by text references public.profiles (uid) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one theme is live. The database holds that, not a convention.
create unique index if not exists brand_themes_one_active
  on public.brand_themes ((is_active)) where is_active;

drop trigger if exists brand_themes_touch on public.brand_themes;
create trigger brand_themes_touch before update on public.brand_themes
  for each row execute function bsdc.touch_updated_at();

-- ===========================================================================
-- 4. Colour arithmetic
-- ===========================================================================
-- WCAG contrast, computed where the data is, so the rule cannot be bypassed
-- by a client that forgot to check.
create or replace function bsdc.hex_channel(p_hex text, p_offset integer)
returns numeric
language sql
immutable
as $$
  select ('x' || substr(replace(p_hex, '#', ''), p_offset, 2))::bit(8)::integer / 255.0;
$$;

create or replace function bsdc.channel_luminance(p_value numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_value <= 0.03928 then p_value / 12.92
    else power((p_value + 0.055) / 1.055, 2.4)
  end;
$$;

create or replace function bsdc.relative_luminance(p_hex text)
returns numeric
language sql
immutable
as $$
  select 0.2126 * bsdc.channel_luminance(bsdc.hex_channel(p_hex, 1))
       + 0.7152 * bsdc.channel_luminance(bsdc.hex_channel(p_hex, 3))
       + 0.0722 * bsdc.channel_luminance(bsdc.hex_channel(p_hex, 5));
$$;

create or replace function public.brand_contrast(p_foreground text, p_background text)
returns numeric
language sql
immutable
as $$
  select round(
    (greatest(bsdc.relative_luminance(p_foreground), bsdc.relative_luminance(p_background)) + 0.05)
    / (least(bsdc.relative_luminance(p_foreground), bsdc.relative_luminance(p_background)) + 0.05),
    2
  );
$$;

comment on function public.brand_contrast(text, text) is
  'WCAG 2.1 contrast ratio between two #rrggbb colours, 1.00 to 21.00.';

-- ===========================================================================
-- 5. Reading the metadata for one path
-- ===========================================================================
-- The chain: an override if an editor wrote one, otherwise whatever the thing
-- at that path says about itself, otherwise the site default. The source is
-- returned too, because "where did this title come from?" is the first
-- question anybody asks when a search result looks wrong.
create or replace function public.seo_for_path(p_path text)
returns table (
  path        text,
  title       text,
  description text,
  image_url   text,
  canonical   text,
  robots      text,
  source      text,
  updated_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
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
$$;

-- ===========================================================================
-- 6. Redirects, resolved in one hop
-- ===========================================================================
-- A redirect that points at another redirect is refused when it is written,
-- so the edge never has to walk a chain and a visitor never pays for two
-- round trips. A redirect that would point back at itself through a chain is
-- the same mistake seen from the other end, and is refused the same way.
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

  -- An absolute destination leaves the site and cannot form a loop here.
  if v_to ~ '^https?://' then
    v_to_path := null;
  else
    v_to_path := bsdc.normalise_path(v_to);
    v_to := v_to_path;
    if v_to_path = v_from then
      raise exception 'A redirect cannot point at itself' using errcode = '22023';
    end if;
    -- The destination must be a real page, not another redirect.
    if exists (
      select 1 from public.redirects r
      where r.from_path = v_to_path and r.is_enabled
    ) then
      raise exception 'The destination % is itself redirected; point at the final page',
        v_to_path using errcode = '22023';
    end if;
    -- Nothing already pointing here may be made to point back.
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

create or replace function public.remove_redirect(p_from text)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_from text := bsdc.normalise_path(p_from);
begin
  perform bsdc.require_permission('seo.manage');
  delete from public.redirects where from_path = v_from;
  if not found then return false; end if;
  perform bsdc.audit('redirect.remove', 'redirect', v_from, '{}'::jsonb);
  return true;
end;
$$;

-- Asked by the edge on every request that would otherwise be a 404. It
-- counts the hit, because a redirect nobody follows is a redirect that can be
-- retired, and a 404 that is hit constantly is a redirect somebody forgot.
create or replace function public.follow_redirect(p_path text)
returns table (target text, status smallint)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_from text := bsdc.normalise_path(p_path);
begin
  return query
  with followed as (
    update public.redirects r
       set hits = r.hits + 1, last_hit = now()
     where r.from_path = v_from and r.is_enabled
    returning r.to_path, r.status
  )
  select f.to_path, f.status from followed f;
end;
$$;

-- ===========================================================================
-- 7. Overrides, written by the SEO centre
-- ===========================================================================
create or replace function public.set_seo_override(
  p_path text,
  p_title text,
  p_description text,
  p_image_url text default '',
  p_canonical text default '',
  p_robots text default 'index',
  p_changefreq text default 'weekly',
  p_priority numeric default 0.5,
  p_note text default ''
)
returns public.seo_overrides
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_path text := bsdc.normalise_path(p_path);
  v_row  public.seo_overrides;
begin
  perform bsdc.require_permission('seo.manage');

  if btrim(coalesce(p_title, '')) = '' and btrim(coalesce(p_description, '')) = '' then
    raise exception 'An override that says nothing is a deletion; use clear_seo_override'
      using errcode = '22023';
  end if;

  insert into public.seo_overrides
    (path, title, description, image_url, canonical, robots, changefreq, priority, note, updated_by)
  values (
    v_path,
    bsdc.clip_text(btrim(coalesce(p_title, '')), 70),
    bsdc.clip_text(btrim(coalesce(p_description, '')), 180),
    btrim(coalesce(p_image_url, '')),
    case when btrim(coalesce(p_canonical, '')) = '' then ''
         else bsdc.normalise_path(p_canonical) end,
    coalesce(nullif(p_robots, ''), 'index')::bsdc_robots,
    coalesce(nullif(p_changefreq, ''), 'weekly')::bsdc_changefreq,
    least(1.0, greatest(0.0, coalesce(p_priority, 0.5))),
    btrim(coalesce(p_note, '')),
    bsdc.current_uid()
  )
  on conflict (path) do update
    set title       = excluded.title,
        description = excluded.description,
        image_url   = excluded.image_url,
        canonical   = excluded.canonical,
        robots      = excluded.robots,
        changefreq  = excluded.changefreq,
        priority    = excluded.priority,
        note        = excluded.note,
        updated_by  = excluded.updated_by
  returning * into v_row;

  perform bsdc.audit('seo.override', 'path', v_path,
    jsonb_build_object('robots', v_row.robots, 'title', v_row.title));
  return v_row;
end;
$$;

create or replace function public.clear_seo_override(p_path text)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_path text := bsdc.normalise_path(p_path);
begin
  perform bsdc.require_permission('seo.manage');
  delete from public.seo_overrides where path = v_path;
  if not found then return false; end if;
  perform bsdc.audit('seo.override.clear', 'path', v_path, '{}'::jsonb);
  return true;
end;
$$;

-- ===========================================================================
-- 8. The sitemap
-- ===========================================================================
-- One row per public URL, drawn from the same conditions the pages use. A
-- section with more URLs than fit in one file is paged; the index tells the
-- crawler how many pages there are.
create or replace function public.sitemap_urls(
  p_section text,
  p_page integer default 1,
  p_size integer default 1000
)
returns table (loc text, lastmod timestamptz, changefreq text, priority numeric)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
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
$$;

create or replace function public.sitemap_sections(p_size integer default 1000)
returns table (section text, urls integer, pages integer, lastmod timestamptz)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with sizes as (select least(5000, greatest(1, coalesce(p_size, 1000))) as size),
  counted as (
    select 'posts'::text as section,
           count(*)::integer as urls,
           max(updated_at) as lastmod
    from public.posts where status = 'published' and visibility = 'public'
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
    from public.events where not is_cancelled and ends_at > now() - interval '30 days'
    union all
    select 'jobs', count(*)::integer, max(updated_at)
    from public.jobs where status = 'open'
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
$$;

-- ===========================================================================
-- 9. The branding studio
-- ===========================================================================
-- A theme is a flat map of tokens. The studio writes it, the database checks
-- that every token is a colour and that the text on each surface can actually
-- be read, and only then is it allowed to become the live theme.
create or replace function bsdc.check_theme_tokens(p_tokens jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_key text;
  v_value text;
  v_pairs constant text[][] := array[
    array['text', 'surface'],
    array['text-muted', 'surface'],
    array['on-primary', 'primary'],
    array['on-accent', 'accent']
  ];
  v_pair text[];
  v_ratio numeric;
begin
  if p_tokens is null or jsonb_typeof(p_tokens) <> 'object' then
    raise exception 'A theme is an object of colour tokens' using errcode = '22023';
  end if;

  for v_key, v_value in select key, value #>> '{}' from jsonb_each(p_tokens) loop
    if v_key !~ '^[a-z][a-z0-9-]{1,30}$' then
      raise exception 'Token name % is not a usable CSS custom property', v_key
        using errcode = '22023';
    end if;
    if v_value !~* '^#[0-9a-f]{6}$' then
      raise exception 'Token % must be a #rrggbb colour, not %', v_key, v_value
        using errcode = '22023';
    end if;
  end loop;

  foreach v_pair slice 1 in array v_pairs loop
    if p_tokens ? v_pair[1] and p_tokens ? v_pair[2] then
      v_ratio := public.brand_contrast(p_tokens ->> v_pair[1], p_tokens ->> v_pair[2]);
      if v_ratio < 4.5 then
        raise exception
          'Contrast between % and % is %:1; body text needs at least 4.5:1',
          v_pair[1], v_pair[2], v_ratio
          using errcode = '22023';
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.save_brand_theme(
  p_key text,
  p_name text,
  p_tokens jsonb
)
returns public.brand_themes
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_row public.brand_themes;
begin
  perform bsdc.require_permission('brand.manage');
  perform bsdc.check_theme_tokens(p_tokens);

  insert into public.brand_themes (key, name, tokens, updated_by)
  values (lower(btrim(p_key)), btrim(p_name), p_tokens, bsdc.current_uid())
  on conflict (key) do update
    set name = excluded.name,
        tokens = excluded.tokens,
        updated_by = excluded.updated_by
  returning * into v_row;

  perform bsdc.audit('brand.save', 'theme', v_row.key,
    jsonb_build_object('tokens', (select count(*) from jsonb_object_keys(p_tokens))));
  return v_row;
end;
$$;

create or replace function public.activate_brand_theme(p_key text)
returns public.brand_themes
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_row public.brand_themes;
begin
  perform bsdc.require_permission('brand.manage');

  select * into v_row from public.brand_themes where key = lower(btrim(p_key));
  if not found then
    raise exception 'No theme called %', p_key using errcode = 'P0002';
  end if;
  perform bsdc.check_theme_tokens(v_row.tokens);

  update public.brand_themes set is_active = false where is_active;
  update public.brand_themes set is_active = true where key = v_row.key returning * into v_row;

  perform bsdc.audit('brand.activate', 'theme', v_row.key, '{}'::jsonb);
  return v_row;
end;
$$;

-- The live theme as CSS, for the edge to inline. Public, because it is what
-- every visitor sees anyway, and empty rather than wrong when nothing is set.
create or replace function public.brand_theme_css()
returns text
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(
    ':root{' || string_agg('--brand-' || t.key || ':' || (t.value #>> '{}'), ';'
                           order by t.key) || '}',
    ''
  )
  from public.brand_themes b
  cross join lateral jsonb_each(b.tokens) t(key, value)
  where b.is_active;
$$;

-- ===========================================================================
-- 10. Permissions
-- ===========================================================================
insert into public.role_permissions (role, permission)
values
  ('manager', 'seo.manage'),
  ('admin',   'seo.manage'),
  ('owner',   'seo.manage'),
  ('admin',   'brand.manage'),
  ('owner',   'brand.manage')
on conflict do nothing;

insert into public.site_config (key, value, value_type, group_name, label, help, is_public, sort_order)
values
  ('seo.default_title', '"Bangladesh Software Development Community"'::jsonb, 'string', 'seo',
   'Default title', 'Used when a page has nothing better to say about itself.', true, 10),
  ('seo.default_description',
   '"The open community platform for Bangladeshi and worldwide software developers."'::jsonb,
   'string', 'seo', 'Default description', 'Shown in search results for pages without an override.',
   true, 20),
  ('seo.sitemap_page_size', '1000'::jsonb, 'number', 'seo', 'URLs per sitemap file',
   'Crawlers accept up to 50000; smaller files are fetched more often.', false, 30)
on conflict (key) do nothing;
