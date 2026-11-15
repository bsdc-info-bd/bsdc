-- ---------------------------------------------------------------------------
-- 0107 — Placing an order no longer fails on a database with safe-update on.
--
-- mk_place_order cleared its scratch table with a bare `delete from
-- _mk_order_lines;`. Production runs with the safe-update guard, which rejects
-- any DELETE without a WHERE clause ("DELETE requires a WHERE clause"), so every
-- order failed at that line. The replay tests run without the guard and passed.
-- The statement now carries an explicit WHERE. The body is otherwise unchanged,
-- and CREATE OR REPLACE keeps the grants from 0094.
-- ---------------------------------------------------------------------------

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
  v_fee       bigint := bsdc.mk_setting('delivery_fee_poisha')::bigint;
  v_lat       numeric := nullif(p_address ->> 'lat', '')::numeric;
  v_lng       numeric := nullif(p_address ->> 'lng', '')::numeric;
  v_line      record;
  v_count     integer := 0;
begin
  select * into v_vendor from public.mk_vendors where id = p_vendor_id and status = 'active';
  if not found or bsdc.mk_vendor_credits(v_vendor.id) <= 0 then
    raise exception 'this shop cannot take orders right now' using errcode = 'P0002';
  end if;

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
