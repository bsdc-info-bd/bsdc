-- 0094: the new BSDC marketplace — vendor-delivery, cash-on-delivery only.
--
-- This migration is additive. The legacy marketplace (0018–0021) stays in place
-- until the web and Android screens have switched to these RPCs; a later
-- migration removes it. Nothing here drops or rewrites legacy data.
--
-- Business rules encoded here (all money is integer poisha; 100 poisha = 1 taka):
--   * Vendors apply with identity, shop, type, pinned location, trade licence
--     (optional), agreements, and a credit package. Payment is by bKash/Nagad
--     "send money" to the admin-editable BSDC number, with the sender number,
--     account holder, and transaction ID recorded for review.
--   * An admin approves the application; the purchased order credits are then
--     added to the vendor's ledger and the vendor is listed.
--   * Each order the vendor ACCEPTS consumes one order credit. Declining or
--     cancelling a placed order consumes nothing.
--   * A vendor with zero credits is unlisted: it cannot be browsed and cannot
--     receive new orders until a new package is bought and approved.
--   * Customers pay cash on delivery. Delivery is by the vendor. The fee is a
--     fixed admin-editable amount (default 150 taka).
--   * A review is allowed only after the order is delivered, once per order.

-- ---------------------------------------------------------------------------
-- 0. Permissions for staff (admin role gets the marketplace controls)
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, permission) values
  ('admin', 'marketplace.review'),
  ('admin', 'marketplace.settings')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type bsdc_mk_vendor_type as enum (
    'grocery', 'restaurant', 'bakery', 'pharmacy', 'electronics', 'fashion',
    'beauty', 'stationery', 'home_kitchen', 'books', 'handicraft', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type bsdc_mk_application_status as enum ('submitted', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bsdc_mk_purchase_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bsdc_mk_vendor_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bsdc_mk_product_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bsdc_mk_order_status as enum (
    'placed', 'accepted', 'packaged', 'out_for_delivery', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Settings and credit packages (admin-editable)
-- ---------------------------------------------------------------------------
create table if not exists public.mk_settings (
  key        text primary key check (key in ('bikash_number', 'delivery_fee_poisha', 'order_credit_price_poisha')),
  value      text not null,
  updated_by text references public.profiles (uid) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.mk_settings (key, value) values
  ('bikash_number', ''),
  ('delivery_fee_poisha', '15000'),
  ('order_credit_price_poisha', '1000')
on conflict (key) do nothing;

create table if not exists public.mk_credit_packages (
  code         text primary key check (code in ('10', '50', '100')),
  orders       integer not null check (orders > 0),
  price_poisha bigint not null check (price_poisha > 0),
  sort         integer not null default 0,
  is_active    boolean not null default true,
  updated_at   timestamptz not null default now()
);

insert into public.mk_credit_packages (code, orders, price_poisha, sort) values
  ('10', 10, 10000, 1),
  ('50', 50, 50000, 2),
  ('100', 100, 95000, 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Vendor applications and approved vendors
-- ---------------------------------------------------------------------------
create table if not exists public.mk_vendor_applications (
  id                   uuid primary key default gen_random_uuid(),
  owner_uid            text not null references public.profiles (uid) on delete cascade,
  full_name            text not null check (char_length(btrim(full_name)) between 2 and 80),
  shop_name            text not null check (char_length(btrim(shop_name)) between 2 and 80),
  nid_number           text not null check (nid_number ~ '^[0-9]{10}$|^[0-9]{13}$|^[0-9]{17}$'),
  mobile               text not null check (mobile ~ '^01[3-9][0-9]{8}$'),
  vendor_type          bsdc_mk_vendor_type not null,
  address_line         text not null check (char_length(btrim(address_line)) between 5 and 240),
  lat                  numeric(9, 6) not null check (lat between 20.5 and 26.7),
  lng                  numeric(9, 6) not null check (lng between 88.0 and 92.7),
  place_label          text not null default '' check (char_length(place_label) <= 300),
  trade_license_no     text not null default '' check (char_length(trade_license_no) <= 60),
  package_code         text not null references public.mk_credit_packages (code),
  agreements           jsonb not null,
  payment_sender       text not null check (payment_sender ~ '^01[3-9][0-9]{8}$'),
  payment_holder       text not null check (char_length(btrim(payment_holder)) between 2 and 80),
  payment_txn_id       text not null check (char_length(btrim(payment_txn_id)) between 4 and 40),
  status               bsdc_mk_application_status not null default 'submitted',
  review_note          text not null default '' check (char_length(review_note) <= 500),
  reviewed_by          text references public.profiles (uid) on delete set null,
  reviewed_at          timestamptz,
  submitted_at         timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create unique index if not exists mk_applications_one_open_per_owner
  on public.mk_vendor_applications (owner_uid) where status = 'submitted';
create index if not exists mk_applications_status_idx
  on public.mk_vendor_applications (status, submitted_at);

create table if not exists public.mk_vendors (
  id              uuid primary key default gen_random_uuid(),
  owner_uid       text not null unique references public.profiles (uid) on delete cascade,
  application_id  uuid not null unique references public.mk_vendor_applications (id),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  vendor_type     bsdc_mk_vendor_type not null,
  description     text not null default '' check (char_length(description) <= 1000),
  logo_url        text not null default '' check (logo_url = '' or logo_url ~ '^https://'),
  cover_url       text not null default '' check (cover_url = '' or cover_url ~ '^https://'),
  mobile          text not null check (mobile ~ '^01[3-9][0-9]{8}$'),
  address_line    text not null,
  lat             numeric(9, 6) not null,
  lng             numeric(9, 6) not null,
  place_label     text not null default '',
  status          bsdc_mk_vendor_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mk_vendors_type_idx on public.mk_vendors (vendor_type) where status = 'active';

-- ---------------------------------------------------------------------------
-- 4. Credit purchases and the credit ledger
-- ---------------------------------------------------------------------------
create table if not exists public.mk_credit_purchases (
  id              uuid primary key default gen_random_uuid(),
  owner_uid       text not null references public.profiles (uid) on delete cascade,
  application_id  uuid references public.mk_vendor_applications (id) on delete set null,
  vendor_id       uuid references public.mk_vendors (id) on delete cascade,
  package_code    text not null references public.mk_credit_packages (code),
  orders          integer not null check (orders > 0),
  price_poisha    bigint not null check (price_poisha > 0),
  sender_number   text not null check (sender_number ~ '^01[3-9][0-9]{8}$'),
  account_holder  text not null check (char_length(btrim(account_holder)) between 2 and 80),
  txn_id          text not null check (char_length(btrim(txn_id)) between 4 and 40),
  status          bsdc_mk_purchase_status not null default 'pending',
  review_note     text not null default '' check (char_length(review_note) <= 500),
  decided_by      text references public.profiles (uid) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- A bKash/Nagad transaction ID can credit exactly one purchase, ever.
create unique index if not exists mk_credit_purchases_txn_once
  on public.mk_credit_purchases (lower(btrim(txn_id)));
create index if not exists mk_credit_purchases_status_idx
  on public.mk_credit_purchases (status, created_at);

create table if not exists public.mk_credit_ledger (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references public.mk_vendors (id) on delete cascade,
  kind         text not null check (kind in ('purchase', 'order', 'adjustment')),
  orders_delta integer not null check (orders_delta <> 0),
  order_id     uuid,
  purchase_id  uuid references public.mk_credit_purchases (id) on delete set null,
  memo         text not null default '' check (char_length(memo) <= 200),
  actor_uid    text references public.profiles (uid) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists mk_credit_ledger_vendor_idx on public.mk_credit_ledger (vendor_id);

-- Balance is always the ledger sum: nothing is stored that could drift.
create or replace function bsdc.mk_vendor_credits(p_vendor_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce(sum(orders_delta), 0)::integer
    from public.mk_credit_ledger where vendor_id = p_vendor_id
$$;

-- ---------------------------------------------------------------------------
-- 5. Catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.mk_categories (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.mk_vendors (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  unique (vendor_id, name)
);

create table if not exists public.mk_products (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references public.mk_vendors (id) on delete cascade,
  category_id  uuid references public.mk_categories (id) on delete set null,
  slug         text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,120}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  description  text not null default '' check (char_length(description) <= 2000),
  price_poisha bigint not null check (price_poisha > 0 and price_poisha <= 100000000),
  stock        integer not null default 0 check (stock >= 0 and stock <= 100000),
  images       text[] not null default '{}' check (cardinality(images) <= 8),
  status       bsdc_mk_product_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (vendor_id, slug)
);

create index if not exists mk_products_vendor_idx on public.mk_products (vendor_id, status);

-- ---------------------------------------------------------------------------
-- 6. Carts, orders, timeline, reviews
-- ---------------------------------------------------------------------------
create table if not exists public.mk_cart_items (
  customer_uid text not null references public.profiles (uid) on delete cascade,
  product_id   uuid not null references public.mk_products (id) on delete cascade,
  qty          integer not null check (qty between 1 and 50),
  updated_at   timestamptz not null default now(),
  primary key (customer_uid, product_id)
);

create table if not exists public.mk_orders (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique check (code ~ '^BSD-[0-9]{6}-[A-Z0-9]{5}$'),
  customer_uid         text not null references public.profiles (uid) on delete cascade,
  vendor_id            uuid not null references public.mk_vendors (id),
  status               bsdc_mk_order_status not null default 'placed',
  subtotal_poisha      bigint not null check (subtotal_poisha > 0),
  delivery_fee_poisha  bigint not null check (delivery_fee_poisha >= 0),
  total_poisha         bigint not null check (total_poisha = subtotal_poisha + delivery_fee_poisha),
  payment_method       text not null default 'cash_on_delivery' check (payment_method = 'cash_on_delivery'),
  customer_name        text not null check (char_length(btrim(customer_name)) between 2 and 80),
  customer_phone       text not null check (customer_phone ~ '^01[3-9][0-9]{8}$'),
  address_line         text not null check (char_length(btrim(address_line)) between 5 and 240),
  landmark             text not null default '' check (char_length(landmark) <= 160),
  lat                  numeric(9, 6) not null check (lat between 20.5 and 26.7),
  lng                  numeric(9, 6) not null check (lng between 88.0 and 92.7),
  place_label          text not null default '' check (char_length(place_label) <= 300),
  note                 text not null default '' check (char_length(note) <= 300),
  credit_charged       boolean not null default false,
  cancelled_by         text check (cancelled_by in ('customer', 'vendor')),
  cancel_reason        text not null default '' check (char_length(cancel_reason) <= 300),
  placed_at            timestamptz not null default now(),
  accepted_at          timestamptz,
  packaged_at          timestamptz,
  out_at               timestamptz,
  delivered_at         timestamptz,
  cancelled_at         timestamptz,
  updated_at           timestamptz not null default now(),
  constraint mk_orders_cancel_consistent check (
    (status = 'cancelled') = (cancelled_by is not null)
  )
);

create index if not exists mk_orders_vendor_idx on public.mk_orders (vendor_id, status, placed_at desc);
create index if not exists mk_orders_customer_idx on public.mk_orders (customer_uid, placed_at desc);

create table if not exists public.mk_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.mk_orders (id) on delete cascade,
  product_id   uuid references public.mk_products (id) on delete set null,
  name         text not null,
  image_url    text not null default '',
  unit_price   bigint not null check (unit_price > 0),
  qty          integer not null check (qty between 1 and 50),
  line_total   bigint not null check (line_total = unit_price * qty)
);

create index if not exists mk_order_items_order_idx on public.mk_order_items (order_id);

create table if not exists public.mk_order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.mk_orders (id) on delete cascade,
  status      bsdc_mk_order_status not null,
  actor_uid   text references public.profiles (uid) on delete set null,
  note        text not null default '' check (char_length(note) <= 300),
  created_at  timestamptz not null default now()
);

create index if not exists mk_order_events_order_idx on public.mk_order_events (order_id, created_at);

alter table public.mk_credit_ledger
  drop constraint if exists mk_credit_ledger_order_fk;
alter table public.mk_credit_ledger
  add constraint mk_credit_ledger_order_fk foreign key (order_id)
  references public.mk_orders (id) on delete set null;

-- One credit per order, ever.
create unique index if not exists mk_credit_ledger_order_once
  on public.mk_credit_ledger (order_id) where kind = 'order';

create table if not exists public.mk_reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.mk_orders (id) on delete cascade,
  vendor_id    uuid not null references public.mk_vendors (id) on delete cascade,
  customer_uid text not null references public.profiles (uid) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  body         text not null default '' check (char_length(body) <= 600),
  created_at   timestamptz not null default now()
);

create index if not exists mk_reviews_vendor_idx on public.mk_reviews (vendor_id, created_at desc);

-- updated_at triggers
drop trigger if exists mk_vendors_touch on public.mk_vendors;
create trigger mk_vendors_touch before update on public.mk_vendors
  for each row execute function bsdc.touch_updated_at();
drop trigger if exists mk_products_touch on public.mk_products;
create trigger mk_products_touch before update on public.mk_products
  for each row execute function bsdc.touch_updated_at();
drop trigger if exists mk_orders_touch on public.mk_orders;
create trigger mk_orders_touch before update on public.mk_orders
  for each row execute function bsdc.touch_updated_at();

-- Ownership check for policies. Security definer so the policy never needs
-- to read mk_vendors (which holds vendor contact details) as the member.
create or replace function bsdc.mk_owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select exists (
    select 1 from public.mk_vendors v
     where v.id = p_vendor_id and v.owner_uid = bsdc.current_uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- 7. Row level security: clients never write these tables directly.
--    Reads go through RPCs, except the order tables, which parties may read
--    so that realtime status updates reach them.
-- ---------------------------------------------------------------------------
alter table public.mk_settings enable row level security;
alter table public.mk_credit_packages enable row level security;
alter table public.mk_vendor_applications enable row level security;
alter table public.mk_vendors enable row level security;
alter table public.mk_credit_purchases enable row level security;
alter table public.mk_credit_ledger enable row level security;
alter table public.mk_categories enable row level security;
alter table public.mk_products enable row level security;
alter table public.mk_cart_items enable row level security;
alter table public.mk_orders enable row level security;
alter table public.mk_order_items enable row level security;
alter table public.mk_order_events enable row level security;
alter table public.mk_reviews enable row level security;

revoke all on public.mk_settings, public.mk_credit_packages, public.mk_vendor_applications,
  public.mk_vendors, public.mk_credit_purchases, public.mk_credit_ledger, public.mk_categories,
  public.mk_products, public.mk_cart_items, public.mk_orders, public.mk_order_items,
  public.mk_order_events, public.mk_reviews from anon, authenticated;

grant select on public.mk_orders, public.mk_order_events to authenticated;

drop policy if exists mk_orders_read_parties on public.mk_orders;
create policy mk_orders_read_parties on public.mk_orders
  for select to authenticated
  using (
    customer_uid = bsdc.current_uid()
    or bsdc.mk_owns_vendor(mk_orders.vendor_id)
  );

drop policy if exists mk_order_events_read_parties on public.mk_order_events;
create policy mk_order_events_read_parties on public.mk_order_events
  for select to authenticated
  using (
    exists (
      select 1 from public.mk_orders o
      where o.id = mk_order_events.order_id
        and (
          o.customer_uid = bsdc.current_uid()
          or bsdc.mk_owns_vendor(o.vendor_id)
        )
    )
  );

-- Realtime: vendors hear about new orders; customers hear about status changes.
do $$ begin
  alter publication supabase_realtime add table public.mk_orders;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.mk_order_events;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 8. Helpers
-- ---------------------------------------------------------------------------
create or replace function bsdc.mk_setting(p_key text)
returns text
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select value from public.mk_settings where key = p_key
$$;

create or replace function bsdc.mk_my_vendor_id()
returns uuid
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select v.id from public.mk_vendors v
   where v.owner_uid = bsdc.current_uid() and v.status = 'active'
$$;

create or replace function bsdc.mk_vendor_is_listed(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select exists (
    select 1 from public.mk_vendors v
     where v.id = p_vendor_id and v.status = 'active'
       and bsdc.mk_vendor_credits(v.id) > 0
  )
$$;

create or replace function bsdc.mk_require_uid()
returns text
language plpgsql
stable
as $$
declare v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'sign in is required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function bsdc.mk_require_staff_permission(p_permission text)
returns void
language plpgsql
stable
as $$
begin
  perform bsdc.require_permission(p_permission);
end;
$$;

create or replace function bsdc.mk_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
as $$
  select round((2 * 6371 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2)
    + cos(radians(lat1::float8)) * cos(radians(lat2::float8))
      * power(sin(radians((lng2 - lng1)::float8) / 2), 2)
  )))::numeric, 2)
$$;

create or replace function bsdc.mk_valid_bd_point(p_lat numeric, p_lng numeric)
returns boolean
language sql
immutable
as $$
  select p_lat is not null and p_lng is not null
     and p_lat between 20.5 and 26.7 and p_lng between 88.0 and 92.7
$$;

create or replace function bsdc.mk_order_code()
returns text
language sql
volatile
as $$
  select 'BSD-' || to_char(now() at time zone 'Asia/Dhaka', 'YYMMDD') || '-'
         || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5))
$$;

create or replace function bsdc.mk_slugify(p_text text, p_fallback text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g'), '-'), ''),
    p_fallback
  ) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6)
$$;

-- ---------------------------------------------------------------------------
-- 9. Settings and payment instructions
-- ---------------------------------------------------------------------------
-- Applicants see the BSDC bKash/Nagad number only after they sign in.
create or replace function public.mk_payment_instructions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  return jsonb_build_object(
    'bikash_number', bsdc.mk_setting('bikash_number'),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', code, 'orders', orders, 'price_poisha', price_poisha
      ) order by sort)
        from public.mk_credit_packages where is_active
    ), '[]'::jsonb),
    'delivery_fee_poisha', bsdc.mk_setting('delivery_fee_poisha')::bigint,
    'order_credit_price_poisha', bsdc.mk_setting('order_credit_price_poisha')::bigint
  );
