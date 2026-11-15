-- ---------------------------------------------------------------------------
-- 0108 — Shop delivery areas and charges, and admin-editable order packages.
--
--  * Each shop chooses where it delivers: all of Bangladesh, or a radius in whole
--    kilometres around a centre it picks on the map (default: its own pin).
--  * Each shop sets its own delivery charge between 0 and 150 taka (default 150).
--    mk_place_order uses the shop's charge; the platform-wide setting is no longer
--    the price a customer pays.
--  * Admins can read every credit package (10, 50, 100 orders) and edit its price
--    and status from the marketplace settings page.
-- ---------------------------------------------------------------------------

-- 1. Packages ---------------------------------------------------------------
-- The three packages stay 10, 50 and 100 orders. Their prices are edited by an
-- admin from the marketplace settings page (mk_admin_set_package).

create or replace function public.mk_admin_list_packages()
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('marketplace.settings');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', code, 'orders', orders, 'price_poisha', price_poisha, 'is_active', is_active
    ) order by sort)
      from public.mk_credit_packages
  ), '[]'::jsonb);
end;
$$;

-- 2. Delivery settings on the shop -----------------------------------------
alter table public.mk_vendors
  add column if not exists delivery_scope text not null default 'all_bd'
    check (delivery_scope in ('radius', 'all_bd')),
  add column if not exists delivery_radius_km integer not null default 5
    check (delivery_radius_km between 1 and 500),
  add column if not exists delivery_fee_poisha bigint not null default 15000
    check (delivery_fee_poisha between 0 and 15000),
  add column if not exists delivery_lat numeric(9, 6)
    check (delivery_lat is null or delivery_lat between 20.5 and 26.7),
  add column if not exists delivery_lng numeric(9, 6)
    check (delivery_lng is null or delivery_lng between 88.0 and 92.7);

-- Great-circle distance in kilometres (haversine).
create or replace function bsdc.mk_distance_km(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns numeric
language sql
immutable
as $$
  select (2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(((p_lat2 - p_lat1)::float8) / 2)), 2)
    + cos(radians(p_lat1::float8)) * cos(radians(p_lat2::float8))
      * power(sin(radians(((p_lng2 - p_lng1)::float8) / 2)), 2)
  ))))::numeric
$$;

-- The owner's delivery settings, for the vendor console.
create or replace function public.mk_vendor_delivery()
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_vendor public.mk_vendors%rowtype;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = bsdc.mk_require_uid();
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'scope', v_vendor.delivery_scope,
    'radius_km', v_vendor.delivery_radius_km,
    'fee_poisha', v_vendor.delivery_fee_poisha,
    'center_lat', coalesce(v_vendor.delivery_lat, v_vendor.lat),
    'center_lng', coalesce(v_vendor.delivery_lng, v_vendor.lng),
    'shop_lat', v_vendor.lat,
    'shop_lng', v_vendor.lng
  );
end;
$$;

