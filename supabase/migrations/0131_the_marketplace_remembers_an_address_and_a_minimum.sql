-- The marketplace learns two things a shopfront cannot do without: where a member lives, and
-- what an order has to be worth.
--
-- 0094 made a checkout type its address every single time — name, mobile, house, landmark, a pin
-- dragged onto a map — and threw all of it away one order later, keeping only a copy on the order
-- row. Nobody re-orders from one shop a week and wants to redraw that. So the address becomes a
-- row of its own that the member edits once and picks thereafter, and the shop gains the one
-- commercial rule it could not state before: a minimum order, in taka, below which an order is
-- not worth accepting.
--
-- Four decisions in here are worth reading before the code:
--
--   1. `mk_place_order` takes `p_address_id` and reads the address back from the table; it does
--      not accept a client's copy of a saved address. The pin decides the delivery fee, the
--      radius test, and where the shop sends a rider, so it must be the pin the member approved
--      and not a field some screen last felt like sending. The `note` is still typed per order —
--      it describes the doorstep's moment, not the doorstep.
--   2. A minimum order is enforced in the routine after the goods are priced from the database,
--      never in a screen before it, and it is compared against `subtotal_poisha` rather than the
--      total. A client-side gate alone is a suggestion; and a ৳150 ride must not be able to carry
--      a ৳200 basket past a ৳300 minimum.
--   3. Money is poisha in a `bigint`, here too, and the setter speaks whole taka — the same
--      shape as `mk_vendor_set_delivery` and every other price on these tables, so no screen ever
--      rounds a fraction of a taka on a member's behalf.
--   4. `mk_addresses` is readable by its owner directly and put in the realtime publication,
--      exactly as `mk_orders` was in 0094, because an address added on a phone should be on the
--      laptop's checkout before that checkout has finished loading. Writes still go through the
--      RPCs: a policy makes a row visible, it does not make it valid.
--
-- The read model grows by one key inside `bsdc.mk_delivery_json`, which every shop surface already
-- calls, so `mk_vendor_page`, `mk_product_detail` and `mk_vendor_delivery` all learn the minimum
-- without a single new query and cannot disagree about it.

-- ============================================================================
-- 1. The shop's minimum order
-- ============================================================================

alter table public.mk_vendors
  add column if not exists min_order_poisha bigint not null default 0
    check (min_order_poisha between 0 and 100000000);

comment on column public.mk_vendors.min_order_poisha is
  'What a basket of goods must reach, in poisha, before this shop accepts the order. Zero means '
  'the shop sets no minimum. Compared against subtotal_poisha in mk_place_order — the delivery '
  'charge is not something the customer bought, so it never closes a shortfall.';

-- ============================================================================
-- 2. The member's address book
-- ============================================================================