end;
$$;

create or replace function public.mk_admin_set_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_uid text := bsdc.mk_require_uid();
begin
  perform bsdc.mk_require_staff_permission('marketplace.settings');
  if p_key = 'bikash_number' then
    if p_value !~ '^01[3-9][0-9]{8}$' then
      raise exception 'bKash number must be an 11-digit Bangladesh mobile number' using errcode = '22023';
    end if;
  elsif p_key in ('delivery_fee_poisha', 'order_credit_price_poisha') then
    if p_value !~ '^[0-9]{1,7}$' then
      raise exception 'amount must be a whole number of poisha' using errcode = '22023';
    end if;
  else
    raise exception 'unknown setting' using errcode = '22023';
  end if;

  update public.mk_settings
     set value = p_value, updated_by = v_uid, updated_at = now()
   where key = p_key;
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

create or replace function public.mk_admin_set_package(
  p_code text, p_orders integer, p_price_poisha bigint, p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('marketplace.settings');
  if p_orders <= 0 or p_price_poisha <= 0 then
    raise exception 'orders and price must be positive' using errcode = '22023';
  end if;
  update public.mk_credit_packages
     set orders = p_orders, price_poisha = p_price_poisha, is_active = p_is_active, updated_at = now()
   where code = p_code;
  if not found then
    raise exception 'unknown package' using errcode = '22023';
  end if;
  return jsonb_build_object('code', p_code, 'orders', p_orders, 'price_poisha', p_price_poisha);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Vendor application (wizard submit) and staff review
-- ---------------------------------------------------------------------------
create or replace function public.mk_submit_vendor_application(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid       text := bsdc.mk_require_uid();
  v_app_id    uuid;
  v_package   public.mk_credit_packages%rowtype;
  v_agreement text;
  v_agreements jsonb := coalesce(p -> 'agreements', '{}'::jsonb);
  v_required  text[] := array['terms', 'privacy', 'vendor_policy', 'cod_policy', 'self_delivery', 'accuracy'];
  v_type      text := p ->> 'vendor_type';
  v_lat       numeric := nullif(p ->> 'lat', '')::numeric;
  v_lng       numeric := nullif(p ->> 'lng', '')::numeric;
begin
  if exists (select 1 from public.mk_vendors where owner_uid = v_uid) then
    raise exception 'you already have a shop' using errcode = '23505';
  end if;
  if exists (select 1 from public.mk_vendor_applications where owner_uid = v_uid and status = 'submitted') then
    raise exception 'your application is already under review' using errcode = '23505';
  end if;

  foreach v_agreement in array v_required loop
    if coalesce((v_agreements ->> v_agreement)::boolean, false) is not true then
      raise exception 'every agreement must be accepted (missing %)', v_agreement using errcode = '22023';
    end if;
  end loop;

  if not bsdc.mk_valid_bd_point(v_lat, v_lng) then
    raise exception 'pin your shop location on the map inside Bangladesh' using errcode = '22023';
  end if;

  select * into v_package from public.mk_credit_packages
   where code = p ->> 'package_code' and is_active;
  if not found then
    raise exception 'choose a credit package' using errcode = '22023';
  end if;

  if v_type is null or v_type not in (select unnest(enum_range(null::bsdc_mk_vendor_type))::text) then
    raise exception 'choose a shop type' using errcode = '22023';
  end if;

  insert into public.mk_vendor_applications (
    owner_uid, full_name, shop_name, nid_number, mobile, vendor_type,
    address_line, lat, lng, place_label, trade_license_no,
    package_code, agreements, payment_sender, payment_holder, payment_txn_id
  ) values (
    v_uid,
    btrim(p ->> 'full_name'),
    btrim(p ->> 'shop_name'),
    btrim(p ->> 'nid_number'),
    btrim(p ->> 'mobile'),
    v_type::bsdc_mk_vendor_type,
    btrim(p ->> 'address_line'),
    v_lat, v_lng,
    left(coalesce(p ->> 'place_label', ''), 300),
    left(btrim(coalesce(p ->> 'trade_license_no', '')), 60),
    v_package.code,
    v_agreements,
    btrim(p ->> 'payment_sender'),
    btrim(p ->> 'payment_holder'),
    btrim(p ->> 'payment_txn_id')
  )
  returning id into v_app_id;

  insert into public.mk_credit_purchases (
    owner_uid, application_id, package_code, orders, price_poisha,
    sender_number, account_holder, txn_id
  ) values (
    v_uid, v_app_id, v_package.code, v_package.orders, v_package.price_poisha,
    btrim(p ->> 'payment_sender'), btrim(p ->> 'payment_holder'), btrim(p ->> 'payment_txn_id')
  );

  return jsonb_build_object('application_id', v_app_id, 'status', 'submitted');
exception
  when unique_violation then
    raise exception 'this transaction ID has already been used' using errcode = '23505';
end;
$$;

create or replace function public.mk_admin_list_applications(p_status text default 'submitted', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('marketplace.review');
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.submitted_at)
      from (
        select a.id, a.owner_uid, a.full_name, a.shop_name, a.nid_number, a.mobile,
               a.vendor_type, a.address_line, a.lat, a.lng, a.place_label,
               a.trade_license_no, a.package_code, a.agreements, a.payment_sender,
               a.payment_holder, a.payment_txn_id, a.status, a.review_note, a.submitted_at
          from public.mk_vendor_applications a
         where a.status::text = p_status
         order by a.submitted_at
         limit least(greatest(p_limit, 1), 200)
      ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.mk_admin_decide_application(
  p_application_id uuid, p_decision text, p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.mk_require_uid();
  v_app     public.mk_vendor_applications%rowtype;
  v_pkg     public.mk_credit_packages%rowtype;
  v_purchase public.mk_credit_purchases%rowtype;
  v_vendor_id uuid;
begin
  perform bsdc.mk_require_staff_permission('marketplace.review');
  select * into v_app from public.mk_vendor_applications where id = p_application_id for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'this application was already decided' using errcode = '22023';
  end if;

  select * into v_purchase from public.mk_credit_purchases
   where application_id = v_app.id and status = 'pending' for update;

  if p_decision = 'reject' then
    if char_length(btrim(coalesce(p_note, ''))) < 5 then
      raise exception 'write a reason of at least 5 characters' using errcode = '22023';
    end if;
    update public.mk_vendor_applications
       set status = 'rejected', review_note = left(p_note, 500),
           reviewed_by = v_uid, reviewed_at = now()
     where id = v_app.id;
    if found and v_purchase.id is not null then
      update public.mk_credit_purchases
         set status = 'rejected', review_note = left(p_note, 500),
             decided_by = v_uid, decided_at = now()
       where id = v_purchase.id;
    end if;
    return jsonb_build_object('application_id', v_app.id, 'status', 'rejected');
  elsif p_decision <> 'approve' then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v_pkg from public.mk_credit_packages where code = v_app.package_code;

  insert into public.mk_vendors (
    owner_uid, application_id, slug, name, vendor_type, mobile,
    address_line, lat, lng, place_label
  ) values (
    v_app.owner_uid, v_app.id,
    bsdc.mk_slugify(v_app.shop_name, 'shop'),
    v_app.shop_name, v_app.vendor_type, v_app.mobile,
    v_app.address_line, v_app.lat, v_app.lng, v_app.place_label
  )
  returning id into v_vendor_id;

  update public.mk_vendor_applications
     set status = 'approved', review_note = left(coalesce(p_note, ''), 500),
         reviewed_by = v_uid, reviewed_at = now()
   where id = v_app.id;

  if v_purchase.id is not null then
    update public.mk_credit_purchases
       set status = 'approved', vendor_id = v_vendor_id,
           decided_by = v_uid, decided_at = now()
     where id = v_purchase.id;
  end if;

  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, purchase_id, memo, actor_uid)
  values (
    v_vendor_id, 'purchase', v_pkg.orders, v_purchase.id,
    'Credit package ' || v_pkg.code, v_uid
  );

  return jsonb_build_object('application_id', v_app.id, 'status', 'approved', 'vendor_id', v_vendor_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Re-purchasing credits for an existing vendor, and staff approval
-- ---------------------------------------------------------------------------
create or replace function public.mk_vendor_buy_credits(
  p_package_code text, p_sender text, p_holder text, p_txn_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.mk_require_uid();
  v_vendor public.mk_vendors%rowtype;
  v_pkg    public.mk_credit_packages%rowtype;
  v_id     uuid;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = v_uid;
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  select * into v_pkg from public.mk_credit_packages where code = p_package_code and is_active;
  if not found then
    raise exception 'choose a credit package' using errcode = '22023';
  end if;
  if p_sender !~ '^01[3-9][0-9]{8}$' then
    raise exception 'sender number is not a valid mobile number' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_holder, ''))) < 2 or char_length(btrim(coalesce(p_txn_id, ''))) < 4 then
    raise exception 'account holder and transaction ID are required' using errcode = '22023';
  end if;

  insert into public.mk_credit_purchases (
    owner_uid, vendor_id, package_code, orders, price_poisha,
    sender_number, account_holder, txn_id
  ) values (
    v_uid, v_vendor.id, v_pkg.code, v_pkg.orders, v_pkg.price_poisha,
    p_sender, btrim(p_holder), btrim(p_txn_id)
  )
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'pending');
exception
  when unique_violation then
    raise exception 'this transaction ID has already been used' using errcode = '23505';
end;
$$;

create or replace function public.mk_admin_list_credit_purchases(p_status text default 'pending', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('marketplace.review');
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at)
      from (
        select p.id, p.owner_uid, p.vendor_id, p.package_code, p.orders, p.price_poisha,
               p.sender_number, p.account_holder, p.txn_id, p.status, p.created_at
          from public.mk_credit_purchases p
         where p.status::text = p_status
         order by p.created_at
         limit least(greatest(p_limit, 1), 200)
      ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.mk_admin_decide_credit_purchase(
  p_purchase_id uuid, p_decision text, p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
  v_p   public.mk_credit_purchases%rowtype;
begin
  perform bsdc.mk_require_staff_permission('marketplace.review');
  select * into v_p from public.mk_credit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'purchase not found' using errcode = 'P0002';
  end if;
  if v_p.status <> 'pending' then
    raise exception 'this purchase was already decided' using errcode = '22023';
  end if;
  if v_p.vendor_id is null then
    raise exception 'this purchase belongs to a vendor application; decide the application instead' using errcode = '22023';
  end if;

  if p_decision = 'reject' then
    if char_length(btrim(coalesce(p_note, ''))) < 5 then
      raise exception 'write a reason of at least 5 characters' using errcode = '22023';
    end if;
    update public.mk_credit_purchases
       set status = 'rejected', review_note = left(p_note, 500), decided_by = v_uid, decided_at = now()
     where id = v_p.id;
    return jsonb_build_object('purchase_id', v_p.id, 'status', 'rejected');
  elsif p_decision <> 'approve' then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;

  update public.mk_credit_purchases
     set status = 'approved', decided_by = v_uid, decided_at = now()
   where id = v_p.id;

  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, purchase_id, memo, actor_uid)
  values (v_p.vendor_id, 'purchase', v_p.orders, v_p.id, 'Credit package ' || v_p.package_code, v_uid);

  return jsonb_build_object('purchase_id', v_p.id, 'status', 'approved');
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Vendor shop profile, categories, and products
-- ---------------------------------------------------------------------------
create or replace function public.mk_vendor_update_profile(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
  v_vendor public.mk_vendors%rowtype;
  v_logo  text := coalesce(p ->> 'logo_url', '');
  v_cover text := coalesce(p ->> 'cover_url', '');
begin
  select * into v_vendor from public.mk_vendors where owner_uid = v_uid for update;
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  if v_logo <> '' and v_logo !~ '^https://' then
    raise exception 'logo must be an https image link' using errcode = '22023';
  end if;
  if v_cover <> '' and v_cover !~ '^https://' then
    raise exception 'cover must be an https image link' using errcode = '22023';
  end if;
  if p ? 'mobile' and (p ->> 'mobile') !~ '^01[3-9][0-9]{8}$' then
    raise exception 'mobile must be an 11-digit Bangladesh number' using errcode = '22023';
  end if;

  update public.mk_vendors
     set description = coalesce(left(p ->> 'description', 1000), description),
         logo_url    = case when p ? 'logo_url' then v_logo else logo_url end,
         cover_url   = case when p ? 'cover_url' then v_cover else cover_url end,
         mobile      = coalesce(p ->> 'mobile', mobile)
   where id = v_vendor.id;

  return jsonb_build_object('vendor_id', v_vendor.id, 'slug', v_vendor.slug);
end;
$$;

create or replace function public.mk_vendor_save_category(p_id uuid, p_name text, p_sort integer default 0)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor_id uuid := bsdc.mk_my_vendor_id();
  v_id uuid;
begin
  if v_vendor_id is null then
    raise exception 'only an active vendor can manage categories' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.mk_categories (vendor_id, name, sort)
    values (v_vendor_id, btrim(p_name), p_sort)
    returning id into v_id;
  else
    update public.mk_categories
       set name = btrim(p_name), sort = p_sort
     where id = p_id and vendor_id = v_vendor_id
    returning id into v_id;
    if v_id is null then
      raise exception 'category not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'a category with this name already exists' using errcode = '23505';
end;
$$;

-- Create or update a product. Images must be https links (ImgBB via the app).
create or replace function public.mk_vendor_save_product(p_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor_id uuid := bsdc.mk_my_vendor_id();
  v_images    text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p -> 'images', '[]'::jsonb))), '{}'
  );
  v_img       text;
  v_id        uuid;
  v_status    text := coalesce(p ->> 'status', 'draft');
  v_category  uuid := nullif(p ->> 'category_id', '')::uuid;
