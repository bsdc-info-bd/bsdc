-- 0132: every picture a member uploads is one they can find again.
--
-- Uploading has always been half a feature. The bytes go to ImgBB, a row lands in
-- `media_assets`, and that row is then never shown to the person who made it. To put
-- a picture on a group cover a member retakes it; to answer a comment with the photo
-- they posted an hour ago they find it in their gallery app and upload it a second
-- time. The platform has been keeping a library and hiding it.
--
-- This migration makes the library a first-class thing: an owner-scoped read a browser
-- and a phone can page through, filter by what the picture was for, and search. Three
-- changes:
--
--   1. **purpose** — every upload already says what it is for (`MediaPurpose`, in the
--      shared contract, validated at the edge) and then throws that answer away at the
--      table. Storing it is what lets a gallery say "Covers" and "Chat" instead of
--      showing two thousand undifferentiated rectangles.
--
--   2. **`bsdc.media_references`** — one view enumerating every place a picture can
--      currently be living. This is the load-bearing piece, and it exists because the
--      answer used to be written inline in one function, as three `not exists`
--      clauses over `post_media`, `messages`, `comments` and `profiles`.
--
--      That same predicate is how the upload sweeper decides a file is *orphaned* and
--      should be deleted at the host, which is why it has to be complete — and it is
--      not. A picture whose only home is a group's cover, an event cover, a page
--      avatar, a project cover, a course cover, a conversation avatar, an ad
--      creative, a marketplace shop's logo, a product image, or the copy printed on a
--      delivered order line was invisible to it. ImgBB holds a delete token for every
--      picture this platform hosts, so one day after upload the sweeper would ask the
--      host to remove a file people were still looking at. The order line is the worst
--      case: it is the only copy of what a customer was shown, denormalised on
--      purpose so nothing else can rewrite it.
--
--      So the view is not a convenience for the gallery. The gallery and the sweeper
--      read one definition, which means a badge that says "in use" cannot be wrong in
--      the one direction that costs somebody a photograph — and the next surface that
--      stores a picture has exactly one arm to add.
--
--   3. `my_gallery` pages that library, `record_media_asset` keeps the purpose it was
--      handed, and `my_media_assets` — the settings screen that already existed —
--      keeps its shape with an honest `in_use`.
--
-- Deliberately absent: no new upload path, no new host, no re-download when a picture
-- is picked again. Reuse means the new surface points at the asset row that already
-- exists, so the library does not grow, the quota is not spent twice, and the file
-- keeps one home.

-- ------------------------------------------------------------------ provenance --
--
-- The list below is `MediaPurpose` in main-site/src/lib/storage/media-contract.ts
-- plus 'other'. A check constraint rather than an enum type, because both clients
-- already pass the value as text and an enum would make every future purpose a
-- migration; the check is the same guard without a cast at the call site.
--
-- 'other' is a real value, not a dumping ground: it is what a picture uploaded before
-- this migration, or by a caller that has not been taught the new argument, is allowed
-- to be. `not null default 'other'` with a check is the only shape that lets an
-- existing deployment gain this column without backfilling anything.

alter table public.media_assets
  add column if not exists purpose text not null default 'other';

comment on column public.media_assets.purpose is
  'What the member was uploading it for, from MediaPurpose in the shared contract. '
  'Drives the gallery filters and nothing else: provenance, not permission.';

alter table public.media_assets
  drop constraint if exists media_assets_purpose_check;
alter table public.media_assets
  add constraint media_assets_purpose_check check (
    purpose in (
      'avatar',
      'cover',
      'project-cover',
      'project-image',
      'post-image',
      'comment-image',
      'chat-image',
      'product-image',
      'ad-creative',
      'other'
    )
  );

-- 'chat-image' is new, and the split is not cosmetic. The web composer was passing
-- 'comment-image' for a picture sent in a conversation because the union had nothing
-- else for it, so chat pictures were filed under comments. Rows already written stay
-- as they are — relabelling them would be a guess about a surface that had no way to
-- say otherwise.

-- `media_write_self` (0002) checks only that the row belongs to the writer, so the
-- column a client may put in a `media_assets` INSERT has to be named: without this,
-- the fallback path in `recordMediaAsset` fails with "column purpose does not exist"
-- on exactly the deployments that need it, and the RPC-only path hides it.
grant insert (purpose) on public.media_assets to authenticated;