create table if not exists public.mk_addresses (
  id              uuid primary key default gen_random_uuid(),
  customer_uid    text not null references public.profiles (uid) on delete cascade,
  -- A fixed label for the chip, and a free nickname for the card: people name a doorstep
  -- ("Ammu's flat") far more than they classify it, but a screen still needs one of the
  -- three icons to draw.
  label           text not null default 'home' check (label in ('home', 'work', 'other')),
  nickname        text not null default '' check (char_length(nickname) <= 40),
  recipient_name  text not null check (char_length(btrim(recipient_name)) between 2 and 80),
  phone           text not null check (phone ~ '^01[3-9][0-9]{8}$'),
  address_line    text not null check (char_length(btrim(address_line)) between 5 and 240),
  landmark        text not null default '' check (char_length(landmark) <= 160),
  place_label     text not null default '' check (char_length(place_label) <= 300),
  lat             numeric(9, 6) not null check (lat between 20.5 and 26.7),
  lng             numeric(9, 6) not null check (lng between 88.0 and 92.7),
  note            text not null default '' check (char_length(note) <= 300),
  is_default      boolean not null default false,
  times_used      integer not null default 0 check (times_used between 0 and 1000000),
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One default per member, in a partial unique index: a plain column constraint could not say
-- "at most one row *where* this is true", and a second default is not a warning but a bug —
-- two screens would then each pick a different one and order to a different door.
create unique index if not exists mk_addresses_one_default_idx
  on public.mk_addresses (customer_uid) where is_default;
create index if not exists mk_addresses_owner_idx on public.mk_addresses (
  customer_uid, is_default desc, last_used_at desc nulls last, created_at desc
);

alter table public.mk_addresses enable row level security;

-- Reads only, and only the owner's own rows: the checkout on the phone and the checkout in the
-- browser must see the same book, and both are the same member. Writes are absent from the grant
-- list on purpose — every write goes through mk_save_address / mk_delete_address below, which is
-- where the checks that a policy cannot express live (the phone pattern, the pin inside
-- Bangladesh, one default at a time, eight doors per member).
grant select on public.mk_addresses to authenticated;
revoke all on public.mk_addresses from anon;

drop policy if exists mk_addresses_read_owner on public.mk_addresses;
create policy mk_addresses_read_owner on public.mk_addresses
  for select to authenticated
  using (customer_uid = bsdc.current_uid());

drop policy if exists mk_addresses_deny_direct_write on public.mk_addresses;
create policy mk_addresses_deny_direct_write on public.mk_addresses
  for all to public
  using (false) with check (false);

drop trigger if exists mk_addresses_touch on public.mk_addresses;
create trigger mk_addresses_touch before update on public.mk_addresses
  for each row execute function bsdc.touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mk_addresses'
     ) then
    execute 'alter publication supabase_realtime add table public.mk_addresses';
  end if;
end
$$;

-- The order remembers which saved door it went to. The text is copied onto the order row
-- regardless (a shop must still be able to deliver an order whose address was later deleted),
-- and the id rides along on delete set null so a member can clear their book without taking an
-- order's history with it.
alter table public.mk_orders
  add column if not exists address_id uuid references public.mk_addresses (id) on delete set null;

comment on column public.mk_orders.address_id is
  'The saved address this order was delivered to, when the member had one. Nullable and not '
  'enforced: an order typed by hand, or placed by a client older than 0131, has no book entry.';

-- ============================================================================
-- 3. One shape for an address, wherever it is read
-- ============================================================================

create or replace function bsdc.mk_address_json(v_address public.mk_addresses)
returns jsonb
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', v_address.id,
    'label', v_address.label,
    'nickname', v_address.nickname,
    'customer_name', v_address.recipient_name,
    'customer_phone', v_address.phone,
    'address_line', v_address.address_line,
    'landmark', v_address.landmark,
    'place_label', v_address.place_label,
    'lat', v_address.lat,
    'lng', v_address.lng,
    'note', v_address.note,
    'is_default', v_address.is_default,
    'times_used', v_address.times_used,
    'last_used_at', v_address.last_used_at,
    'created_at', v_address.created_at
  )
$$;