begin
  if v_vendor_id is null then
    raise exception 'only an active vendor can manage products' using errcode = '42501';
  end if;
  foreach v_img in array v_images loop
    if v_img !~ '^https://' then
      raise exception 'product images must be https links' using errcode = '22023';
    end if;
  end loop;
  if v_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid product status' using errcode = '22023';
  end if;
  if v_category is not null and not exists (
    select 1 from public.mk_categories c where c.id = v_category and c.vendor_id = v_vendor_id
  ) then
    raise exception 'category does not belong to your shop' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.mk_products (
      vendor_id, category_id, slug, name, description, price_poisha, stock, images, status
    ) values (
      v_vendor_id, v_category,
      bsdc.mk_slugify(p ->> 'name', 'product'),
      btrim(p ->> 'name'),
      coalesce(left(p ->> 'description', 2000), ''),
      (p ->> 'price_poisha')::bigint,
      coalesce((p ->> 'stock')::integer, 0),
      v_images,
      v_status::bsdc_mk_product_status
    )
    returning id into v_id;
  else
    update public.mk_products
       set category_id = v_category,
           name = btrim(p ->> 'name'),
           description = coalesce(left(p ->> 'description', 2000), description),
           price_poisha = (p ->> 'price_poisha')::bigint,
           stock = coalesce((p ->> 'stock')::integer, stock),
           images = case when p ? 'images' then v_images else images end,
           status = case when p ? 'status' then v_status::bsdc_mk_product_status else status end
     where id = p_id and vendor_id = v_vendor_id
    returning id into v_id;
    if v_id is null then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.mk_vendor_restock(p_product_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor_id uuid := bsdc.mk_my_vendor_id();
  v_stock     integer;
begin
  if v_vendor_id is null then
    raise exception 'only an active vendor can change stock' using errcode = '42501';
  end if;
  update public.mk_products
     set stock = stock + p_delta
   where id = p_product_id and vendor_id = v_vendor_id and stock + p_delta >= 0
  returning stock into v_stock;
  if v_stock is null then
    raise exception 'stock cannot go below zero, or the product is not yours' using errcode = '22023';
  end if;
  return v_stock;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Public browsing: listed vendors, shop pages, product pages
-- ---------------------------------------------------------------------------
-- Only vendors with credits > 0 are listed. Distance is included when the
-- caller sends a location, and results are ordered nearest first.
create or replace function public.mk_list_vendors(
  p_type text default null,
  p_query text default '',
  p_lat numeric default null,
  p_lng numeric default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.distance_km nulls last, x.name)
      from (
        select v.slug, v.name, v.vendor_type, v.logo_url, v.cover_url, v.place_label,
               v.lat, v.lng,
               case when bsdc.mk_valid_bd_point(p_lat, p_lng)
                    then bsdc.mk_km(p_lat, p_lng, v.lat, v.lng) end as distance_km,
               (select count(*)::int from public.mk_products pr
                 where pr.vendor_id = v.id and pr.status = 'active') as product_count,
               coalesce((select round(avg(r.rating), 1) from public.mk_reviews r
                          where r.vendor_id = v.id), 0) as rating,
               (select count(*)::int from public.mk_reviews r where r.vendor_id = v.id) as review_count
          from public.mk_vendors v
         where v.status = 'active'
           and bsdc.mk_vendor_credits(v.id) > 0
           and (p_type is null or p_type = '' or v.vendor_type::text = p_type)
           and (
             btrim(coalesce(p_query, '')) = ''
             or v.name ilike '%' || btrim(p_query) || '%'
             or v.place_label ilike '%' || btrim(p_query) || '%'
           )
         limit least(greatest(p_limit, 1), 100)
      ) x
  ), '[]'::jsonb);
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
      'lat', v_vendor.lat, 'lng', v_vendor.lng
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

