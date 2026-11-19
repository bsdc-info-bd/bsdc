-- 0120 — a comment can carry a picture.
--
-- The feed has accepted photographs since the composer was written, and the
-- upload edge has understood a `comment-image` purpose for longer than that: the
-- purpose is in `MEDIA_PURPOSES`, it has a compression ratio of its own, and
-- `chooseProvider` answers for it. The only thing missing was a place to put the
-- answer, so a member answering a question about a broken phone had to describe
-- the crack in Bangla prose while the browser that produced it could have shown
-- every reader the picture in 40 kB.
--
-- One picture per comment, and it is stored denormalised — `image_url` and the
-- three facts a layout needs to reserve the right space for it — rather than in
-- a join table. A comment thread is the hottest read in the product (500 rows in
-- one request, then shaped into a tree), and a second join there is a cost paid
-- by every reader of every thread to serve the small minority of comments that
-- have a picture. Nothing else about a comment changes.
--
-- Two rules make the column safe to join to the purger:
--
--   * the URL has to be one this member uploaded. A comment is a place a
--     stranger can write, and without this check it is a place a stranger can
--     make every reader of the thread fetch an arbitrary `https://` address —
--     with their IP, in their browser, on a page the platform vouched for.
--
--   * a comment counts as a reference when the upload sweeper asks what nothing
--     points at. `media_pending_purge` reads `post_media`, `messages` and the
--     profile columns; a picture attached only to a comment would have looked
--     orphaned, been deleted at ImgBB a day later, and left the comment showing
--     a broken-image icon with no way back. Extending that anti-join is the
--     other half of this migration and the reason the two belong together.

alter table public.comments
  add column if not exists image_url       text    not null default '',
  add column if not exists image_thumb_url text    not null default '',
  add column if not exists image_alt       text    not null default '',
  add column if not exists image_width     integer,
  add column if not exists image_height    integer;

comment on column public.comments.image_url is
  'The picture the member attached, or empty. Always an https address on a media host the platform uploaded to.';
comment on column public.comments.image_thumb_url is
  'ImgBB''s ~640px medium variant of the same picture, used for the inline thumbnail and for `srcset`.';
comment on column public.comments.image_alt is
  'What the picture is of, in the member''s own words. Empty when they did not say.';
comment on column public.comments.image_width is
  'Intrinsic width, so the thread can reserve the space before the bytes arrive.';
comment on column public.comments.image_height is
  'Intrinsic height, paired with `image_width`.';

-- A comment with a picture may have no words. A comment without one may not:
-- the original rule stays exactly as strict for the ordinary case.
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments drop constraint if exists comments_body_or_image;
alter table public.comments
  add constraint comments_body_or_image check (
    char_length(btrim(body)) between 1 and 4000
    or (char_length(btrim(body)) = 0 and image_url <> '')
  );

-- The address is rendered into an `img src` on every reader's device, so the
-- shape is enforced here rather than trusted from the browser.
alter table public.comments drop constraint if exists comments_image_https;
alter table public.comments
  add constraint comments_image_https check (
    (image_url = '' or image_url ~ '^https://[^[:space:]]+$')
    and (image_thumb_url = '' or image_thumb_url ~ '^https://[^[:space:]]+$')
  );

alter table public.comments drop constraint if exists comments_image_alt;
alter table public.comments
  add constraint comments_image_alt check (char_length(image_alt) <= 280);

-- Dimensions are a pair or not at all: one of them alone would make the layout
-- guess an aspect ratio, which is the shift this column exists to prevent.
alter table public.comments drop constraint if exists comments_image_size;
alter table public.comments
  add constraint comments_image_size check (
    (image_width is null) = (image_height is null)
    and (image_width  is null or image_width  between 1 and 20000)
    and (image_height is null or image_height between 1 and 20000)
  );

-- Which comments have a picture — the feed's "photos" filter, and cheap enough
-- to keep as a partial index rather than a scan of a hot table.
create index if not exists comments_with_image_idx
  on public.comments (post_id, created_at)
  where image_url <> '';

