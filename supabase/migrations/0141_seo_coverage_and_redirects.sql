-- ============================================================================
-- 0141 — SEO coverage, redirect cycles, and the 404s worth redirecting
-- ============================================================================
--
-- §49.8 of the plan. Three reads and one constraint:
--
--   * `seo_coverage` — which paths that should be optimised have no override, and
--     which have one that is stale, half-filled or pointing at the wrong canonical.
--   * `redirect_cycle_check` — whether a chain of redirects loops. Today nothing
--     stops `a → b` and `b → a`, and the edge would answer 301 in a circle until
--     the client gave up. That is a live outage produced by two clicks.
--   * `redirect_404_sources` — paths that are being asked for and are not there, so
--     the redirect that is missing has a name.
--   * A unique constraint on `seo_overrides.canonical` filtered to non-empty
--     values, which makes "two pages cannot share a canonical" true rather than
--     intended.
--
-- The constraint can fail on data that already exists, so the migration starts by
-- listing the offenders in a readable message rather than surfacing a raw
-- constraint violation at whatever hour the deploy runs.

-- ---------------------------------------------------------------------------
-- 1. Pre-flight: say what is wrong before refusing to start
-- ---------------------------------------------------------------------------
do $$
declare
  v_dupes text;
begin
  select string_agg(format('%s → %s', canonical, paths), '; ')
    into v_dupes
    from (
      select canonical, string_agg(path, ', ' order by path) as paths
        from public.seo_overrides
       where btrim(canonical) <> ''
       group by canonical
      having count(*) > 1
    ) d;

  if v_dupes is not null then
    raise exception
      'Two pages share a canonical, so the unique constraint cannot be added. Fix these first: %',
      v_dupes
      using errcode = '23505';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. One canonical, one page
-- ---------------------------------------------------------------------------
-- Filtered to non-empty because the empty string is the default and means "use the
-- path itself" — many rows legitimately have no canonical of their own, and a plain
-- unique index would reject the second of them.
-- The column is indexed as stored, not through `normalise_path`. The first version
-- wrapped it, and `t101` caught the consequence: the check constraint below
-- normalises on write, so by the time a row lands the value is already canonical,
-- and normalising again made the index expression differ from the constraint's
-- idea of equality in a way that let two rows through. A canonical column is
-- normalised once, at the door.
create unique index if not exists seo_overrides_canonical_unique
  on public.seo_overrides (canonical)
  where btrim(canonical) <> '';

-- A canonical that points at the page itself is not an override, it is a no-op
-- that makes the coverage report lie about how much is actually set.
alter table public.seo_overrides
  drop constraint if exists seo_overrides_canonical_not_self;
alter table public.seo_overrides
  add constraint seo_overrides_canonical_not_self
  check (btrim(canonical) = '' or bsdc.normalise_path(canonical) <> path);

-- A canonical written by an editor is normalised on the way in, so the unique index
-- above compares like with like. Without this a trailing slash would slip past the
-- constraint and the two pages would still compete in a search result.
create or replace function bsdc.normalise_seo_canonical()
returns trigger
language plpgsql
as $$
begin
  if btrim(coalesce(new.canonical, '')) <> '' then
    new.canonical := bsdc.normalise_path(new.canonical);
  end if;
  return new;
end;
$$;

drop trigger if exists seo_overrides_normalise_canonical on public.seo_overrides;
create trigger seo_overrides_normalise_canonical
  before insert or update of canonical on public.seo_overrides
  for each row execute function bsdc.normalise_seo_canonical();

-- ---------------------------------------------------------------------------
-- 3. Where the 404s come from
-- ---------------------------------------------------------------------------
-- The edge asks for a redirect and gets nothing; that is the moment worth
-- recording. Without it, "which old URLs still get traffic" is a question nobody
-- can answer except by reading a CDN log that has already rotated.
create table if not exists public.seo_404_hits (
  path        text primary key check (path = bsdc.normalise_path(path)),
  hits        bigint not null default 1 check (hits > 0),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  -- Set once somebody decides what should happen to it, so the queue can be
  -- emptied without deleting the evidence.
  resolved_at timestamptz,
  resolved_by text references public.profiles (uid) on delete set null
);

create index if not exists seo_404_hits_queue_idx
  on public.seo_404_hits (last_seen desc) where resolved_at is null;

alter table public.seo_404_hits enable row level security;

