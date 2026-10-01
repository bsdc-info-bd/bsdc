-- ---------------------------------------------------------------------------
-- Marketplace, customer side: shops, products, carts, orders and reviews.
--
-- Three rules are enforced in Postgres because a browser cannot be trusted
-- with money or stock:
--   1. An order's prices are read from the product rows at the moment of
--      checkout. The cart the client sends contributes quantities, never
--      amounts.
--   2. Stock is decremented inside the same transaction that creates the
--      order, under a row lock, so two buyers cannot take the last unit.
--   3. A review may only be written by someone who actually received the
--      item, and that is checked against delivered orders, not claimed.
--
-- All money is stored as an integer number of poisha (1 taka = 100 poisha).
-- There is no floating point anywhere in this file.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_shop_status') then
    create type bsdc_shop_status as enum ('pending', 'active', 'suspended', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_product_status') then
    create type bsdc_product_status as enum ('draft', 'active', 'out_of_stock', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_order_status') then
    create type bsdc_order_status as enum (
      'pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_payment_method') then
    create type bsdc_payment_method as enum ('cash_on_delivery', 'bkash', 'nagad', 'card', 'bank');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_payment_status') then
    create type bsdc_payment_status as enum ('unpaid', 'pending', 'paid', 'refunded', 'failed');
  end if;
end;
$$;

-- -------------------------------- shops ------------------------------------
create table if not exists public.shops (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  name          text not null check (char_length(btrim(name)) between 2 and 80),
  tagline       text not null default '' check (char_length(tagline) <= 200),
  about         text not null default '' check (char_length(about) <= 4000),
  logo_url      text not null default '',
  owner_uid     text not null references public.profiles (uid) on delete cascade,
  status        bsdc_shop_status not null default 'pending',
  city          text not null default '' check (char_length(city) <= 80),
  -- Flat shipping, stated by the shop and copied onto the order so a later
  -- change never rewrites what a customer already agreed to pay.
  shipping_flat integer not null default 0 check (shipping_flat >= 0),
  free_shipping_over integer check (free_shipping_over is null or free_shipping_over > 0),
  rating_sum    integer not null default 0 check (rating_sum >= 0),
  rating_count  integer not null default 0 check (rating_count >= 0),
  orders_count  integer not null default 0 check (orders_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists shops_active_idx on public.shops (status) where status = 'active';

drop trigger if exists shops_touch on public.shops;
create trigger shops_touch before update on public.shops
  for each row execute function bsdc.touch_updated_at();

-- ------------------------------- products ----------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops (id) on delete cascade,
  slug          citext not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title         text not null check (char_length(btrim(title)) between 3 and 140),
  summary       text not null default '' check (char_length(summary) <= 300),
  description   text not null default '' check (char_length(description) <= 20000),
  images        text[] not null default array[]::text[],
  category      text not null default '' check (char_length(category) <= 60),
  tags          text[] not null default array[]::text[],
  -- Poisha. price_original is what it used to cost, for an honest discount.
  price         integer not null check (price >= 0),
  price_original integer check (price_original is null or price_original >= 0),
  currency      text not null default 'BDT' check (char_length(currency) = 3),
  stock         integer not null default 0 check (stock >= 0),
  -- A digital product has no stock to run out of and no shipping.
  is_digital    boolean not null default false,
  max_per_order integer not null default 10 check (max_per_order between 1 and 1000),
  status        bsdc_product_status not null default 'draft',
  rating_sum    integer not null default 0 check (rating_sum >= 0),
  rating_count  integer not null default 0 check (rating_count >= 0),
  sold_count    integer not null default 0 check (sold_count >= 0),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A "discount" that raises the price is not a discount.
  constraint products_discount_is_a_discount
    check (price_original is null or price_original >= price)
);

create index if not exists products_active_idx
  on public.products (status, published_at desc nulls last) where status = 'active';
create index if not exists products_shop_idx on public.products (shop_id, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_tags_idx on public.products using gin (tags);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function bsdc.touch_updated_at();

-- -------------------------------- carts ------------------------------------
-- One open cart per member. Items hold a quantity and nothing else: the price
-- shown in the cart is always read live from the product.
create table if not exists public.carts (
  id         uuid primary key default gen_random_uuid(),
  uid        text not null unique references public.profiles (uid) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists carts_touch on public.carts;
create trigger carts_touch before update on public.carts
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity   integer not null check (quantity between 1 and 1000),
  added_at   timestamptz not null default now(),
  unique (cart_id, product_id)
);

create index if not exists cart_items_cart_idx on public.cart_items (cart_id);

-- ------------------------------ addresses ----------------------------------
create table if not exists public.addresses (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null references public.profiles (uid) on delete cascade,
  label       text not null default 'home' check (char_length(label) <= 40),
  recipient   text not null check (char_length(btrim(recipient)) between 2 and 100),
  phone       text not null check (phone ~ '^(\+8801|01)[3-9][0-9]{8}$'),
  line1       text not null check (char_length(btrim(line1)) between 3 and 200),
  line2       text not null default '' check (char_length(line2) <= 200),
  city        text not null check (char_length(btrim(city)) between 2 and 80),
  district    text not null default '' check (char_length(district) <= 80),
  postcode    text not null default '' check (postcode = '' or postcode ~ '^[0-9]{4}$'),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists addresses_uid_idx on public.addresses (uid, created_at desc);
create unique index if not exists addresses_one_default
  on public.addresses (uid) where is_default;

-- -------------------------------- orders -----------------------------------
-- Every amount here is a copy taken at checkout, not a reference. A shop may
-- change its prices tomorrow; this order says what was agreed today.
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^BSD[0-9]{10}$'),
  uid             text not null references public.profiles (uid) on delete restrict,
  shop_id         uuid not null references public.shops (id) on delete restrict,
  status          bsdc_order_status not null default 'pending',
  payment_method  bsdc_payment_method not null default 'cash_on_delivery',
  payment_status  bsdc_payment_status not null default 'unpaid',
  subtotal        integer not null check (subtotal >= 0),
  shipping        integer not null default 0 check (shipping >= 0),
  discount        integer not null default 0 check (discount >= 0),
  total           integer not null check (total >= 0),
  currency        text not null default 'BDT' check (char_length(currency) = 3),
  recipient       text not null,
  phone           text not null,
  address_line    text not null,
  city            text not null,
  note            text not null default '' check (char_length(note) <= 500),
  placed_at       timestamptz not null default now(),
  confirmed_at    timestamptz,
  delivered_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text not null default '' check (char_length(cancel_reason) <= 300),
  updated_at      timestamptz not null default now(),
  constraint orders_total_adds_up check (total = subtotal + shipping - discount),
  constraint orders_discount_within_subtotal check (discount <= subtotal)
);

create index if not exists orders_uid_idx on public.orders (uid, placed_at desc);
create index if not exists orders_shop_idx on public.orders (shop_id, placed_at desc);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function bsdc.touch_updated_at();

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  -- The title too is copied: a renamed product must not rewrite history.
  title      text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity   integer not null check (quantity between 1 and 1000),
  line_total integer not null check (line_total >= 0),
  constraint order_items_line_total_correct check (line_total = unit_price * quantity)
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- ------------------------------- wishlist ----------------------------------
create table if not exists public.wishlist_items (
  uid        text not null references public.profiles (uid) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (uid, product_id)
);

-- ------------------------------- reviews -----------------------------------
create table if not exists public.product_reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  uid        text not null references public.profiles (uid) on delete cascade,
  order_id   uuid not null references public.orders (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  body       text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  -- One review per purchase, not one per opinion.
  unique (product_id, uid)
);

create index if not exists product_reviews_product_idx
  on public.product_reviews (product_id, created_at desc);

-- A rating average is a derived fact; both sides of it are trigger-maintained.
create or replace function bsdc.sync_review_totals()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
  v_shop    uuid;
begin
  update public.products p
    set rating_sum = totals.sum, rating_count = totals.count
    from (
      select coalesce(sum(rating), 0)::integer as sum, count(*)::integer as count
      from public.product_reviews where product_id = v_product
    ) as totals
    where p.id = v_product
    returning p.shop_id into v_shop;

  if v_shop is not null then
    update public.shops s
      set rating_sum = totals.sum, rating_count = totals.count
      from (
        select coalesce(sum(r.rating), 0)::integer as sum, count(*)::integer as count
        from public.product_reviews r
        join public.products p2 on p2.id = r.product_id
        where p2.shop_id = v_shop
      ) as totals
      where s.id = v_shop;
  end if;
  return null;
end;
$$;

drop trigger if exists product_reviews_sync on public.product_reviews;
create trigger product_reviews_sync after insert or update or delete on public.product_reviews
  for each row execute function bsdc.sync_review_totals();

-- ---------------------------------------------------------------------------
-- cart operations
-- ---------------------------------------------------------------------------

create or replace function bsdc.cart_for(p_uid text)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.carts where uid = p_uid;
  if v_id is null then
    insert into public.carts (uid) values (p_uid)
      on conflict (uid) do update set updated_at = now()
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Adding to a cart is clamped by what the shop actually has and by the
-- per-order limit, so an impossible quantity never reaches checkout.
create or replace function public.add_to_cart(p_product_id uuid, p_quantity integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_cart    uuid;
  v_product public.products%rowtype;
  v_wanted  integer;
  v_ceiling integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_product from public.products where id = p_product_id;
  if not found or v_product.status <> 'active' then
    raise exception 'this product is not for sale' using errcode = 'P0002';
  end if;

  v_cart := bsdc.cart_for(v_uid);
  v_ceiling := case
    when v_product.is_digital then v_product.max_per_order
    else least(v_product.max_per_order, v_product.stock)
  end;
  if v_ceiling < 1 then
    raise exception 'this product is out of stock' using errcode = 'P0002';
  end if;

  insert into public.cart_items (cart_id, product_id, quantity)
    values (v_cart, p_product_id, least(greatest(coalesce(p_quantity, 1), 1), v_ceiling))
    on conflict (cart_id, product_id) do update
      set quantity = least(public.cart_items.quantity + greatest(coalesce(p_quantity, 1), 1), v_ceiling)
    returning quantity into v_wanted;

  update public.carts set updated_at = now() where id = v_cart;
  return v_wanted;
end;
$$;

create or replace function public.set_cart_quantity(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid  text := bsdc.current_uid();
  v_cart uuid;
  v_ceiling integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  v_cart := bsdc.cart_for(v_uid);

  if coalesce(p_quantity, 0) <= 0 then
    delete from public.cart_items where cart_id = v_cart and product_id = p_product_id;
    return;
  end if;

  select case when is_digital then max_per_order else least(max_per_order, stock) end
    into v_ceiling from public.products where id = p_product_id;

  update public.cart_items
    set quantity = least(p_quantity, coalesce(v_ceiling, p_quantity))
    where cart_id = v_cart and product_id = p_product_id;
end;
$$;

create or replace function public.clear_cart()
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    return;
  end if;
  delete from public.cart_items where cart_id = bsdc.cart_for(v_uid);
end;
$$;

-- The cart as the customer should see it: live prices, live stock, and the
-- quantity trimmed to what can actually be bought right now.
create or replace function public.my_cart()
returns table (
  product_id   uuid,
  slug         text,
  title        text,
  image_url    text,
  unit_price   integer,
  currency     text,
  quantity     integer,
  available    integer,
  line_total   integer,
  shop_id      uuid,
  shop_name    text,
  in_stock     boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    p.id, p.slug::text, p.title, coalesce(p.images[1], ''), p.price, p.currency,
    ci.quantity,
    case when p.is_digital then p.max_per_order else p.stock end,
    p.price * ci.quantity,
    s.id, s.name,
    (p.status = 'active' and (p.is_digital or p.stock >= ci.quantity))
  from public.cart_items ci
  join public.carts c on c.id = ci.cart_id
  join public.products p on p.id = ci.product_id
  join public.shops s on s.id = p.shop_id
  where c.uid = bsdc.current_uid()
  order by ci.added_at;
$$;

-- ---------------------------------------------------------------------------
-- checkout
-- ---------------------------------------------------------------------------

create or replace function bsdc.new_order_code()
returns text
language sql
volatile
set search_path = public, bsdc, pg_temp
as $$
  select 'BSD' || lpad(((random() * 9999999999)::bigint)::text, 10, '0');
$$;

-- Places one order per shop from the current cart.
--
-- Prices and shipping are read from the shop and product rows here; the
-- client sends an address and a payment method and nothing else that costs
-- money. Stock is taken under "for update" in the same transaction, so the
-- last unit can only be sold once.
create or replace function public.place_order(
  p_address_id     uuid,
  p_payment_method bsdc_payment_method default 'cash_on_delivery',
  p_note           text default ''
)
returns table (order_id uuid, code text, total integer)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_cart     uuid;
  v_address  public.addresses%rowtype;
  v_shop     record;
  v_item     record;
  v_order    uuid;
  v_code     text;
  v_subtotal integer;
  v_shipping integer;
  v_total    integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_address from public.addresses where id = p_address_id and uid = v_uid;
  if not found then
    raise exception 'delivery address not found' using errcode = 'P0002';
  end if;

  v_cart := bsdc.cart_for(v_uid);
  if not exists (select 1 from public.cart_items where cart_id = v_cart) then
    raise exception 'your cart is empty' using errcode = '22023';
  end if;

  for v_shop in
    select s.id, s.name, s.shipping_flat, s.free_shipping_over, s.status
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.shops s on s.id = p.shop_id
    where ci.cart_id = v_cart
    group by s.id, s.name, s.shipping_flat, s.free_shipping_over, s.status
  loop
    if v_shop.status <> 'active' then
      raise exception 'this shop is not currently trading' using errcode = 'P0002';
    end if;

    v_subtotal := 0;
    v_code := bsdc.new_order_code();

    insert into public.orders (
      code, uid, shop_id, payment_method, subtotal, shipping, discount, total,
      recipient, phone, address_line, city, note
    )
    values (
      v_code, v_uid, v_shop.id, p_payment_method, 0, 0, 0, 0,
      v_address.recipient, v_address.phone,
      btrim(v_address.line1 || ' ' || v_address.line2), v_address.city,
      left(coalesce(p_note, ''), 500)
    )
    returning id into v_order;

    for v_item in
      select ci.product_id, ci.quantity
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
      where ci.cart_id = v_cart and p.shop_id = v_shop.id
      order by ci.added_at
    loop
      declare
        v_product public.products%rowtype;
        v_line    integer;
      begin
        -- The lock is the point: between this select and the update below,
        -- nobody else can sell the same unit.
        select * into v_product from public.products
          where id = v_item.product_id for update;

        if v_product.status <> 'active' then
          raise exception 'product % is no longer for sale', v_product.title
            using errcode = 'P0002';
        end if;
        if not v_product.is_digital and v_product.stock < v_item.quantity then
          raise exception 'only % left of %', v_product.stock, v_product.title
            using errcode = '22023';
        end if;

        v_line := v_product.price * v_item.quantity;
        v_subtotal := v_subtotal + v_line;

        insert into public.order_items (order_id, product_id, title, unit_price, quantity, line_total)
          values (v_order, v_product.id, v_product.title, v_product.price, v_item.quantity, v_line);

        if not v_product.is_digital then
          update public.products
            set stock = stock - v_item.quantity,
                sold_count = sold_count + v_item.quantity,
                status = case when stock - v_item.quantity = 0 then 'out_of_stock'::bsdc_product_status
                              else status end
            where id = v_product.id;
        else
          update public.products set sold_count = sold_count + v_item.quantity
            where id = v_product.id;
        end if;
      end;
    end loop;

    v_shipping := case
      when v_shop.free_shipping_over is not null and v_subtotal >= v_shop.free_shipping_over then 0
      else v_shop.shipping_flat
    end;
    v_total := v_subtotal + v_shipping;

    update public.orders
      set subtotal = v_subtotal, shipping = v_shipping, total = v_total
      where id = v_order;

    update public.shops set orders_count = orders_count + 1 where id = v_shop.id;
    perform bsdc.notify(
      (select owner_uid from public.shops where id = v_shop.id),
      v_uid, 'moderation', null, null, 'order_placed'
    );

    order_id := v_order;
    code := v_code;
    total := v_total;
    return next;
  end loop;

  delete from public.cart_items where cart_id = v_cart;
end;
$$;

-- A customer may call off an order only while nothing has shipped; the stock
-- goes back to the shelf in the same transaction.
create or replace function public.cancel_order(p_order_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_order public.orders%rowtype;
  v_item  record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.uid <> v_uid and not bsdc.is_staff() then
    raise exception 'this is not your order' using errcode = '42501';
  end if;
  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'this order can no longer be cancelled' using errcode = '22023';
  end if;

  for v_item in
    select product_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.products
      set stock = stock + v_item.quantity,
          sold_count = greatest(sold_count - v_item.quantity, 0),
          status = case when status = 'out_of_stock' then 'active'::bsdc_product_status
                        else status end
      where id = v_item.product_id and not is_digital;
  end loop;

  update public.orders
    set status = 'cancelled', cancelled_at = now(),
        cancel_reason = left(coalesce(p_reason, ''), 300)
    where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- reviews and wishlist
-- ---------------------------------------------------------------------------

-- Only a delivered order earns the right to review, and only for the items
-- that order actually contained.
create or replace function public.submit_review(
  p_product_id uuid,
  p_rating     integer,
  p_body       text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_order uuid;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(p_rating, 0) not between 1 and 5 then
    raise exception 'a rating is one to five stars' using errcode = '22023';
  end if;

  select o.id into v_order
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.uid = v_uid and oi.product_id = p_product_id and o.status = 'delivered'
    order by o.delivered_at desc nulls last
    limit 1;

  if v_order is null then
    raise exception 'only a delivered purchase can be reviewed' using errcode = '42501';
  end if;

  insert into public.product_reviews (product_id, uid, order_id, rating, body)
    values (p_product_id, v_uid, v_order, p_rating, left(coalesce(p_body, ''), 4000))
    on conflict (product_id, uid)
      do update set rating = excluded.rating, body = excluded.body, created_at = now()
    returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.toggle_wishlist(p_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.wishlist_items where uid = v_uid and product_id = p_product_id
  ) then
    delete from public.wishlist_items where uid = v_uid and product_id = p_product_id;
    return false;
  end if;
  insert into public.wishlist_items (uid, product_id) values (v_uid, p_product_id);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- reading the shop
-- ---------------------------------------------------------------------------

create or replace function public.product_catalog(
  p_limit    integer default 40,
  p_category text default null,
  p_search   text default null,
  p_sort     text default 'recent'
)
returns table (
  id           uuid,
  slug         text,
  title        text,
  summary      text,
  image_url    text,
  price        integer,
  price_original integer,
  currency     text,
  stock        integer,
  is_digital   boolean,
  category     text,
  rating_sum   integer,
  rating_count integer,
  sold_count   integer,
  shop_id      uuid,
  shop_name    text,
  shop_slug    text,
  wishlisted   boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    p.id, p.slug::text, p.title, p.summary, coalesce(p.images[1], ''),
    p.price, p.price_original, p.currency, p.stock, p.is_digital, p.category,
    p.rating_sum, p.rating_count, p.sold_count,
    s.id, s.name, s.slug::text,
    exists (
      select 1 from public.wishlist_items w
      where w.product_id = p.id and w.uid = bsdc.current_uid()
    )
  from public.products p
  join public.shops s on s.id = p.shop_id
  where p.status in ('active', 'out_of_stock')
    and s.status = 'active'
    and (p_category is null or p.category = p_category)
    and (
      p_search is null
      or bsdc.to_search_query(p_search) is null
      or p.title ilike '%' || p_search || '%'
      or p.summary ilike '%' || p_search || '%'
    )
  order by
    case when p_sort = 'price_asc' then p.price end asc nulls last,
    case when p_sort = 'price_desc' then -p.price end asc nulls last,
    case when p_sort = 'popular' then -p.sold_count end asc nulls last,
    case when p_sort = 'rating'
      then -(case when p.rating_count = 0 then 0 else p.rating_sum / p.rating_count end) end
      asc nulls last,
    p.published_at desc nulls last
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.my_orders(p_limit integer default 30)
returns table (
  id             uuid,
  code           text,
  status         bsdc_order_status,
  payment_status bsdc_payment_status,
  payment_method bsdc_payment_method,
  total          integer,
  currency       text,
  item_count     integer,
  shop_name      text,
  placed_at      timestamptz,
  can_cancel     boolean,
  can_review     boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    o.id, o.code, o.status, o.payment_status, o.payment_method, o.total, o.currency,
    (select coalesce(sum(oi.quantity), 0)::integer from public.order_items oi
      where oi.order_id = o.id),
    s.name, o.placed_at,
    o.status in ('pending', 'confirmed'),
    o.status = 'delivered'
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.uid = bsdc.current_uid()
  order by o.placed_at desc
  limit greatest(1, least(p_limit, 100));
$$;