-- Save the owner's delivery area and charge. The charge is in whole taka (0 to 150).
create or replace function public.mk_vendor_set_delivery(
  p_scope text, p_radius_km integer, p_fee_taka integer,
  p_center_lat numeric default null, p_center_lng numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_vendor public.mk_vendors%rowtype;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = bsdc.mk_require_uid() for update;
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  if p_scope not in ('radius', 'all_bd') then
    raise exception 'choose a delivery area' using errcode = '22023';
  end if;
  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 500 then
    raise exception 'the radius must be between 1 and 500 km' using errcode = '22023';
  end if;
  if p_fee_taka is null or p_fee_taka < 0 or p_fee_taka > 150 then
    raise exception 'the delivery charge must be between 0 and 150 taka' using errcode = '22023';
  end if;
  if (p_center_lat is null) <> (p_center_lng is null) then
    raise exception 'pin the centre of the delivery area' using errcode = '22023';
  end if;
  if p_center_lat is not null and not bsdc.mk_valid_bd_point(p_center_lat, p_center_lng) then
    raise exception 'the delivery centre must be inside Bangladesh' using errcode = '22023';
  end if;

  update public.mk_vendors
     set delivery_scope = p_scope,
         delivery_radius_km = p_radius_km,
         delivery_fee_poisha = p_fee_taka::bigint * 100,
         delivery_lat = p_center_lat,
         delivery_lng = p_center_lng,
         updated_at = now()
   where id = v_vendor.id;

  return jsonb_build_object(
    'scope', p_scope, 'radius_km', p_radius_km, 'fee_poisha', p_fee_taka::bigint * 100
  );
end;
$$;

-- 3. Replaced functions (CREATE OR REPLACE keeps their grants) -------------
create or replace function public.mk_place_order(
  p_vendor_id uuid,
  p_address   jsonb,
  p_items     jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid       text := bsdc.mk_require_uid();
  v_vendor    public.mk_vendors%rowtype;
  v_order_id  uuid;
  v_code      text;
  v_subtotal  bigint := 0;
  v_fee       bigint := 0;
  v_lat       numeric := nullif(p_address ->> 'lat', '')::numeric;
  v_lng       numeric := nullif(p_address ->> 'lng', '')::numeric;
  v_line      record;
  v_count     integer := 0;
begin
  select * into v_vendor from public.mk_vendors where id = p_vendor_id and status = 'active';
  if not found or bsdc.mk_vendor_credits(v_vendor.id) <= 0 then
    raise exception 'this shop cannot take orders right now' using errcode = 'P0002';
  end if;
  -- The shop's own delivery charge (0 to 150 taka), not a platform-wide one.
  v_fee := v_vendor.delivery_fee_poisha;

  if char_length(btrim(coalesce(p_address ->> 'customer_name', ''))) < 2 then
    raise exception 'enter your name' using errcode = '22023';
  end if;
  if coalesce(p_address ->> 'customer_phone', '') !~ '^01[3-9][0-9]{8}$' then
    raise exception 'enter an 11-digit Bangladesh mobile number' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_address ->> 'address_line', ''))) < 5 then
    raise exception 'enter your delivery address' using errcode = '22023';
  end if;
  if not bsdc.mk_valid_bd_point(v_lat, v_lng) then
    raise exception 'pin your delivery location on the map' using errcode = '22023';
  end if;
  -- A shop that delivers within a radius only takes pins inside it. Distance is
  -- rounded up to the next whole kilometre, so 5.1 km counts as 6 km.
  if v_vendor.delivery_scope = 'radius'
     and ceil(bsdc.mk_distance_km(
           coalesce(v_vendor.delivery_lat, v_vendor.lat), coalesce(v_vendor.delivery_lng, v_vendor.lng),
           v_lat, v_lng)) > v_vendor.delivery_radius_km then
    raise exception 'this shop delivers only within % km of its area', v_vendor.delivery_radius_km
      using errcode = '22023';
  end if;

  v_code := bsdc.mk_order_code();

  -- Resolve the items: direct order or the customer's cart for this vendor.
  create temp table if not exists _mk_order_lines (
    product_id uuid, qty integer, name text, unit_price bigint, image_url text
  ) on commit drop;
  delete from _mk_order_lines where true;

  if p_items is not null then
    insert into _mk_order_lines
    select (x ->> 'product_id')::uuid, sum((x ->> 'qty')::integer)::integer, null, null, null
      from jsonb_array_elements(p_items) x
     group by 1;
  else
    insert into _mk_order_lines
    select c.product_id, c.qty, null, null, null
      from public.mk_cart_items c
      join public.mk_products pr on pr.id = c.product_id
     where c.customer_uid = v_uid and pr.vendor_id = v_vendor.id;
  end if;

  if not exists (select 1 from _mk_order_lines) then
    raise exception 'your order is empty' using errcode = '22023';
  end if;

  -- Lock stock rows, verify, and price from the database (never from the client).
  for v_line in
    select l.product_id, l.qty, pr.id as real_id, pr.name, pr.price_poisha, pr.stock,
           pr.status, pr.vendor_id, coalesce(pr.images[1], '') as image_url
      from _mk_order_lines l
      join public.mk_products pr on pr.id = l.product_id
     order by pr.id
     for update of pr
  loop
    if v_line.vendor_id <> v_vendor.id or v_line.status <> 'active' then
      raise exception 'an item in your order is no longer available' using errcode = 'P0002';
    end if;
    if v_line.qty < 1 or v_line.qty > 50 then
      raise exception 'quantity must be between 1 and 50' using errcode = '22023';
    end if;
    if v_line.stock < v_line.qty then
      raise exception '% has only % left', v_line.name, v_line.stock using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_line.price_poisha * v_line.qty;
    v_count := v_count + 1;
    update _mk_order_lines
       set name = v_line.name, unit_price = v_line.price_poisha, image_url = v_line.image_url
     where product_id = v_line.product_id;
  end loop;

  -- A line for a product that was not found at all.
  if exists (select 1 from _mk_order_lines where name is null) then
    raise exception 'an item in your order is no longer available' using errcode = 'P0002';
  end if;

  insert into public.mk_orders (
    code, customer_uid, vendor_id, status, subtotal_poisha, delivery_fee_poisha, total_poisha,
    customer_name, customer_phone, address_line, landmark, lat, lng, place_label, note
  ) values (
    v_code, v_uid, v_vendor.id, 'placed', v_subtotal, v_fee, v_subtotal + v_fee,
    btrim(p_address ->> 'customer_name'), p_address ->> 'customer_phone',
    btrim(p_address ->> 'address_line'), left(coalesce(p_address ->> 'landmark', ''), 160),
    v_lat, v_lng, left(coalesce(p_address ->> 'place_label', ''), 300),
    left(coalesce(p_address ->> 'note', ''), 300)
  )
  returning id into v_order_id;

  insert into public.mk_order_items (order_id, product_id, name, image_url, unit_price, qty, line_total)
  select v_order_id, product_id, name, image_url, unit_price, qty, unit_price * qty
    from _mk_order_lines;

  update public.mk_products pr
     set stock = pr.stock - l.qty
    from _mk_order_lines l
   where pr.id = l.product_id;

  -- Ordered items leave the cart; the rest of the cart is untouched.
  delete from public.mk_cart_items c
   using _mk_order_lines l
   where c.customer_uid = v_uid and c.product_id = l.product_id
     and p_items is null;

  insert into public.mk_order_events (order_id, status, actor_uid, note)
  values (v_order_id, 'placed', v_uid, '');

  return jsonb_build_object(
    'order_id', v_order_id, 'code', v_code, 'status', 'placed',
    'subtotal_poisha', v_subtotal, 'delivery_fee_poisha', v_fee,
    'total_poisha', v_subtotal + v_fee, 'line_count', v_count
  );