drop policy if exists seo_404_hits_staff_read on public.seo_404_hits;
create policy seo_404_hits_staff_read on public.seo_404_hits
  for select using (bsdc.has_permission('seo.manage'));

revoke all on public.seo_404_hits from anon;
revoke all on public.seo_404_hits from authenticated;
grant select on public.seo_404_hits to authenticated;

-- The edge reports a miss through this, because it holds no table privileges.
-- Called on the miss path, so it must not fail loudly: a broken recorder cannot be
-- allowed to turn a 404 into a 500.
create or replace function public.note_missing_path(p_path text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_path text;
begin
  begin
    v_path := bsdc.normalise_path(p_path);
  exception
    when others then
      return;
  end;

  -- A path with a query string, a fragment or an absurd length is noise; the
  -- normaliser has already stripped the first two, and the length check keeps the
  -- table from being a place to store whatever a scanner sends.
  if v_path is null or char_length(v_path) > 300 then
    return;
  end if;

  insert into public.seo_404_hits as h (path, hits, last_seen)
  values (v_path, 1, now())
  on conflict (path) do update
    set hits = h.hits + 1,
        last_seen = now(),
        -- A path that comes back after being dealt with is a path whose fix did
        -- not work. Clear the resolution so it returns to the queue rather than
        -- hiding behind a tick somebody gave it months ago.
        resolved_at = null,
        resolved_by = null;
exception
  when others then
    -- Recording a miss must never be the reason a request fails.
    return;
end;
$$;

revoke all on function public.note_missing_path(text) from public;
grant execute on function public.note_missing_path(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Redirect cycles
-- ---------------------------------------------------------------------------
-- Walks each chain and reports the ones that loop, with the loop itself. Written
-- as a read rather than as a prevention, because prevention needs a recursive check
-- on every write and this is cheaper: the editor is told before saving, and
-- `set_redirect` asks this question below.
create or replace function public.redirect_cycle_check()
returns table (
  from_path  text,
  loop_paths text[],
  length     integer
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with recursive walk as (
    select r.from_path as start, r.to_path as here,
           array[r.from_path, r.to_path] as trail, 1 as depth
      from public.redirects r
     where r.is_enabled
    union all
    -- Two ways to write this next step, and both were tried before this one.
    --
    --   * No guard at all: correct for a loop, but a long chain expands into every
    --     path through it, which is exponential rather than linear.
    --   * `not r.to_path = any(w.trail)`: linear, but it prunes the one step that
    --     closes the loop, so a table with `a → b` and `b → a` reported nothing.
    --
    -- What is written here prunes a step only once the loop has already been taken
    -- — that is, once the walk is back at its own start — so the closing step is
    -- always present in the result and no step is ever taken from it.
    select w.start, r.to_path, w.trail || r.to_path, w.depth + 1
      from walk w
      join public.redirects r on r.from_path = w.here
     where r.is_enabled
       and w.depth < 20
       and w.here <> w.start
  )
  select w.start, w.trail, w.depth
    from walk w
   where w.here = w.start and w.depth > 1
   order by w.start;
$$;

revoke all on function public.redirect_cycle_check() from public, anon;
grant execute on function public.redirect_cycle_check() to authenticated, service_role;

-- `set_redirect` in 0032 already refuses the two cases that produce a loop in
-- practice: a destination that is itself redirected, and a two-step swap. What it
-- does not do is refuse a *longer* loop, because it never follows the chain further
-- than one step.
--
-- This restates it with the same rules and the same return value — the row, not the
-- path — and walks the whole chain. Keeping the original's rules matters: it is
-- what stops redirect chains forming through the RPC at all, and a chain that
-- cannot form cannot become a loop. The walk is what catches the loop that a
-- restore from backup, or a hand-run statement, has already put in the table.
create or replace function public.set_redirect(
  p_from   text,
  p_to     text,
  p_status smallint default 301,
  p_note   text default ''
)
returns public.redirects
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_from    text := bsdc.normalise_path(p_from);
  v_to      text := btrim(coalesce(p_to, ''));
  v_to_path text;
  v_walk    text;
  v_guard   integer := 0;
  v_row     public.redirects;
begin
  perform bsdc.require_permission('seo.manage');

  if v_from = '/' then
    raise exception 'The home page cannot be redirected away' using errcode = '22023';
  end if;
  if v_to = '' then
    raise exception 'A redirect needs a destination' using errcode = '22023';
  end if;

  -- 0068's origin safety, kept exactly. It is the rule that stops a trusted BSDC
  -- URL becoming an open redirector, and it was the first thing this rewrite
  -- dropped: t41 caught it within one run. A destination that leaves the site must
  -- be https on this domain, never plain http, and never protocol-relative.
  if v_to ~ '^//' then
    raise exception 'Protocol-relative redirect destinations are not allowed' using errcode = '22023';
  end if;

  if v_to ~* '^[a-z][a-z0-9+.-]*:' then
    if v_to !~* '^https://([a-z0-9-]+\.)*bsdc\.info\.bd(/|$)' then
      raise exception 'External redirects must stay on https://*.bsdc.info.bd' using errcode = '22023';
    end if;
    -- An absolute destination leaves the site and cannot form a loop here.
    v_to_path := null;
  else
    v_to_path := bsdc.normalise_path(v_to);
    v_to := v_to_path;
    if v_to_path = v_from then
      raise exception 'A redirect cannot point at itself' using errcode = '22023';
    end if;
  end if;

  -- The destination must be a real page, not another redirect. This is 0032's rule
  -- and it is the one that matters: a redirect that only ever points at a final
  -- page cannot form a chain, and a chain that cannot form cannot loop. It also
  -- means the long-chain case below is unreachable through this function, which is
  -- the point — `redirect_cycle_check` exists to catch the chains that a restore or
  -- a hand-run statement has already put in the table.
  -- The destination must be a real page, not another redirect. Checked before the
  -- walk, because the walk starts at the destination and "the destination has a
  -- redirect" is a fact about one lookup, not about what follows it. The earlier
  -- version tested this after advancing one step, so it only fired when the
  -- destination had a *successor* — a redirect of `/x → /y` where `/y` itself
  -- pointed somewhere was refused, while `/x → /y` where only `/y` pointed
  -- somewhere was accepted and quietly made a chain of two.
  if v_to_path is not null and exists (
    select 1 from public.redirects r where r.from_path = v_to_path and r.is_enabled
  ) then
    raise exception 'The destination % is itself redirected; point at the final page',
      v_to_path using errcode = '22023';
  end if;

  -- Then walk from the destination anyway, for the case where the destination is
  -- final but the *source* is already in the middle of a chain that leads back to
  -- it. This is the loop a two-step swap produces.
  v_walk := v_to_path;
  while v_walk is not null and v_guard < 20 loop
    if v_walk = v_from then
      raise exception
        'That would make a loop: % already leads back to %. A visitor would be sent round forever.',
        v_to, v_from
        using errcode = '22023';
    end if;
    select r.to_path into v_walk from public.redirects r
     where r.from_path = v_walk and r.is_enabled;
    v_guard := v_guard + 1;
  end loop;

  if v_guard >= 20 then
    raise exception
      'That destination is already in a chain longer than twenty steps. Fix the chain before adding to it.'
      using errcode = '22023';
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

revoke all on function public.set_redirect(text, text, smallint, text) from public, anon;
grant execute on function public.set_redirect(text, text, smallint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Coverage
-- ---------------------------------------------------------------------------
-- A page that matters and has no override is a page whose title Google will write
-- for itself. This lists them: paths drawn from sitemap sections, joined against
-- what is set, and marked with what is wrong rather than only with what is missing.
create or replace function public.seo_coverage(
  p_limit integer default 100,
  p_only_problems boolean default true
)
returns table (
  path          text,
  has_override  boolean,
  problem       text,
  title_length  integer,
  description_length integer,
  canonical     text,
  updated_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- The function's own output column is called `path`, and so is a column in the
-- query below. Without this pragma an unqualified reference raises
-- "column reference \"path\" is ambiguous". It must sit inside the body: a pragma
-- in the header is a syntax error at the `#`.
#variable_conflict use_column
begin
  perform bsdc.require_permission('seo.manage');
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'A coverage page holds between 1 and 500 paths' using errcode = '22023';
  end if;

  return query
  with wanted as (
    -- Real pages from the same sources the sitemap uses. `sitemap_sections` was the
    -- obvious thing to lean on and cannot be: it returns a *count* per section, not
    -- the paths, so joining to it would have compared overrides against the word
    -- "posts". The union below is the one 0032 builds inside `sitemap_urls`; it is
    -- repeated rather than shared because that function's own output is filtered by
    -- page size in a way this read must not inherit.
    select '/' || p.slug as path
      from public.posts p
     where p.status = 'published' and p.visibility = 'public'
    union
    select '/products/' || pd.slug
      from public.products pd
     where pd.status in ('active', 'out_of_stock')
    union
    select '/courses/' || c.slug
      from public.courses c
     where c.status = 'published'
    union
    select '/v/' || v.slug
      from public.mk_vendors v
     where v.status = 'active'
  ),
  normalised as (
    select distinct bsdc.normalise_path(path) as path from wanted
  ),
  judged as (
    select
      w.path as path,
      o.path is not null as has_override,
      case
        when o.path is null then 'no override: the title and description are the fallback'
        when btrim(o.title) = '' then 'no title: the page has nothing to offer a search result'
        when char_length(o.title) > 60 then 'title too long: it will be cut off around 60 characters'
        when btrim(o.description) = '' then 'no description: the engine will invent one'
        when char_length(o.description) > 160 then 'description too long: it will be cut off around 160'
        when o.robots = 'noindex' then 'noindex: this page is deliberately hidden, which is fine if intended'
        when o.updated_at < now() - interval '365 days' then 'stale: untouched for over a year'
        else null
      end as problem,
      coalesce(char_length(o.title), 0) as title_length,
      coalesce(char_length(o.description), 0) as description_length,
      coalesce(o.canonical, '') as canonical,
      o.updated_at
    from normalised w
    left join public.seo_overrides o on o.path = w.path
  )
  -- The output column is called `path`, and so is `wanted.path`; with the
  -- default `#variable_conflict` an unqualified reference is ambiguous and the
  -- whole read fails. Every column below is qualified, and the record alias is `j`
  -- rather than the function's own name.
  select j.path, j.has_override, j.problem, j.title_length, j.description_length,
         j.canonical, j.updated_at
    from judged j
   where (not p_only_problems) or j.problem is not null
   -- Problems first, then the longest-standing, so the top of the list is the
   -- worst of it rather than whatever sorts alphabetically.
   order by (j.problem is null), j.updated_at nulls first, j.path
   limit p_limit;
end;
$$;

revoke all on function public.seo_coverage(integer, boolean) from public, anon;
grant execute on function public.seo_coverage(integer, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The 404 queue, for the console
-- ---------------------------------------------------------------------------
create or replace function public.redirect_404_sources(p_limit integer default 50)
returns table (
  path       text,
  hits       bigint,
  first_seen timestamptz,
  last_seen  timestamptz,
  -- Whether a redirect already covers it, which happens when somebody added one
  -- and this row was never marked resolved.
  covered_by text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('seo.manage');
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'A 404 page holds between 1 and 500 paths' using errcode = '22023';
  end if;

  return query
    select h.path, h.hits, h.first_seen, h.last_seen, r.to_path
      from public.seo_404_hits h
      left join public.redirects r on r.from_path = h.path and r.is_enabled
     where h.resolved_at is null
     order by h.hits desc, h.last_seen desc
     limit p_limit;
end;
$$;

revoke all on function public.redirect_404_sources(integer) from public, anon;
grant execute on function public.redirect_404_sources(integer) to authenticated, service_role;

-- Marking one dealt with, or bringing it back.
create or replace function public.resolve_missing_path(p_path text, p_redirect_to text default null)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_path text := bsdc.normalise_path(p_path);
begin
  perform bsdc.require_permission('seo.manage');

  -- Optionally make the redirect at the same time, because marking a 404 resolved
  -- without pointing it anywhere is how a queue gets emptied and the problem stays.
  if p_redirect_to is not null and btrim(p_redirect_to) <> '' then
    -- The cast is not decoration: `301` is an integer literal and an integer does
    -- not implicitly narrow to `smallint` in a function lookup, so an uncast call
    -- fails with "function does not exist".
    perform public.set_redirect(v_path, p_redirect_to, 301::smallint, 'added from the 404 queue');
  end if;

  update public.seo_404_hits
     set resolved_at = now(), resolved_by = bsdc.current_uid()
   where path = v_path;

  if not found then
    raise exception 'No 404 recorded for %', v_path using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.resolve_missing_path(text, text) from public, anon;
grant execute on function public.resolve_missing_path(text, text) to authenticated, service_role;