-- And the two browser reads that name their columns need to be able to read this
-- one, or a storage list cannot show what a picture was for.
grant select (purpose) on public.media_assets to anon, authenticated;

-- Both gallery reads order owner-first and newest-first, and neither wants a purged
-- row, so the purge flag is part of the key rather than a filter applied afterwards.
create index if not exists media_assets_owner_gallery_idx
  on public.media_assets (owner_uid, created_at desc, id desc)
  where purged_at is null;
create index if not exists media_assets_owner_purpose_idx
  on public.media_assets (owner_uid, purpose, created_at desc, id desc)
  where purged_at is null;

-- ----------------------------------------------------- where a picture can live --
--
-- One row per reference, in two key columns: `asset_id` for the surfaces that link the
-- asset by id, `url` for the ones that hold the address, and `surface` so a caller can
-- name the place instead of reporting a bare count.
--
-- Every arm carries `<> ''`, because each of those columns is `not null default ''`
-- and an empty string means "no picture here". Matching on it would make every
-- unattached row look beloved.
--
-- A plain view, readable only through functions that run as its owner. It is not
-- granted to `anon` or `authenticated` on purpose: it spans other people's messages
-- and comments, and handing it out would let a member count how often a stranger's
-- picture is displayed.
create or replace view bsdc.media_references as
  -- Posts, by asset id — the only image link in the schema that is a real foreign key.
  select pm.media_id as asset_id, null::text as url, 'post'::text as surface
    from public.post_media pm
  union all
  -- A post's cover is a url on the post itself, not a post_media row.
  select null, p.cover_url, 'post'
    from public.posts p where p.cover_url <> ''
  union all
  -- Chat, and both halves of a comment's picture.
  select null, m.media_url, 'chat'
    from public.messages m where m.media_url <> ''
  union all
  select null, c.image_url, 'comment'
    from public.comments c where c.image_url <> ''
  union all
  select null, c.image_thumb_url, 'comment'
    from public.comments c where c.image_thumb_url <> ''
  union all
  -- The member's own identity pictures.
  select null, pr.avatar_url, 'avatar'
    from public.profiles pr where pr.avatar_url <> ''
  union all
  select null, pr.cover_url, 'cover'
    from public.profiles pr where pr.cover_url <> ''
  union all
  -- Everything else that carries a picture a member uploaded: communities, pages,
  -- events, projects, courses, and a group conversation's avatar.
  select null, g.avatar_url, 'community'
    from public.groups g where g.avatar_url <> ''
  union all
  select null, g.cover_url, 'community'
    from public.groups g where g.cover_url <> ''
  union all
  select null, pg.avatar_url, 'page'
    from public.pages pg where pg.avatar_url <> ''
  union all
  select null, pg.cover_url, 'page'
    from public.pages pg where pg.cover_url <> ''
  union all
  select null, e.cover_url, 'event'
    from public.events e where e.cover_url <> ''
  union all
  select null, pj.cover_url, 'project'
    from public.projects pj where pj.cover_url <> ''
  union all
  select null, co.cover_url, 'course'
    from public.courses co where co.cover_url <> ''
  union all
  select null, cv.avatar_url, 'conversation'
    from public.conversations cv where cv.avatar_url <> ''
  union all
  -- An advertising creative, in both sizes of it.
  select null, ac.image_url, 'ad'
    from public.ad_creatives ac where ac.image_url <> ''
  union all
  select null, ac.thumb_url, 'ad'
    from public.ad_creatives ac where ac.thumb_url <> ''
  union all
  -- The marketplace: a shop's two pictures, and every product's array of them.
  select null, v.logo_url, 'shop'
    from public.mk_vendors v where v.logo_url <> ''
  union all
  select null, v.cover_url, 'shop'
    from public.mk_vendors v where v.cover_url <> ''
  union all
  select null, img, 'product'
    from public.mk_products pr cross join lateral unnest(pr.images) as img
    where img <> ''
  union all
  -- The copy an order line keeps for itself. This is the reference that outlives
  -- everything else here: the product may be deleted, the shop may close, and the
  -- customer is still entitled to see what they ordered.
  select null, oi.image_url, 'order'
    from public.mk_order_items oi where oi.image_url <> ''
  union all
  -- The pre-marketplace shop tables, which still hold rows in production.
  select null, img, 'product'
    from public.products lp cross join lateral unnest(lp.images) as img
    where img <> ''
  union all
  select null, ls.logo_url, 'shop'
    from public.shops ls where ls.logo_url <> ''
  union all
  -- An Open Graph image staff set for a route.
  select null, so.image_url, 'seo'
    from public.seo_overrides so where so.image_url <> '';