-- A book with a door in it always has one marked default, because a checkout that has to ask
-- "which address?" for a member who owns exactly one address has already lost the point of
-- saving them. Both routines below end by calling this, so the invariant is stated once: the
-- title is handed to the most recently used door, and with no usage yet to the newest saved one.
-- Deleting the default and editing the default off are the same question.
create or replace function bsdc.mk_ensure_default(p_uid text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if exists (select 1 from public.mk_addresses where customer_uid = p_uid)
     and not exists (
       select 1 from public.mk_addresses where customer_uid = p_uid and is_default
     ) then
    update public.mk_addresses
       set is_default = true
     where id = (
       select id from public.mk_addresses
        where customer_uid = p_uid
        order by last_used_at desc nulls last, created_at desc
        limit 1
     );
  end if;
end;
$$;

-- ============================================================================
-- 4. The address book's three routines
-- ============================================================================

create or replace function public.mk_my_addresses()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_uid text := bsdc.mk_require_uid();
begin
  return coalesce((
    select jsonb_agg(bsdc.mk_address_json(a) order by a.is_default desc,
                                            a.last_used_at desc nulls last,
                                            a.created_at desc)
      from public.mk_addresses a
     where a.customer_uid = v_uid
  ), '[]'::jsonb);
end;
$$;

-- Insert or update, by whether an id was given. Every check that a policy cannot express is
-- here, and `mk_place_order` trusts the row precisely because only this function can write one.
create or replace function public.mk_save_address(
  p_id             uuid,
  p_label          text,
  p_nickname       text,
  p_recipient_name text,
  p_phone          text,
  p_address_line   text,
  p_landmark       text,
  p_place_label    text,
  p_lat            numeric,
  p_lng            numeric,
  p_note           text,
  p_is_default     boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.mk_require_uid();
  v_id      uuid := p_id;
  v_count   integer;
  v_name    text := btrim(coalesce(p_recipient_name, ''));
  v_line    text := btrim(coalesce(p_address_line, ''));
  v_phone   text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_label   text := lower(btrim(coalesce(p_label, 'home')));
  v_row     public.mk_addresses%rowtype;
begin
  if p_label is not null and v_label not in ('home', 'work', 'other') then
    raise exception 'choose home, work or other' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'enter the name of the person receiving the order' using errcode = '22023';
  end if;
  -- The same shape the order itself demands (0094) and the same leniency: spaces, dashes and
  -- brackets are stripped, because a member types 01712-345678 and means it.
  if v_phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'enter an 11-digit Bangladesh mobile number' using errcode = '22023';
  end if;
  if char_length(v_line) < 5 or char_length(v_line) > 240 then
    raise exception 'write the delivery address (5 to 240 characters)' using errcode = '22023';
  end if;
  if not bsdc.mk_valid_bd_point(p_lat, p_lng) then
    raise exception 'pin the delivery location on the map' using errcode = '22023';
  end if;

  -- Exactly one default: claimed here, and again by the partial unique index, because two
  -- screens would otherwise each pick a different door and each be sure it was the one asked
  -- for. It happens before the row is written, since a second default is a unique violation on
  -- the way in and there is no rollback a member would ever see.
  if coalesce(p_is_default, false) then
    update public.mk_addresses
       set is_default = false
     where customer_uid = v_uid and is_default
       -- Re-saving the address that is already the default must leave it the default. Clearing it
       -- first and re-asserting it in the same call reads as the same answer, but it is not: the
       -- update path below keeps `is_default` from the row only when the call says nothing, so a
       -- form that ticks the box for the row that already has it would otherwise clear the flag and
       -- mk_ensure_default would hand the title to somebody else.
       and id is distinct from v_id;
  end if;

  if v_id is null then
    select count(*) into v_count from public.mk_addresses where customer_uid = v_uid;
    if v_count >= 8 then
      raise exception 'you can save up to 8 addresses' using errcode = '22023';
    end if;
    -- The first address is the default whether or not anybody asked: a member who has saved one
    -- door has no way to mean any other, and a checkout that has to ask "which one?" the first
    -- time has already lost the point of saving it.
    if v_count = 0 then
      p_is_default := true;
    end if;
    insert into public.mk_addresses (
      customer_uid, label, nickname, recipient_name, phone, address_line, landmark,
      place_label, lat, lng, note, is_default
    ) values (
      v_uid, v_label, left(btrim(coalesce(p_nickname, '')), 40), v_name, v_phone, v_line,
      left(btrim(coalesce(p_landmark, '')), 160),
      left(btrim(coalesce(p_place_label, '')), 300),
      p_lat, p_lng,
      left(btrim(coalesce(p_note, '')), 300),
      coalesce(p_is_default, false)
    )
    returning id into v_id;
  else
    if not exists (
      select 1 from public.mk_addresses where id = v_id and customer_uid = v_uid
    ) then
      raise exception 'that saved address is not yours' using errcode = 'P0002';
    end if;
    update public.mk_addresses
       set label = v_label,
           nickname = left(btrim(coalesce(p_nickname, '')), 40),
           recipient_name = v_name,
           phone = v_phone,
           address_line = v_line,
           landmark = left(btrim(coalesce(p_landmark, '')), 160),
           place_label = left(btrim(coalesce(p_place_label, '')), 300),
           lat = p_lat,
           lng = p_lng,
           note = left(btrim(coalesce(p_note, '')), 300),
           -- The clear above only ran when this call claimed the title, so a plain "keep what
           -- it was" is correct here: an edit that says nothing about defaults leaves the row's
           -- own flag alone.
           is_default = coalesce(p_is_default, is_default)
     where id = v_id and customer_uid = v_uid;
  end if;

  perform bsdc.mk_ensure_default(v_uid);

  select * into v_row from public.mk_addresses where id = v_id;
  return jsonb_build_object(
    'address', bsdc.mk_address_json(v_row),
    'addresses', public.mk_my_addresses()
  );
end;
$$;

create or replace function public.mk_delete_address(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
  v_was_default boolean;
begin
  select is_default into v_was_default
    from public.mk_addresses
   where id = p_id and customer_uid = v_uid;
  if not found then
    raise exception 'that saved address is not yours' using errcode = 'P0002';
  end if;

  delete from public.mk_addresses where id = p_id and customer_uid = v_uid;

  -- Deleting the default must not leave the book without one, or the next checkout starts from
  -- nothing for the sin of tidying up; the same rule the save follows.
  perform bsdc.mk_ensure_default(v_uid);

  -- `was_default` is the one piece of news a screen cannot derive for itself after the row is
  -- gone: it is what tells the checkout to move its selection rather than keep pointing at
  -- nothing.
  return jsonb_build_object(
    'deleted', p_id,
    'was_default', coalesce(v_was_default, false),
    'addresses', public.mk_my_addresses()
  );
end;
$$;

-- ============================================================================
-- 5. The shop's minimum, saved on its own
-- ============================================================================

-- Its own routine rather than a new argument on mk_vendor_set_delivery, for the reason 0128 ran
-- into with the listing editors: one button that writes two rules through one call is fine, but a
-- call that grows an argument grows every caller, and a shop's minimum is a commercial rule, not
-- a property of its delivery area. Zero is a real answer ("no minimum"), so the setter has to be
-- the place that distinguishes 0 from absent.
create or replace function public.mk_vendor_set_min_order(p_taka integer)
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
  if p_taka is null or p_taka < 0 or p_taka > 1000000 then
    raise exception 'the minimum order must be between 0 and 1000000 taka' using errcode = '22023';
  end if;

  update public.mk_vendors
     set min_order_poisha = p_taka::bigint * 100,
         updated_at = now()
   where id = v_vendor.id;

  return jsonb_build_object('min_order_poisha', p_taka::bigint * 100, 'taka', p_taka);
end;
$$;

-- ============================================================================
-- 6. The read models, and the order itself
-- ============================================================================

create or replace function bsdc.mk_delivery_json(v_vendor public.mk_vendors)
returns jsonb
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select jsonb_build_object(
    'scope', v_vendor.delivery_scope,
    'radius_km', v_vendor.delivery_radius_km,
    'fee_mode', v_vendor.delivery_fee_mode,
    'fee_poisha', case
      when v_vendor.delivery_fee_mode = 'fixed' then v_vendor.delivery_fee_poisha
      else bsdc.mk_default_delivery_fee_poisha()
    end,
    'fixed_fee_poisha', v_vendor.delivery_fee_poisha,
    'per_km_rate_poisha', v_vendor.delivery_per_km_poisha,
    'default_fee_poisha', bsdc.mk_default_delivery_fee_poisha(),
    'center_lat', coalesce(v_vendor.delivery_lat, v_vendor.lat),
    'center_lng', coalesce(v_vendor.delivery_lng, v_vendor.lng),
    'min_order_poisha', v_vendor.min_order_poisha
  )
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
                 and bsdc.mk_vendor_is_listed(v.id)
                 and coalesce((bsdc.mk_schedule_status(v.opening_schedule_enabled, v.opening_schedule) ->> 'is_open')::boolean, true)
               ) as orderable,
               v.id as vendor_id, v.slug as vendor_slug, v.name as vendor_name,
               v.min_order_poisha,
               coalesce((bsdc.mk_schedule_status(v.opening_schedule_enabled, v.opening_schedule) ->> 'is_open')::boolean, true) as vendor_open,
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


drop function if exists public.mk_place_order(uuid, jsonb, jsonb);

create or replace function public.mk_place_order(
  p_vendor_id  uuid,
  p_address    jsonb,
  p_items      jsonb default null,
  p_address_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid        text := bsdc.mk_require_uid();
  v_vendor     public.mk_vendors%rowtype;
  v_sched      jsonb;
  v_order_id   uuid;
  v_code       text;
  v_subtotal   bigint := 0;
  v_fee        bigint := 0;
  v_saved      public.mk_addresses%rowtype;
  v_address    jsonb;
  v_lat        numeric;
  v_lng        numeric;
  v_distance   integer := 0;
  v_line       record;
  v_count      integer := 0;
begin
  select * into v_vendor from public.mk_vendors where id = p_vendor_id and status = 'active';
  if not found or bsdc.mk_vendor_credits(v_vendor.id) <= 0 then
    raise exception 'this shop cannot take orders right now' using errcode = 'P0002';
  end if;

  -- Opening hours check (Asia/Dhaka).
  v_sched := bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule);
  if not coalesce((v_sched ->> 'is_open')::boolean, true) then
    raise exception 'this shop is currently closed; please order during opening hours'
      using errcode = '22023';
  end if;

  -- A saved address is read back from the row, not from what the client chose to send
  -- about it: the pin, the phone and the text must be the ones the member approved,
  -- because the delivery fee, the radius test and the rider's directions are all computed
  -- from them. A request that carries only an id cannot describe a different place, and a
  -- form edit cannot smuggle a new pin past the shop's area rule while printing an old
  -- address on the order.
  if p_address_id is not null then
    select * into v_saved
      from public.mk_addresses
     where id = p_address_id and customer_uid = v_uid;
    if not found then
      raise exception 'that saved address is not yours' using errcode = 'P0002';
    end if;
    v_address := bsdc.mk_address_json(v_saved);
    -- The note belongs to this order, not to the doorstep: it is the one field a checkout
    -- may still type over, so "ring the bell twice" is not a permanent edit of the book.
    if p_address ? 'note' then
      v_address := jsonb_set(
        v_address, '{note}', to_jsonb(coalesce(p_address ->> 'note', ''))
      );
    end if;
  else
    v_address := coalesce(p_address, '{}'::jsonb);
  end if;

  v_lat := nullif(v_address ->> 'lat', '')::numeric;
  v_lng := nullif(v_address ->> 'lng', '')::numeric;

  if char_length(btrim(coalesce(v_address ->> 'customer_name', ''))) < 2 then
    raise exception 'enter your name' using errcode = '22023';
  end if;
  if coalesce(v_address ->> 'customer_phone', '') !~ '^01[3-9][0-9]{8}$' then
    raise exception 'enter an 11-digit Bangladesh mobile number' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(v_address ->> 'address_line', ''))) < 5 then
    raise exception 'enter your delivery address' using errcode = '22023';
  end if;
  if not bsdc.mk_valid_bd_point(v_lat, v_lng) then
    raise exception 'pin your delivery location on the map' using errcode = '22023';
  end if;

  v_distance := ceil(bsdc.mk_distance_km(
    coalesce(v_vendor.delivery_lat, v_vendor.lat),
    coalesce(v_vendor.delivery_lng, v_vendor.lng),
    v_lat, v_lng
  ))::integer;

  -- A shop that delivers within a radius only takes pins inside it. Distance is
  -- rounded up to the next whole kilometre, so 5.1 km counts as 6 km.
  if v_vendor.delivery_scope = 'radius' and v_distance > v_vendor.delivery_radius_km then
    raise exception 'this shop delivers only within % km of its area', v_vendor.delivery_radius_km
      using errcode = '22023';
  end if;

  -- 3-mode server-computed delivery fee (never trusted from the client).
  v_fee := bsdc.mk_compute_delivery_fee(v_vendor, v_lat, v_lng);

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

  if exists (select 1 from _mk_order_lines where name is null) then
    raise exception 'an item in your order is no longer available' using errcode = 'P0002';
  end if;

  -- The shop's minimum is a rule about what was bought, so it is compared against the
  -- subtotal and never the total: the delivery charge is not part of the order the
  -- customer placed, and letting it close a shortfall would let a 150 taka ride carry a
  -- 200 taka basket past a 300 taka minimum.
  if v_vendor.min_order_poisha > 0 and v_subtotal < v_vendor.min_order_poisha then
    raise exception 'this shop takes orders from % taka; add % taka more',
      v_vendor.min_order_poisha / 100,
      (v_vendor.min_order_poisha - v_subtotal + 99) / 100
      using errcode = '22023';
  end if;

  insert into public.mk_orders (
    code, customer_uid, vendor_id, status, subtotal_poisha, delivery_fee_poisha, total_poisha,
    customer_name, customer_phone, address_line, landmark, lat, lng, place_label, note,
    address_id
  ) values (
    v_code, v_uid, v_vendor.id, 'placed', v_subtotal, v_fee, v_subtotal + v_fee,
    btrim(v_address ->> 'customer_name'), v_address ->> 'customer_phone',
    btrim(v_address ->> 'address_line'), left(coalesce(v_address ->> 'landmark', ''), 160),
    v_lat, v_lng, left(coalesce(v_address ->> 'place_label', ''), 300),
    left(coalesce(v_address ->> 'note', ''), 300),
    p_address_id
  )
  returning id into v_order_id;

  insert into public.mk_order_items (order_id, product_id, name, image_url, unit_price, qty, line_total)
  select v_order_id, product_id, name, image_url, unit_price, qty, unit_price * qty
    from _mk_order_lines;

  update public.mk_products pr
     set stock = pr.stock - l.qty
    from _mk_order_lines l
   where pr.id = l.product_id;

  delete from public.mk_cart_items c
   using _mk_order_lines l
   where c.customer_uid = v_uid and c.product_id = l.product_id
     and p_items is null;

  insert into public.mk_order_events (order_id, status, actor_uid, note)
  values (v_order_id, 'placed', v_uid, '');

  -- The book sorts itself by what the member actually uses, so the doorstep they order
  -- from most is the one the next checkout offers first.
  if p_address_id is not null then
    update public.mk_addresses
       set last_used_at = now(),
           times_used = times_used + 1
     where id = p_address_id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id, 'code', v_code, 'status', 'placed',
    'subtotal_poisha', v_subtotal, 'delivery_fee_poisha', v_fee,
    'total_poisha', v_subtotal + v_fee, 'line_count', v_count,
    'distance_km', v_distance
  );
end;
$$;


-- ============================================================================
-- 7. Grants: the routines a client may call, and no more
-- ============================================================================

revoke all on function bsdc.mk_address_json(public.mk_addresses) from public, anon, authenticated;
revoke all on function bsdc.mk_ensure_default(text) from public, anon, authenticated;
revoke all on function public.mk_save_address(
  uuid, text, text, text, text, text, text, text, numeric, numeric, text, boolean
) from public, anon;
revoke all on function public.mk_vendor_set_min_order(integer) from public, anon;

-- An address book is not a shop window: `mk_list_vendors` is granted to anon because a stranger
-- may browse shops, and these two are not, because a stranger has no book to read.
revoke all on function public.mk_my_addresses() from public, anon;
revoke all on function public.mk_delete_address(uuid) from public, anon;
grant execute on function public.mk_my_addresses() to authenticated;
grant execute on function public.mk_delete_address(uuid) to authenticated;
grant execute on function public.mk_save_address(
  uuid, text, text, text, text, text, text, text, numeric, numeric, text, boolean
) to authenticated;
grant execute on function public.mk_vendor_set_min_order(integer) to authenticated;