create or replace function public.mk_product_detail(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_product public.mk_products%rowtype;
  v_vendor  public.mk_vendors%rowtype;
begin
  select * into v_product from public.mk_products where id = p_product_id and status = 'active';
  if not found then
    raise exception 'this product is not available' using errcode = 'P0002';
  end if;
  select * into v_vendor from public.mk_vendors where id = v_product.vendor_id and status = 'active';
  if not found or bsdc.mk_vendor_credits(v_vendor.id) <= 0 then
    raise exception 'this product is not available' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v_product.id, 'name', v_product.name, 'description', v_product.description,
    'price_poisha', v_product.price_poisha, 'in_stock', v_product.stock > 0,
    'stock', least(v_product.stock, 50), 'images', to_jsonb(v_product.images),
    'vendor', jsonb_build_object('slug', v_vendor.slug, 'name', v_vendor.name),
    'rating', coalesce((
      select round(avg(r.rating), 1) from public.mk_reviews r
        join public.mk_orders o on o.id = r.order_id
       where o.vendor_id = v_vendor.id
    ), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Cart (customer)
-- ---------------------------------------------------------------------------
create or replace function public.mk_cart_set(p_product_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
  v_product public.mk_products%rowtype;
begin
  if p_qty < 0 or p_qty > 50 then
    raise exception 'quantity must be between 0 and 50' using errcode = '22023';
  end if;
  if p_qty = 0 then
    delete from public.mk_cart_items where customer_uid = v_uid and product_id = p_product_id;
    return 0;
  end if;
  select * into v_product from public.mk_products where id = p_product_id and status = 'active';
  if not found or not bsdc.mk_vendor_is_listed(v_product.vendor_id) then
    raise exception 'this product is not available' using errcode = 'P0002';
  end if;
  insert into public.mk_cart_items (customer_uid, product_id, qty)
  values (v_uid, p_product_id, p_qty)
  on conflict (customer_uid, product_id)
  do update set qty = excluded.qty, updated_at = now();
  return p_qty;
end;
$$;

create or replace function public.mk_my_cart()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_uid text := bsdc.mk_require_uid();
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.vendor_name, x.product_name)
      from (
        select c.product_id, c.qty,
               pr.name as product_name, pr.price_poisha, pr.stock,
               pr.status::text as product_status,
               (pr.status = 'active' and pr.stock >= c.qty
                 and bsdc.mk_vendor_is_listed(v.id)) as orderable,
               v.id as vendor_id, v.slug as vendor_slug, v.name as vendor_name,
               (pr.price_poisha * c.qty) as line_total,
               coalesce(pr.images[1], '') as image_url
          from public.mk_cart_items c
          join public.mk_products pr on pr.id = c.product_id
          join public.mk_vendors v on v.id = pr.vendor_id
         where c.customer_uid = v_uid
      ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Placing an order (cash on delivery)
-- ---------------------------------------------------------------------------
-- p_items: null means "use my cart for this vendor"; otherwise a direct order:
--   [{"product_id": "...", "qty": 2}, ...]
-- p_address: {customer_name, customer_phone, address_line, landmark, lat, lng,
--             place_label, note}
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
  delete from _mk_order_lines;

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

-- ---------------------------------------------------------------------------
-- 16. Order lifecycle
-- ---------------------------------------------------------------------------
-- Allowed transitions. A vendor may cancel before delivery; the customer may
-- cancel only while the order is still placed.
create or replace function bsdc.mk_transition_allowed(p_from bsdc_mk_order_status, p_to bsdc_mk_order_status)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = 'placed' and p_to in ('accepted', 'cancelled') then true
    when p_from = 'accepted' and p_to in ('packaged', 'cancelled') then true
    when p_from = 'packaged' and p_to in ('out_for_delivery', 'cancelled') then true
    when p_from = 'out_for_delivery' and p_to in ('delivered', 'cancelled') then true
    else false
  end
$$;

create or replace function bsdc.mk_restock(p_order_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  update public.mk_products pr
     set stock = pr.stock + oi.qty
    from public.mk_order_items oi
   where oi.order_id = p_order_id and oi.product_id = pr.id
$$;

-- Vendor moves an order forward, or declines/cancels it.
-- Accepting consumes exactly one order credit, once per order.
create or replace function public.mk_vendor_set_order_status(
  p_order_id uuid, p_next text, p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.mk_require_uid();
  v_vendor  public.mk_vendors%rowtype;
  v_order   public.mk_orders%rowtype;
  v_next    bsdc_mk_order_status;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = v_uid and status = 'active';
  if not found then
    raise exception 'only an active vendor can update orders' using errcode = '42501';
  end if;

  select * into v_order from public.mk_orders where id = p_order_id for update;
  if not found or v_order.vendor_id <> v_vendor.id then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  begin
    v_next := p_next::bsdc_mk_order_status;
  exception when invalid_text_representation then
    raise exception 'unknown status' using errcode = '22023';
  end;

  if not bsdc.mk_transition_allowed(v_order.status, v_next) then
    raise exception 'an order cannot move from % to %', v_order.status, v_next using errcode = '22023';
  end if;

  if v_next = 'cancelled' and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason for cancelling' using errcode = '22023';
  end if;

  if v_next = 'accepted' and not v_order.credit_charged then
    -- Serialise credit use per vendor so two accepts cannot both spend the last credit.
    perform pg_advisory_xact_lock(hashtextextended('bsdc.mk_credits:' || v_vendor.id::text, 0));
    if bsdc.mk_vendor_credits(v_vendor.id) < 1 then
      raise exception 'you have no order credits left. Buy a package to accept orders.' using errcode = 'P0001';
    end if;
    insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, order_id, memo, actor_uid)
    values (v_vendor.id, 'order', -1, v_order.id, v_order.code, v_uid);
  end if;

  update public.mk_orders
     set status = v_next,
         credit_charged = credit_charged or (v_next = 'accepted'),
         accepted_at   = case when v_next = 'accepted' then now() else accepted_at end,
         packaged_at   = case when v_next = 'packaged' then now() else packaged_at end,
         out_at        = case when v_next = 'out_for_delivery' then now() else out_at end,
         delivered_at  = case when v_next = 'delivered' then now() else delivered_at end,
         cancelled_at  = case when v_next = 'cancelled' then now() else cancelled_at end,
         cancelled_by  = case when v_next = 'cancelled' then 'vendor' else cancelled_by end,
         cancel_reason = case when v_next = 'cancelled' then left(p_reason, 300) else cancel_reason end
   where id = v_order.id;

  if v_next = 'cancelled' then
    perform bsdc.mk_restock(v_order.id);
  end if;

  insert into public.mk_order_events (order_id, status, actor_uid, note)
  values (v_order.id, v_next, v_uid, left(coalesce(p_reason, ''), 300));

  return jsonb_build_object(
    'order_id', v_order.id, 'status', v_next,
    'credits_left', bsdc.mk_vendor_credits(v_vendor.id)
  );
end;
$$;

create or replace function public.mk_customer_cancel_order(p_order_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.mk_require_uid();
  v_order public.mk_orders%rowtype;
begin
  select * into v_order from public.mk_orders where id = p_order_id for update;
  if not found or v_order.customer_uid <> v_uid then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'placed' then
    raise exception 'the shop has already accepted this order and it can no longer be cancelled by you'
      using errcode = '22023';
  end if;

  update public.mk_orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
         cancel_reason = left(coalesce(p_reason, ''), 300)
   where id = v_order.id;
  perform bsdc.mk_restock(v_order.id);

  insert into public.mk_order_events (order_id, status, actor_uid, note)
  values (v_order.id, 'cancelled', v_uid, left(coalesce(p_reason, ''), 300));

  return jsonb_build_object('order_id', v_order.id, 'status', 'cancelled');
end;
$$;

-- What the vendor sees: the order, the customer's contact and location, and items.
create or replace function public.mk_vendor_orders(p_status text default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor public.mk_vendors%rowtype;
begin
  select * into v_vendor from public.mk_vendors
   where owner_uid = bsdc.current_uid() and status = 'active';
  if not found then
    raise exception 'only an active vendor can view orders' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'code', o.code, 'status', o.status,
      'subtotal_poisha', o.subtotal_poisha, 'delivery_fee_poisha', o.delivery_fee_poisha,
      'total_poisha', o.total_poisha, 'payment_method', o.payment_method,
      'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
      'address_line', o.address_line, 'landmark', o.landmark,
      'lat', o.lat, 'lng', o.lng, 'place_label', o.place_label, 'note', o.note,
      'cancel_reason', o.cancel_reason, 'cancelled_by', o.cancelled_by,
      'placed_at', o.placed_at, 'accepted_at', o.accepted_at,
      'delivered_at', o.delivered_at,
      'distance_km', bsdc.mk_km(v_vendor.lat, v_vendor.lng, o.lat, o.lng),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty,
                                            'unit_price', i.unit_price, 'line_total', i.line_total,
                                            'image_url', i.image_url)
                          order by i.name)
          from public.mk_order_items i where i.order_id = o.id
      ), '[]'::jsonb)
    ) order by o.placed_at desc)
      from (
        select * from public.mk_orders
         where vendor_id = v_vendor.id
           and (p_status is null or p_status = '' or status::text = p_status)
         order by placed_at desc
         limit least(greatest(p_limit, 1), 200)
      ) o
  ), '[]'::jsonb);