comment on view bsdc.media_references is
  'Every reference in the schema to a hosted picture, as (asset_id, url, surface). '
  'The upload sweeper reads it to decide whether a file is still being looked at; the '
  'gallery reads it to say where. Add an arm here when a new surface stores a picture.';

revoke all on bsdc.media_references from public, anon, authenticated;

-- The lookups the view is queried by. `post_media.media_id` and `messages.media_url`
-- are already indexed (0073, 0122); these are the ones that were being seq-scanned
-- per candidate row on tables where a picture is the exception rather than the rule.
create index if not exists comments_image_url_idx
  on public.comments (image_url) where image_url <> '';
create index if not exists comments_image_thumb_url_idx
  on public.comments (image_thumb_url) where image_thumb_url <> '';
create index if not exists posts_cover_url_idx
  on public.posts (cover_url) where cover_url <> '';
create index if not exists profiles_avatar_url_idx
  on public.profiles (avatar_url) where avatar_url <> '';
create index if not exists profiles_cover_url_idx
  on public.profiles (cover_url) where cover_url <> '';
create index if not exists mk_order_items_image_url_idx
  on public.mk_order_items (image_url) where image_url <> '';

-- ------------------------------------------------------- what gets uploaded -----
--
-- The purpose the caller already knew. The old ten-argument form is dropped rather
-- than left beside the new one: two candidates that accept the same JSON body make
-- PostgREST answer "function is not unique", and the browser sends exactly that body.
drop function if exists public.record_media_asset(
  text, text, text, text, text, integer, integer, bigint, text, timestamptz
);