-- The picture has to be one this member uploaded, and still live. The client
-- sends the URL the upload endpoint returned; `record_media_asset` recorded the
-- owner, so the ownership is a fact the database already holds rather than a
-- claim the trigger takes on trust. A purged asset is refused too: its bytes are
-- gone from the host, and a comment pointing at it is a broken picture nobody
-- can repair.
--
-- This function is `security definer` for one reason: `public.media_assets` is
-- deliberately not readable by clients — the delete tokens live there — so a
-- caller-rights trigger would fail with "permission denied for table
-- media_assets" on every comment that has a picture. The body below reads
-- nothing but the row being inserted and one existence test, and it writes
-- nothing at all, so the elevated rights widen nothing a member can see.
create or replace function bsdc.prepare_comment()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_parent public.comments%rowtype;
  v_post   public.posts%rowtype;
  v_url    text := btrim(coalesce(new.image_url, ''));
begin
  select * into v_post from public.posts where id = new.post_id;
  if not found or v_post.status <> 'published' then
    raise exception 'post not available' using errcode = 'P0002';
  end if;
  if not v_post.allow_comments then
    raise exception 'comments are closed on this post' using errcode = '42501';
  end if;

  if new.parent_id is null then
    new.depth := 0;
    new.root_id := null;
  else
    select * into v_parent from public.comments where id = new.parent_id;
    if not found or v_parent.post_id <> new.post_id then
      raise exception 'parent comment does not belong to this post' using errcode = 'P0002';
    end if;
    -- Beyond three levels a reply joins its grandparent's thread rather than
    -- disappearing into an unreadable indent.
    new.depth := least(v_parent.depth + 1, 3);
    new.root_id := coalesce(v_parent.root_id, v_parent.id);
  end if;

  if v_url = '' then
    new.image_url := '';
    new.image_thumb_url := '';
    new.image_alt := '';
    new.image_width := null;
    new.image_height := null;
  else
    if not exists (
      select 1 from public.media_assets a
      where a.url = v_url
        and a.owner_uid = new.author_uid
        and a.purged_at is null
        and a.kind = 'image'
    ) then
      raise exception 'that picture was not uploaded by this member'
        using errcode = '42501';
    end if;
    new.image_url := v_url;
    -- The client may quote a variant; if it does not, the thumbnail is the
    -- original, which is correct if wasteful and never broken.
    if btrim(coalesce(new.image_thumb_url, '')) = '' then
      new.image_thumb_url := v_url;
    end if;
  end if;

  new.is_answer := false;
  return new;
end;
$$;

-- Same trigger, new body. Named here so a reader can see nothing else moved.
drop trigger if exists comments_prepare on public.comments;
create trigger comments_prepare before insert on public.comments
  for each row execute function bsdc.prepare_comment();

-- ------------------------------------------------- what nothing points at ---
-- The body of this function is 0073's, with one anti-join added: a picture a
-- comment shows is a picture in use. Everything else is unchanged, including
-- the one-day grace period and the rule that a row without a delete capability
-- is never returned.
create or replace function public.media_pending_purge(
  p_secret text,
  p_limit  integer default 100
)
returns table (
  id             uuid,
  owner_uid      text,
  provider       text,
  url            text,
  delete_token   text,
  reason         text,
  expires_at     timestamptz,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 400));
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
      not exists (select 1 from public.post_media pm where pm.media_id = a.id)
        and not exists (select 1 from public.messages m where m.media_url = a.url)
        and not exists (
          select 1 from public.comments c
          where c.image_url = a.url or c.image_thumb_url = a.url
        )
        and not exists (
          select 1 from public.profiles pr
          where pr.avatar_url = a.url or pr.cover_url = a.url
        ) as unmentioned
    from public.media_assets a
    where a.purged_at is null
      and a.purge_requested_at is null
      and a.delete_token <> ''
      and bsdc.media_host_of(a.url) = a.provider::text
  )
  select
    q.id, q.owner_uid, q.provider, q.url, q.delete_token, q.reason,
    q.expires_at, q.created_at
  from candidate q
  where (
    q.reason = 'expired'
    or (q.reason = 'orphaned' and q.unmentioned and now() - q.created_at > interval '1 day')
  )
  order by q.expires_at nulls last, q.created_at
  limit v_limit;
end;
$$;

revoke all on function public.media_pending_purge(text, integer) from public;
grant execute on function public.media_pending_purge(text, integer) to service_role;