end;
$$;

create or replace function public.mk_my_orders(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_uid text := bsdc.mk_require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'code', o.code, 'status', o.status,
      'total_poisha', o.total_poisha, 'delivery_fee_poisha', o.delivery_fee_poisha,
      'placed_at', o.placed_at, 'delivered_at', o.delivered_at,
      'vendor', jsonb_build_object('slug', v.slug, 'name', v.name, 'logo_url', v.logo_url),
      'reviewed', exists (select 1 from public.mk_reviews r where r.order_id = o.id),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'line_total', i.line_total,
                                            'image_url', i.image_url))
          from public.mk_order_items i where i.order_id = o.id
      ), '[]'::jsonb)
    ) order by o.placed_at desc)
      from (
        select * from public.mk_orders where customer_uid = v_uid
         order by placed_at desc limit least(greatest(p_limit, 1), 100)
      ) o
      join public.mk_vendors v on v.id = o.vendor_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. Reviews: only after delivery, once per order
-- ---------------------------------------------------------------------------
create or replace function public.mk_submit_review(p_order_id uuid, p_rating integer, p_body text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid   text := bsdc.mk_require_uid();
  v_order public.mk_orders%rowtype;
  v_id    uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;
  select * into v_order from public.mk_orders where id = p_order_id;
  if not found or v_order.customer_uid <> v_uid then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'you can review an order only after it has been delivered' using errcode = '22023';
  end if;

  insert into public.mk_reviews (order_id, vendor_id, customer_uid, rating, body)
  values (v_order.id, v_order.vendor_id, v_uid, p_rating, left(coalesce(p_body, ''), 600))
  returning id into v_id;

  return jsonb_build_object('review_id', v_id, 'rating', p_rating);
exception
  when unique_violation then
    raise exception 'you have already reviewed this order' using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. Vendor dashboard
-- ---------------------------------------------------------------------------
create or replace function public.mk_vendor_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid    text := bsdc.mk_require_uid();
  v_vendor public.mk_vendors%rowtype;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = v_uid;
  if not found then
    return jsonb_build_object('has_shop', false);
  end if;
  return jsonb_build_object(
    'has_shop', true,
    'vendor', jsonb_build_object(
      'slug', v_vendor.slug, 'name', v_vendor.name, 'status', v_vendor.status,
      'vendor_type', v_vendor.vendor_type, 'logo_url', v_vendor.logo_url,
      'cover_url', v_vendor.cover_url, 'description', v_vendor.description,
      'mobile', v_vendor.mobile, 'place_label', v_vendor.place_label
    ),
    'credits', bsdc.mk_vendor_credits(v_vendor.id),
    'listed', v_vendor.status = 'active' and bsdc.mk_vendor_credits(v_vendor.id) > 0,
    'orders_pending', (select count(*)::int from public.mk_orders
                        where vendor_id = v_vendor.id and status = 'placed'),
    'orders_today', (select count(*)::int from public.mk_orders
                      where vendor_id = v_vendor.id and placed_at >= date_trunc('day', now())),
    'delivered_poisha', coalesce((select sum(subtotal_poisha) from public.mk_orders
                                   where vendor_id = v_vendor.id and status = 'delivered'), 0),
    'rating', coalesce((select round(avg(rating), 1) from public.mk_reviews where vendor_id = v_vendor.id), 0),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'package_code', p.package_code,
                                          'orders', p.orders, 'status', p.status,
                                          'created_at', p.created_at)
                        order by p.created_at desc)
        from public.mk_credit_purchases p where p.vendor_id = v_vendor.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Grants: RPCs only. Public browsing is anon-safe; everything else needs sign-in.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'bsdc') and p.proname like 'mk\_%' escape '\'
  loop
    execute format('revoke all on function %s from public', r.sig);
  end loop;