create or replace function public.record_media_asset(
  p_provider     text,
  p_kind         text,
  p_url          text,
  p_thumb_url    text default '',
  p_delete_token text default '',
  p_width        integer default null,
  p_height       integer default null,
  p_bytes        bigint default 0,
  p_mime_type    text default '',
  p_expires_at   timestamptz default null,
  p_purpose      text default 'other'
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_id    uuid;
  v_url   text := btrim(coalesce(p_url, ''));
  v_bytes bigint := greatest(coalesce(p_bytes, 0), 0);
  v_purpose text := coalesce(nullif(btrim(coalesce(p_purpose, '')), ''), 'other');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if char_length(v_url) < 8 or v_url !~ '^https://' then
    raise exception 'a picture has to be an https address' using errcode = '22023';
  end if;

  -- The three rules below are 0083's, restated here rather than improved: this
  -- function replaced 0083's body, and a rewrite that quietly widens what it
  -- accepts would take the platform back to hosting a file it cannot delete. Only
  -- ImgBB is a destination; only an image is a kind; and the address has to be on
  -- the host the delete token belongs to, or the sweeper holds a capability for a
  -- file ImgBB never had.
  if p_provider is distinct from 'imgbb' then
    raise exception 'unknown media provider' using errcode = '22023';
  end if;

  if p_kind is distinct from 'image' then
    raise exception 'unknown media kind' using errcode = '22023';
  end if;

  if bsdc.media_host_of(v_url) <> 'imgbb' then
    raise exception 'a picture has to be hosted on imgbb' using errcode = '22023';
  end if;

  -- The column's own list, checked here so a mistyped purpose comes back as a code
  -- the client can show rather than as a constraint failure nobody attributes.
  if v_purpose not in (
    'avatar', 'cover', 'project-cover', 'project-image', 'post-image',
    'comment-image', 'chat-image', 'product-image', 'ad-creative', 'other'
  ) then
    raise exception 'unknown media purpose' using errcode = '22023';
  end if;

  -- A lifetime in the past would be a row that is born expired; a lifetime further
  -- out than a year is a number somebody mistyped.
  if p_expires_at is not null
     and (p_expires_at <= now() or p_expires_at > now() + interval '400 days') then
    raise exception 'an expiry has to be in the future and inside a year'
      using errcode = '22023';
  end if;

  -- A per-member quota, enforced where it cannot be skipped. The count is of live
  -- rows, so a member who cleans up can upload again immediately — and so does
  -- reusing a picture from the gallery cost nothing, because it adds no row.
  if (
    select count(*) from public.media_assets a
    where a.owner_uid = v_uid and a.purged_at is null
  ) >= 2000 then
    raise exception 'this account has reached its picture limit'
      using errcode = '54000';
  end if;

-- The thumb follows the original: an empty one is stored as the address itself, so
-- every consumer that renders `thumb_url` blindly renders a picture.
  insert into public.media_assets (
    owner_uid, provider, kind, url, thumb_url, delete_token,
    width, height, bytes, mime_type, expires_at, purpose
  )
  values (
    v_uid,
    p_provider::bsdc_media_provider,
    p_kind::bsdc_media_kind,
    v_url,
    coalesce(nullif(btrim(p_thumb_url), ''), v_url),
    coalesce(p_delete_token, ''),
    p_width,
    p_height,
    v_bytes,
    coalesce(p_mime_type, ''),
    p_expires_at,
    v_purpose
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_media_asset(
  text, text, text, text, text, integer, integer, bigint, text, timestamptz, text
) is
  'Records one hosted upload against the member who made it, keeping the purpose the '
  'edge was already told. The only write path for media_assets.';

revoke all on function public.record_media_asset(
  text, text, text, text, text, integer, integer, bigint, text, timestamptz, text
) from public;
grant execute on function public.record_media_asset(
  text, text, text, text, text, integer, integer, bigint, text, timestamptz, text
) to authenticated;

-- ------------------------------------------------------------------- the gallery --
--
-- `my_media_assets` (0073) answers "what have I uploaded, and is it about to expire",
-- for a settings screen. A gallery is a different question — page it, filter it,
-- search it, and tell me whether picking this again picks something real — so it gets
-- its own function rather than a fourth optional argument on a call the settings
-- screen already makes.
--
-- Keyset paging on (created_at, id) rather than OFFSET: a member with two thousand
-- pictures scrolls, and an offset lets a new upload shuffle the next page. The cursor
-- is a pair because a row comparison needs both halves of the sort key.
--
-- The search is inside the page, not after it. Filtering a page of 60 down to whatever
-- matched would look like "no results" for the ordinary case of a member whose
-- matching picture is the 300th newest.
create or replace function public.my_gallery(
  p_limit     integer     default 60,
  p_before    timestamptz default null,
  p_before_id uuid        default null,
  p_purpose   text        default 'all',
  p_query     text        default ''
)
returns table (
  id         uuid,
  url        text,
  thumb_url  text,
  purpose    text,
  width      integer,
  height     integer,
  bytes      bigint,
  mime_type  text,
  created_at timestamptz,
  expires_at timestamptz,
  in_use     boolean,
  uses       integer,
  surfaces   text[],
  alt_text   text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 200));
  v_need  text := lower(btrim(coalesce(p_query, '')));
  v_want  text := lower(btrim(coalesce(p_purpose, 'all')));
begin
  if bsdc.current_uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- A cursor is a pair or it is nothing. Half of one would compare each row against
  -- its own timestamp and answer "no page at all", and the client would keep asking
  -- for the same page forever; a member would see a library that is empty.
  if (p_before is null) <> (p_before_id is null) then
    raise exception 'a cursor needs both its timestamp and its id' using errcode = '22023';
  end if;

  -- Same list the column checks. Refusing here, with a name, is what lets a client
  -- show "no such filter" instead of an empty grid that looks like no pictures.
  if v_want <> 'all' and v_want not in (
    'avatar', 'cover', 'project-cover', 'project-image', 'post-image',
    'comment-image', 'chat-image', 'product-image', 'ad-creative', 'other'
  ) then
    raise exception 'unknown gallery filter' using errcode = '22023';
  end if;

  return query
  with wanted as (
    -- What the member asked for, cut before the page is taken: the filter, the search,
    -- and where in the library the caller already is.
    select a.id, a.url, a.thumb_url, a.purpose, a.width, a.height, a.bytes,
           a.mime_type, a.created_at, a.expires_at
      from public.media_assets a
     where a.owner_uid = bsdc.current_uid()
       -- A purged row is a record, not a picture: the host has removed the file, and
       -- offering it would put a broken tile in front of somebody choosing one.
       and a.purged_at is null
       and (v_want = 'all' or a.purpose = v_want)
       and (
         p_before is null
         or (a.created_at, a.id) < (p_before, p_before_id)
       )
       and (
         v_need = ''
         or a.purpose ilike '%' || v_need || '%'
         or a.url ilike '%' || v_need || '%'
         -- Dates as words, because that is how somebody remembers a photograph:
         -- "the one from Chaitra" or "last December". Whitespace is collapsed so
         -- 'January 2026' matches the padded output of to_char.
         or regexp_replace(
              to_char(a.created_at at time zone 'Asia/Dhaka', 'Month YYYY'), '\s+', ' ', 'g'
            ) ilike '%' || v_need || '%'
         or exists (
           select 1 from public.post_media pm
            where pm.media_id = a.id and lower(pm.alt_text) ilike '%' || v_need || '%'
         )
         or exists (
           select 1 from public.comments c
            where c.image_url = a.url and lower(c.image_alt) ilike '%' || v_need || '%'
         )
       )
     order by a.created_at desc, a.id desc
     limit v_limit
  ),
  hits as (
    -- Reference counts gathered once for the page rather than once per tile: the arms
    -- that unnest an image array cannot answer an index probe, and sixty of those per
    -- page would make a gallery slower than the upload it is saving.
    select r.asset_id::text as asset_key, r.surface
      from bsdc.media_references r
     where r.asset_id is not null
       and r.asset_id::text in (select w.id::text from wanted w)
     union all
    select r2.url, r2.surface
      from bsdc.media_references r2
     where r2.url is not null
       and r2.url in (select w.url from wanted w)
  ),
  counted as (
    select h.asset_key,
           count(*)::integer as uses,
           array_agg(distinct h.surface order by h.surface) as surfaces
      from hits h
     group by h.asset_key
  )
  select w.id,
         w.url,
         w.thumb_url,
         w.purpose,
         w.width,
         w.height,
         w.bytes,
         w.mime_type,
         w.created_at,
         w.expires_at,
         coalesce(ci.uses, 0) + coalesce(cu.uses, 0) > 0,
         coalesce(ci.uses, 0) + coalesce(cu.uses, 0),
         -- Merged here rather than concatenated by a client, so "where is this used"
         -- has one answer in every app.
         coalesce(
           (
             select array_agg(distinct s order by s) from (
               select unnest(ci.surfaces) as s where ci.surfaces is not null
               union all
               select unnest(cu.surfaces) as s where cu.surfaces is not null
             ) u
           ),
           '{}'
         ),
         -- What the member called the picture when they posted it, if they called it
         -- anything. It is shown under a tile and searched above, so the library can
         -- be walked by memory ("the tea stall one") and not only by dates.
         coalesce(
           (
             select nullif(pm.alt_text, '')
               from public.post_media pm
              where pm.media_id = w.id and pm.alt_text <> ''
              order by pm.post_id
              limit 1
           ),
           (
             select nullif(c.image_alt, '')
               from public.comments c
              where c.image_url = w.url and c.image_alt <> ''
              order by c.created_at desc
              limit 1
           ),
           ''
         )
    from wanted w
    left join counted ci on ci.asset_key = w.id::text
    left join counted cu on cu.asset_key = w.url
    order by w.created_at desc, w.id desc;
end;
$$;

comment on function public.my_gallery(integer, timestamptz, uuid, text, text) is
  'One page of the member''s own uploaded pictures, newest first, filtered by purpose '
  'or search, with where each one is currently used. Owner-scoped by the caller''s '
  'token; nothing here says anything about anybody else.';

revoke all on function public.my_gallery(integer, timestamptz, uuid, text, text)
  from public, anon;
grant execute on function public.my_gallery(integer, timestamptz, uuid, text, text)
  to authenticated;

-- ------------------------------------------------------------------- picking it
--
-- A picked picture has to arrive at a write path as an *id*, not as a URL that
-- "My Pictures" happens to have handed to it.
--
-- Which of the platform's image columns already enforce that is an honest list, and
-- it is shorter than one would like:
--
--   * a post's pictures go through `post_media`, whose `media_id` is a foreign key
--     to `media_assets` — a pick cannot be forged there at all;
--   * a comment's picture is checked by `bsdc.prepare_comment` (0120), which refuses
--     any URL that is not a live image row owned by the commenter — a pick satisfies
--     it by construction, because the library only ever shows rows owned by the
--     member reading it;
--   * a chat message's `media_url` is free text. Nothing has ever checked it, and
--     the send path is the one that also dedupes by hashing its own arguments, so an
--     id has to travel *through* that hash to be worth anything.
--
-- So `bsdc.media_asset_for_pick` is the resolver, and `send_message_once` grows an
-- id. The other free-text columns (`posts.cover_url`, a shop logo, a product image,
-- an ad creative) are unchanged by this migration: the library hands a member the
-- address from their own row, and the row is the member's because the read that
-- produced it was owner-scoped. Making those id-only is a change to each of their
-- write paths, which is a different migration with its own tests — and a pick there
-- is no weaker than the upload it replaces, which was always the bar.
create or replace function bsdc.media_asset_for_pick(p_id uuid)
returns table (
  url       text,
  thumb_url text,
  width     integer,
  height    integer,
  mime_type text,
  purpose   text,
  name      text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    a.url,
    -- A thumbnail the host never made is the full picture, not an empty string: a
    -- client that renders `thumb_url` blindly would show a broken tile in the very
    -- conversation the picture was just sent to.
    case when a.thumb_url = '' then a.url else a.thumb_url end,
    a.width,
    a.height,
    a.mime_type,
    a.purpose,
    -- The name a chat attachment shows, taken from the address the platform wrote
    -- when the upload happened — not from a file name on a member's device, which
    -- would be a second, unrelated name for the same picture every time it is
    -- reused. The last path segment is the file; ImgBB hands out an id with no
    -- extension about as often as a name with one, so the type fills the gap.
    case
      when a.url ~ '/[^/]+\.[a-z0-9]{2,5}$'
        then (regexp_match(a.url, '/([^/]+)$'))[1]
      else 'picture.' || coalesce(nullif(split_part(a.mime_type, '/', 2), ''), 'webp')
    end
  from public.media_assets a
  where a.id = p_id
    -- The owner test, in the one place a pick can be checked, and stated as a row
    -- that does not exist rather than as a refusal: this function is also called
    -- from a list a member might refresh, and a hard error there would be a dialog
    -- that will not open because one picture aged out from underneath it.
    and a.owner_uid = bsdc.current_uid()
    and a.purged_at is null
    and a.kind = 'image';
$$;

comment on function bsdc.media_asset_for_pick(uuid) is
  'The row behind a gallery pick, for the member who owns it; no row for anybody '
  'else, for a purged picture, or for a non-image. Never accepts a URL.';

revoke all on function bsdc.media_asset_for_pick(uuid) from public, anon;
grant execute on function bsdc.media_asset_for_pick(uuid) to authenticated;

-- Chat, then, with the id threaded through the retry guard.
-- The nine-argument form replaces the eight, and the old one goes first: two
-- candidates under one name make PostgREST answer "function is not unique" to every
-- caller, including the ones that never heard of a library.
drop function if exists public.send_message_once(
  uuid, uuid, text, bsdc_message_kind, text, text, text, uuid
);

create or replace function public.send_message_once(
  p_conversation_id uuid,
  p_client_id       uuid,
  p_body            text,
  p_kind            bsdc_message_kind default 'text',
  p_media_url       text default '',
  p_media_name      text default '',
  p_code_language   text default '',
  p_reply_to        uuid default null,
  p_media_asset     uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_hash    bytea;
  v_existing bsdc.message_send_requests%rowtype;
  v_message public.messages%rowtype;
  v_media_url   text := coalesce(p_media_url, '');
  v_media_name  text := coalesce(p_media_name, '');
  v_picked      record;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'message request key is required' using errcode = '22023';
  end if;

  -- A pick replaces the two strings with what the member's own row says, before the
  -- hash is computed and before the row is written. Resolving it here rather than
  -- trusting the caller is the entire point: the id is the only thing a client needs
  -- to know, and a member cannot send a picture that is not theirs.
  if p_media_asset is not null then
    select * into v_picked from bsdc.media_asset_for_pick(p_media_asset);
    if not found then
      raise exception 'that picture is not in your library' using errcode = '22023';
    end if;
    v_media_url := v_picked.url;
    if v_media_name = '' then
      v_media_name := v_picked.name;
    end if;
  end if;

  if not bsdc.is_conversation_member(p_conversation_id, v_uid) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;

  v_hash := extensions.digest(
    convert_to(jsonb_build_array(p_conversation_id, coalesce(p_body, ''), p_kind,
      v_media_url, v_media_name,
      coalesce(p_code_language, ''), p_reply_to, p_media_asset)::text, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(v_uid || ':' || p_client_id::text, 0));
  select * into v_existing from bsdc.message_send_requests
    where sender_uid = v_uid and client_id = p_client_id;
  if found then
    if v_existing.conversation_id <> p_conversation_id or v_existing.request_hash <> v_hash then
      raise exception 'message request key already used for different content' using errcode = '22023';
    end if;
    if v_existing.message_id is null then
      raise exception 'previously sent message is no longer available' using errcode = '22023';
    end if;
    select * into strict v_message from public.messages where id = v_existing.message_id;
    if v_message.client_id is null then
      update public.messages set client_id = p_client_id
        where id = v_message.id returning * into v_message;
    end if;
    return v_message;
  end if;

  v_message := public.send_message(p_conversation_id, p_body, p_kind, v_media_url,
                                   v_media_name, p_code_language, p_reply_to);
  update public.messages set client_id = p_client_id
    where id = v_message.id returning * into v_message;
  insert into bsdc.message_send_requests (sender_uid, client_id, conversation_id, message_id, request_hash)
    values (v_uid, p_client_id, p_conversation_id, v_message.id, v_hash);
  return v_message;
end;
$$;

revoke all on function public.send_message_once(
  uuid, uuid, text, bsdc_message_kind, text, text, text, uuid, uuid
) from public, anon;
grant execute on function public.send_message_once(
  uuid, uuid, text, bsdc_message_kind, text, text, text, uuid, uuid
) to authenticated;

-- ------------------------------------------------------------------ what to purge
--
-- The contract of this function is unchanged and every safety clause in it is kept
-- exactly as 0073 and 0120 wrote it — the one-day grace, the delete-token
-- requirement, the host check — because each of those is a bug somebody already paid
-- for. What changes is `unmentioned`: it stops being three hardcoded tables and
-- becomes the view, which is the complete answer.
--
-- Written as two `not exists` against the view rather than one against a materialised
-- CTE, so the planner pushes each half into the arms and can use the index on the far
-- side of an `or`-free predicate.
create or replace function public.media_pending_purge(
  p_secret text,
  p_limit  integer default 100
)
returns table (
  id           uuid,
  owner_uid    text,
  provider     text,
  url          text,
  delete_token text,
  reason       text,
  expires_at   timestamptz,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 1000));
begin
  if not bsdc.push_secret_matches(p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with candidate as (
    select
      a.id,
      a.owner_uid,
      a.provider::text as provider,
      a.url,
      a.delete_token,
      a.expires_at,
      a.created_at,
      case
        when a.expires_at is not null and a.expires_at <= now() then 'expired'
        else 'orphaned'
      end as reason,
      not exists (select 1 from bsdc.media_references r where r.asset_id = a.id)
        and not exists (select 1 from bsdc.media_references r2 where r2.url = a.url)
        as unmentioned
    from public.media_assets a
    where a.purged_at is null
      and a.purge_requested_at is null
      and a.delete_token <> ''
      and bsdc.media_host_of(a.url) = a.provider::text
  )
  select
    c.id, c.owner_uid, c.provider, c.url, c.delete_token, c.reason,
    c.expires_at, c.created_at
  from candidate c
  where (
    c.reason = 'expired'
    or (c.reason = 'orphaned' and c.unmentioned and now() - c.created_at > interval '1 day')
  )
  order by c.expires_at nulls last, c.created_at
  limit v_limit;
end;
$$;

revoke all on function public.media_pending_purge(text, integer) from public;
grant execute on function public.media_pending_purge(text, integer) to service_role;

-- The settings screen keeps its columns and gains an honest `in_use`, read from the
-- same view, so the two reads cannot disagree about whether a picture is being looked
-- at. Before this, a member looking at their own storage list saw "unused" next to
-- the avatar they were wearing.
create or replace function public.my_media_assets(p_limit integer default 60)
returns table (
  id         uuid,
  url        text,
  thumb_url  text,
  kind       text,
  provider   text,
  bytes      bigint,
  created_at timestamptz,
  expires_at timestamptz,
  in_use     boolean
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    a.id,
    case when a.purged_at is null then a.url else '' end,
    case when a.purged_at is null then a.thumb_url else '' end,
    a.kind::text,
    a.provider::text,
    a.bytes,
    a.created_at,
    a.expires_at,
    exists (select 1 from bsdc.media_references r where r.asset_id = a.id)
      or exists (select 1 from bsdc.media_references r2 where r2.url = a.url)
  from public.media_assets a
  where a.owner_uid = bsdc.current_uid()
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

revoke all on function public.my_media_assets(integer) from public;
grant execute on function public.my_media_assets(integer) to authenticated;
