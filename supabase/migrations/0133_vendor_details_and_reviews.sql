-- 0133: vendor details and reviews — the shop's public fact sheet.
--
-- A Foodpanda storefront answers five questions before a customer ever scrolls a
-- menu: what kind of shop is it, when is it open and when does it close, where
-- can it deliver and for how much, where is it on a map, and what have other
-- customers said about it. BSDC answered the first two in mk_vendor_page and
-- mk_list_vendors, the next two only in the vendor console, and the last one as
-- two numbers (rating, review_count) with no way to read the reviews themselves.
--
-- This migration completes the public surface without adding a new table:
-- reviews already existed (mk_reviews, one per delivered order), and every other
-- fact was already stored on mk_vendors. What was missing was a way to read them.
--
--   1. mk_vendor_reviews(slug, limit, offset) — a paginated, anonymous-readable
--      list of reviews for one shop, joined to the author's public profile so a
--      screen never has to make one query per review to show who wrote it.
--   2. mk_vendor_details(slug) — the same shape as mk_vendor_page plus the
--      delivery centre, the full weekly schedule, and a rating histogram, because
--      the Info tab should be one request, not four, and because a histogram
--      cannot be derived from an average alone.

-- ============================================================================
-- 1. Public, paginated reviews for a shop
-- ============================================================================

create or replace function public.mk_vendor_reviews(
  p_slug   text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor public.mk_vendors%rowtype;
  v_cap_limit integer;
  v_cap_offset integer;
begin
  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'shop not found' using errcode = 'P0002';
  end if;
  select * into v_vendor from public.mk_vendors where slug = btrim(p_slug);
  if not found then
    raise exception 'shop not found' using errcode = 'P0002';
  end if;

  -- A shop that is not listed is still a shop — its reviews are part of why it
  -- is or is not listed — so the read is not gated on credits or status. Only
  -- the existence of the vendor matters.

  v_cap_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cap_offset := greatest(coalesce(p_offset, 0), 0);

  return coalesce((
    select jsonb_build_object(
      'vendor_id', v_vendor.id,
      'vendor_slug', v_vendor.slug,
      'rating', coalesce((select round(avg(rating), 1) from public.mk_reviews where vendor_id = v_vendor.id), 0),
      'review_count', (select count(*)::int from public.mk_reviews where vendor_id = v_vendor.id),
      'reviews', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'rating', r.rating,
          'body', r.body,
          'created_at', r.created_at,
          'order_id', r.order_id,
          'customer', jsonb_build_object(
            'uid', p.uid,
            'display_name', coalesce(p.display_name, ''),
            'username', coalesce(p.username, ''),
            'avatar_url', coalesce(p.avatar_url, '')
          )
        ) order by r.created_at desc)
        from (
          select * from public.mk_reviews
          where vendor_id = v_vendor.id
          order by created_at desc
          limit v_cap_limit offset v_cap_offset
        ) r
        left join public.profiles p on p.uid = r.customer_uid
      ), '[]'::jsonb)
    )
  ), jsonb_build_object(
    'vendor_id', v_vendor.id,
    'vendor_slug', v_vendor.slug,
    'rating', 0,
    'review_count', 0,
    'reviews', '[]'::jsonb
  ));
end;
$$;

comment on function public.mk_vendor_reviews(text, integer, integer) is
  'Paginated reviews for one shop by slug. Anonymous-readable; a shop with no reviews still returns its rating and an empty list. Joined to profiles for display.';

-- ============================================================================
-- 2. Rich vendor details — one request for the Info tab
-- ============================================================================

create or replace function public.mk_vendor_details(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor public.mk_vendors%rowtype;
  v_delivery jsonb;
  v_schedule jsonb;
begin
  if p_slug is null or btrim(p_slug) = '' then
    return null;
  end if;
  select * into v_vendor from public.mk_vendors where slug = btrim(p_slug);
  if not found then
    return null;
  end if;

  v_delivery := bsdc.mk_delivery_json(v_vendor);
  v_schedule := bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule);

  return jsonb_build_object(
    'vendor', jsonb_build_object(
      'id', v_vendor.id,
      'slug', v_vendor.slug,
      'name', v_vendor.name,
      'vendor_type', v_vendor.vendor_type,
      'description', v_vendor.description,
      'logo_url', v_vendor.logo_url,
      'cover_url', v_vendor.cover_url,
      'place_label', v_vendor.place_label,
      'lat', v_vendor.lat,
      'lng', v_vendor.lng,
      'status', v_vendor.status,
      'created_at', v_vendor.created_at,
      'delivery', v_delivery,
      'schedule', v_schedule
    ),
    'rating', coalesce((select round(avg(rating), 1) from public.mk_reviews where vendor_id = v_vendor.id), 0),
    'review_count', (select count(*)::int from public.mk_reviews where vendor_id = v_vendor.id),
    'histogram', (
      select jsonb_build_object(
        '1', count(*) filter (where rating = 1),
        '2', count(*) filter (where rating = 2),
        '3', count(*) filter (where rating = 3),
        '4', count(*) filter (where rating = 4),
        '5', count(*) filter (where rating = 5)
      )
      from public.mk_reviews where vendor_id = v_vendor.id
    ),
    'recent_reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'rating', r.rating,
        'body', r.body,
        'created_at', r.created_at,
        'customer', jsonb_build_object(
          'uid', p.uid,
          'display_name', coalesce(p.display_name, ''),
          'username', coalesce(p.username, ''),
          'avatar_url', coalesce(p.avatar_url, '')
        )
      ) order by r.created_at desc)
      from (
        select * from public.mk_reviews
        where vendor_id = v_vendor.id
        order by created_at desc
        limit 5
      ) r
      left join public.profiles p on p.uid = r.customer_uid
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.mk_vendor_details(text) is
  'Rich vendor fact sheet for the Info tab: vendor row, delivery config, schedule, rating, histogram and 5 most recent reviews. One query, anonymous-readable.';

-- ============================================================================
-- 3. Grants — both read without sign-in, because a shop window is for passers-by
-- ============================================================================

revoke all on function public.mk_vendor_reviews(text, integer, integer) from public;
revoke all on function public.mk_vendor_details(text) from public;
grant execute on function public.mk_vendor_reviews(text, integer, integer) to anon, authenticated;
grant execute on function public.mk_vendor_details(text) to anon, authenticated;