end;
$$;

create or replace function public.mk_vendor_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_vendor public.mk_vendors%rowtype;
begin
  select * into v_vendor from public.mk_vendors
   where slug = p_slug and status = 'active';
  if not found or bsdc.mk_vendor_credits(v_vendor.id) <= 0 then
    raise exception 'this shop is not available' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'vendor', jsonb_build_object(
      'slug', v_vendor.slug, 'name', v_vendor.name, 'vendor_type', v_vendor.vendor_type,
      'description', v_vendor.description, 'logo_url', v_vendor.logo_url,
      'cover_url', v_vendor.cover_url, 'place_label', v_vendor.place_label,
      'lat', v_vendor.lat, 'lng', v_vendor.lng,
      'delivery', jsonb_build_object(
        'scope', v_vendor.delivery_scope,
        'radius_km', v_vendor.delivery_radius_km,
        'fee_poisha', v_vendor.delivery_fee_poisha,
        'center_lat', coalesce(v_vendor.delivery_lat, v_vendor.lat),
        'center_lng', coalesce(v_vendor.delivery_lng, v_vendor.lng)
      )
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name)
        from public.mk_categories c where c.vendor_id = v_vendor.id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'slug', pr.slug, 'name', pr.name, 'price_poisha', pr.price_poisha,
        'in_stock', pr.stock > 0, 'category_id', pr.category_id,
        'image_url', coalesce(pr.images[1], '')
      ) order by pr.created_at desc)
        from public.mk_products pr
       where pr.vendor_id = v_vendor.id and pr.status = 'active'
    ), '[]'::jsonb),
    'rating', coalesce((select round(avg(r.rating), 1) from public.mk_reviews r where r.vendor_id = v_vendor.id), 0),
    'review_count', (select count(*)::int from public.mk_reviews r where r.vendor_id = v_vendor.id)
  );
end;
$$;

-- 4. Grants: the new RPCs are for signed-in users only ------------------------
revoke all on function public.mk_admin_list_packages() from public, anon;
grant execute on function public.mk_admin_list_packages() to authenticated;
revoke all on function public.mk_vendor_delivery() from public, anon;
grant execute on function public.mk_vendor_delivery() to authenticated;
revoke all on function public.mk_vendor_set_delivery(text, integer, integer, numeric, numeric) from public, anon;
grant execute on function public.mk_vendor_set_delivery(text, integer, integer, numeric, numeric) to authenticated;
revoke all on function bsdc.mk_distance_km(numeric, numeric, numeric, numeric) from public, anon, authenticated;