end $$;

grant execute on function bsdc.mk_owns_vendor(uuid) to authenticated;

grant execute on function public.mk_list_vendors(text, text, numeric, numeric, integer) to anon, authenticated;
grant execute on function public.mk_vendor_page(text) to anon, authenticated;
grant execute on function public.mk_product_detail(uuid) to anon, authenticated;

grant execute on function
  public.mk_payment_instructions(),
  public.mk_submit_vendor_application(jsonb),
  public.mk_vendor_buy_credits(text, text, text, text),
  public.mk_vendor_update_profile(jsonb),
  public.mk_vendor_save_category(uuid, text, integer),
  public.mk_vendor_save_product(uuid, jsonb),
  public.mk_vendor_restock(uuid, integer),
  public.mk_vendor_orders(text, integer),
  public.mk_vendor_dashboard(),
  public.mk_vendor_set_order_status(uuid, text, text),
  public.mk_cart_set(uuid, integer),
  public.mk_my_cart(),
  public.mk_place_order(uuid, jsonb, jsonb),
  public.mk_customer_cancel_order(uuid, text),
  public.mk_my_orders(integer),
  public.mk_submit_review(uuid, integer, text),
  public.mk_admin_list_applications(text, integer),
  public.mk_admin_decide_application(uuid, text, text),
  public.mk_admin_list_credit_purchases(text, integer),
  public.mk_admin_decide_credit_purchase(uuid, text, text),
  public.mk_admin_set_setting(text, text),
  public.mk_admin_set_package(text, integer, bigint, boolean)
  to authenticated;
