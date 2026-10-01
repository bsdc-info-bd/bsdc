-- ---------------------------------------------------------------------------
-- Marketplace, vendor side: opening a shop, fulfilling orders, getting paid.
--
-- The money trail is the point of this file. Three invariants are kept by
-- Postgres, not by any screen:
--   1. An order moves through a state machine. A vendor may only make a legal
--      forward move, and cannot mark cash-on-delivery as paid before it is
--      actually delivered.
--   2. Every taka a shop earns is an append-only ledger row written by the
--      database when an order is delivered, commission already deducted.
--      There is no update or delete policy on the ledger for anyone.
--   3. A payout can never exceed the balance, because the balance is summed
--      from the ledger under a lock at the moment the payout is requested.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_ledger_kind') then
    create type bsdc_ledger_kind as enum ('sale', 'commission', 'refund', 'payout', 'adjustment');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_payout_status') then
    create type bsdc_payout_status as enum ('requested', 'approved', 'paid', 'rejected');
  end if;
end;
$$;

-- The platform's cut, in basis points, so a percentage never needs a float.
alter table public.shops
  add column if not exists commission_bps integer not null default 500
    check (commission_bps between 0 and 3000);

alter table public.shops
  add column if not exists approved_at timestamptz;
alter table public.shops
  add column if not exists suspension_reason text not null default ''
    check (char_length(suspension_reason) <= 500);

-- --------------------------- payout accounts -------------------------------
create table if not exists public.payout_accounts (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  method       bsdc_payment_method not null default 'bkash',
  -- Only the last digits are ever shown back; the full value is write-only
  -- for the owner and never selected by the catalogue code.
  account_name text not null check (char_length(btrim(account_name)) between 2 and 100),
  account_ref  text not null check (char_length(btrim(account_ref)) between 4 and 40),
  bank_name    text not null default '' check (char_length(bank_name) <= 100),
  branch       text not null default '' check (char_length(branch) <= 100),
  is_default   boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (shop_id, method, account_ref)
);

create index if not exists payout_accounts_shop_idx on public.payout_accounts (shop_id);

-- ------------------------------- ledger ------------------------------------
-- Append only. Amounts are poisha; a credit is positive, a debit negative.
create table if not exists public.shop_ledger (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  order_id   uuid references public.orders (id) on delete set null,
  payout_id  uuid,
  kind       bsdc_ledger_kind not null,
  amount     integer not null,
  memo       text not null default '' check (char_length(memo) <= 200),
  created_at timestamptz not null default now(),
  -- A sale credits, a commission or payout debits. Nothing may be zero: a
  -- ledger row that moves no money is noise.
  constraint shop_ledger_direction check (
    (kind = 'sale' and amount > 0)
    or (kind in ('commission', 'payout') and amount < 0)
    or (kind in ('refund', 'adjustment') and amount <> 0)
  )
);

create index if not exists shop_ledger_shop_idx on public.shop_ledger (shop_id, created_at desc);
create unique index if not exists shop_ledger_sale_once
  on public.shop_ledger (order_id, kind) where order_id is not null;

-- ------------------------------- payouts -----------------------------------
create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  account_id   uuid not null references public.payout_accounts (id) on delete restrict,
  amount       integer not null check (amount > 0),
  status       bsdc_payout_status not null default 'requested',
  reference    text not null default '' check (char_length(reference) <= 120),
  note         text not null default '' check (char_length(note) <= 300),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   text references public.profiles (uid) on delete set null
);

create index if not exists payouts_shop_idx on public.payouts (shop_id, requested_at desc);

-- --------------------------- order fulfilment -------------------------------
-- The state machine, written once and used by the only function allowed to
-- move an order. Everything not listed here is illegal, including going
-- backwards and skipping a step.
create or replace function bsdc.order_transition_allowed(
  p_from bsdc_order_status,
  p_to   bsdc_order_status
)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'pending'   then p_to in ('confirmed', 'cancelled')
    when 'confirmed' then p_to in ('packed', 'cancelled')
    when 'packed'    then p_to in ('shipped', 'cancelled')
    when 'shipped'   then p_to in ('delivered')
    when 'delivered' then p_to in ('refunded')
    else false
  end;
$$;

-- Writes the money of a delivered order: the shop is credited the goods
-- total, the platform's commission is debited in the same transaction.
create or replace function bsdc.settle_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_order      public.orders%rowtype;
  v_bps        integer;
  v_commission integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return;
  end if;
  -- shop_ledger_sale_once makes a second settlement impossible, but check
  -- anyway so a retry is quiet rather than an error.
  if exists (
    select 1 from public.shop_ledger where order_id = p_order_id and kind = 'sale'
  ) then
    return;
  end if;

  select commission_bps into v_bps from public.shops where id = v_order.shop_id;
  -- Commission is charged on goods, never on the shipping the courier takes.
  v_commission := (v_order.subtotal * coalesce(v_bps, 0)) / 10000;

  insert into public.shop_ledger (shop_id, order_id, kind, amount, memo)
    values (v_order.shop_id, p_order_id, 'sale', v_order.subtotal + v_order.shipping,
            'order ' || v_order.code);

  if v_commission > 0 then
    insert into public.shop_ledger (shop_id, order_id, kind, amount, memo)
      values (v_order.shop_id, p_order_id, 'commission', -v_commission,
              'commission ' || (coalesce(v_bps, 0) / 100.0)::text || '%');
  end if;
end;
$$;

-- The only way a vendor may move an order.
create or replace function public.advance_order(
  p_order_id uuid,
  p_status   bsdc_order_status,
  p_note     text default ''
)
returns bsdc_order_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_order public.orders%rowtype;
  v_owner text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select owner_uid into v_owner from public.shops where id = v_order.shop_id;
  if v_owner is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'this order belongs to another shop' using errcode = '42501';
  end if;

  if not bsdc.order_transition_allowed(v_order.status, p_status) then
    raise exception 'an order cannot go from % to %', v_order.status, p_status
      using errcode = '22023';
  end if;

  if p_status = 'cancelled' then
    -- Reuse the customer path so stock returns to the shelf exactly once.
    perform public.cancel_order(p_order_id, coalesce(p_note, ''));
    return 'cancelled'::bsdc_order_status;
  end if;

  update public.orders
    set status = p_status,
        confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
        delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
        -- Cash is only cash once it has actually been handed over.
        payment_status = case
          when p_status = 'delivered' and payment_method = 'cash_on_delivery' then 'paid'
          else payment_status
        end
    where id = p_order_id;

  if p_status = 'delivered' then
    perform bsdc.settle_order(p_order_id);
    perform bsdc.notify(v_order.uid, v_uid, 'moderation', null, null, 'order_delivered');
  else
    perform bsdc.notify(v_order.uid, v_uid, 'moderation', null, null,
                        'order_' || p_status::text);
  end if;

  return p_status;
end;
$$;

-- A vendor records a non-cash payment; they may not invent one for cash on
-- delivery, which the state machine settles at the door.
create or replace function public.mark_order_paid(p_order_id uuid, p_reference text default '')
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_order public.orders%rowtype;
  v_owner text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  select owner_uid into v_owner from public.shops where id = v_order.shop_id;
  if v_owner is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'this order belongs to another shop' using errcode = '42501';
  end if;
  if v_order.payment_method = 'cash_on_delivery' and v_order.status <> 'delivered' then
    raise exception 'cash on delivery is paid at the door' using errcode = '22023';
  end if;

  update public.orders
    set payment_status = 'paid', note = left(coalesce(p_reference, note), 500)
    where id = p_order_id;
end;
$$;

-- --------------------------- product management -----------------------------
-- Publishing is a transition, not a column a vendor pokes: it checks the shop
-- is actually trading and that the product has the parts a buyer needs.
create or replace function public.publish_product(p_product_id uuid, p_publish boolean default true)
returns bsdc_product_status
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_product public.products%rowtype;
  v_shop    public.shops%rowtype;
  v_status  bsdc_product_status;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  select * into v_shop from public.shops where id = v_product.shop_id;
  if v_shop.owner_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'this product belongs to another shop' using errcode = '42501';
  end if;

  if not p_publish then
    update public.products set status = 'archived' where id = p_product_id;
    return 'archived'::bsdc_product_status;
  end if;

  if v_shop.status <> 'active' then
    raise exception 'the shop is not approved to sell yet' using errcode = '42501';
  end if;
  if char_length(btrim(v_product.summary)) < 10 then
    raise exception 'write a summary of at least ten characters first' using errcode = '22023';
  end if;
  if array_length(v_product.images, 1) is null then
    raise exception 'add at least one image first' using errcode = '22023';
  end if;

  v_status := case
    when v_product.is_digital or v_product.stock > 0 then 'active'
    else 'out_of_stock'
  end;

  update public.products
    set status = v_status, published_at = coalesce(published_at, now())
    where id = p_product_id;
  return v_status;
end;
$$;

-- Restocking is additive and brings a sold-out product back by itself.
create or replace function public.restock_product(p_product_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid   text := bsdc.current_uid();
  v_owner text;
  v_stock integer;
begin
  select s.owner_uid into v_owner
    from public.products p join public.shops s on s.id = p.shop_id
    where p.id = p_product_id;
  if v_owner is null then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'this product belongs to another shop' using errcode = '42501';
  end if;

  update public.products
    set stock = greatest(stock + coalesce(p_delta, 0), 0),
        status = case
          when status = 'out_of_stock' and stock + coalesce(p_delta, 0) > 0 then 'active'
          when status = 'active' and stock + coalesce(p_delta, 0) <= 0 and not is_digital
            then 'out_of_stock'
          else status
        end
    where id = p_product_id
    returning stock into v_stock;

  return v_stock;
end;
$$;

-- ------------------------------ shop lifecycle ------------------------------
create or replace function public.open_shop(
  p_slug    text,
  p_name    text,
  p_tagline text default '',
  p_city    text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.shops where owner_uid = v_uid and status <> 'closed') then
    raise exception 'you already have a shop' using errcode = '23505';
  end if;

  -- A new shop opens pending: staff approve before anything can be sold.
  insert into public.shops (slug, name, tagline, city, owner_uid, status)
    values (lower(btrim(p_slug)), btrim(p_name), coalesce(p_tagline, ''),
            coalesce(p_city, ''), v_uid, 'pending')
    returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.decide_shop(
  p_shop_id uuid,
  p_approve boolean,
  p_reason  text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_owner text;
begin
  if not bsdc.is_staff() then
    raise exception 'only staff may approve a shop' using errcode = '42501';
  end if;
  select owner_uid into v_owner from public.shops where id = p_shop_id;
  if v_owner is null then
    raise exception 'shop not found' using errcode = 'P0002';
  end if;

  update public.shops
    set status = case when p_approve then 'active'::bsdc_shop_status
                      else 'suspended'::bsdc_shop_status end,
        approved_at = case when p_approve then now() else approved_at end,
        suspension_reason = case when p_approve then '' else left(coalesce(p_reason, ''), 500) end
    where id = p_shop_id;

  -- A suspended shop disappears from the storefront with its products.
  if not p_approve then
    update public.products set status = 'archived'
      where shop_id = p_shop_id and status in ('active', 'out_of_stock');
  end if;

  perform bsdc.notify(v_owner, bsdc.current_uid(), 'moderation', null, null,
                      case when p_approve then 'shop_approved' else 'shop_suspended' end);
end;
$$;

-- -------------------------------- payouts -----------------------------------
create or replace function public.shop_balance(p_shop_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(sum(amount), 0)::integer
  from public.shop_ledger
  where shop_id = p_shop_id;
$$;

-- A payout is a debit written in the same transaction as the request, so the
-- balance cannot be spent twice by two tabs.
create or replace function public.request_payout(
  p_account_id uuid,
  p_amount     integer
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_shop    uuid;
  v_owner   text;
  v_balance integer;
  v_id      uuid;
begin
  select a.shop_id, s.owner_uid into v_shop, v_owner
    from public.payout_accounts a join public.shops s on s.id = a.shop_id
    where a.id = p_account_id;
  if v_shop is null then
    raise exception 'payout account not found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from v_uid then
    raise exception 'this account belongs to another shop' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'a payout must be more than nothing' using errcode = '22023';
  end if;

  -- Lock the shop row so two concurrent requests serialise on the balance.
  perform 1 from public.shops where id = v_shop for update;

  select coalesce(sum(amount), 0)::integer into v_balance
    from public.shop_ledger where shop_id = v_shop;

  if p_amount > v_balance then
    raise exception 'your balance is % poisha', v_balance using errcode = '22023';
  end if;

  insert into public.payouts (shop_id, account_id, amount)
    values (v_shop, p_account_id, p_amount)
    returning id into v_id;

  insert into public.shop_ledger (shop_id, payout_id, kind, amount, memo)
    values (v_shop, v_id, 'payout', -p_amount, 'payout requested');

  return v_id;
end;
$$;

create or replace function public.decide_payout(
  p_payout_id uuid,
  p_approve   boolean,
  p_reference text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_payout public.payouts%rowtype;
begin
  if not bsdc.is_staff() then
    raise exception 'only staff may decide a payout' using errcode = '42501';
  end if;
  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found or v_payout.status <> 'requested' then
    raise exception 'this payout has already been decided' using errcode = '22023';
  end if;

  if p_approve then
    update public.payouts
      set status = 'paid', decided_at = now(), decided_by = bsdc.current_uid(),
          reference = left(coalesce(p_reference, ''), 120)
      where id = p_payout_id;
  else
    update public.payouts
      set status = 'rejected', decided_at = now(), decided_by = bsdc.current_uid()
      where id = p_payout_id;
    -- Rejecting gives the money back to the balance rather than editing the
    -- original debit: the ledger is never rewritten.
    insert into public.shop_ledger (shop_id, payout_id, kind, amount, memo)
      values (v_payout.shop_id, p_payout_id, 'adjustment', v_payout.amount,
              'payout rejected');
  end if;
end;
$$;

-- ------------------------------- dashboards ---------------------------------
create or replace function public.my_shop()
returns table (
  id              uuid,
  slug            text,
  name            text,
  status          bsdc_shop_status,
  logo_url        text,
  commission_bps  integer,
  shipping_flat   integer,
  free_shipping_over integer,
  rating_sum      integer,
  rating_count    integer,
  orders_count    integer,
  product_count   integer,
  open_orders     integer,
  balance         integer,
  lifetime_sales  integer,
  suspension_reason text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    s.id, s.slug::text, s.name, s.status, s.logo_url, s.commission_bps,
    s.shipping_flat, s.free_shipping_over, s.rating_sum, s.rating_count, s.orders_count,
    (select count(*)::integer from public.products p where p.shop_id = s.id),
    (select count(*)::integer from public.orders o
      where o.shop_id = s.id and o.status in ('pending', 'confirmed', 'packed', 'shipped')),
    (select coalesce(sum(l.amount), 0)::integer from public.shop_ledger l where l.shop_id = s.id),
    (select coalesce(sum(l.amount), 0)::integer from public.shop_ledger l
      where l.shop_id = s.id and l.kind = 'sale'),
    s.suspension_reason
  from public.shops s
  where s.owner_uid = bsdc.current_uid()
  limit 1;
$$;

create or replace function public.shop_orders(p_limit integer default 50)
returns table (
  id             uuid,
  code           text,
  status         bsdc_order_status,
  payment_status bsdc_payment_status,
  payment_method bsdc_payment_method,
  total          integer,
  currency       text,
  item_count     integer,
  recipient      text,
  phone          text,
  address_line   text,
  city           text,
  placed_at      timestamptz,
  next_statuses  text[]
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
    o.recipient, o.phone, o.address_line, o.city, o.placed_at,
    (
      select coalesce(array_agg(candidate::text order by candidate), array[]::text[])
      from unnest(enum_range(null::bsdc_order_status)) as candidate
      where bsdc.order_transition_allowed(o.status, candidate)
    )
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where s.owner_uid = bsdc.current_uid()
  order by o.placed_at desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.shop_products(p_limit integer default 100)
returns table (
  id           uuid,
  slug         text,
  title        text,
  status       bsdc_product_status,
  price        integer,
  currency     text,
  stock        integer,
  is_digital   boolean,
  sold_count   integer,
  rating_sum   integer,
  rating_count integer,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    p.id, p.slug::text, p.title, p.status, p.price, p.currency, p.stock, p.is_digital,
    p.sold_count, p.rating_sum, p.rating_count, p.updated_at
  from public.products p
  join public.shops s on s.id = p.shop_id
  where s.owner_uid = bsdc.current_uid()
  order by p.updated_at desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.shop_ledger_entries(p_limit integer default 50)
returns table (
  id         uuid,
  kind       bsdc_ledger_kind,
  amount     integer,
  memo       text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select l.id, l.kind, l.amount, l.memo, l.created_at
  from public.shop_ledger l
  join public.shops s on s.id = l.shop_id
  where s.owner_uid = bsdc.current_uid()
  order by l.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.shop_payouts(p_limit integer default 30)
returns table (
  id           uuid,
  amount       integer,
  status       bsdc_payout_status,
  reference    text,
  requested_at timestamptz,
  decided_at   timestamptz,
  method       bsdc_payment_method,
  account_tail text
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    p.id, p.amount, p.status, p.reference, p.requested_at, p.decided_at,
    a.method,
    -- Only the tail of an account number is ever returned to a screen.
    right(a.account_ref, 4)
  from public.payouts p
  join public.payout_accounts a on a.id = p.account_id
  join public.shops s on s.id = p.shop_id
  where s.owner_uid = bsdc.current_uid()
  order by p.requested_at desc
  limit greatest(1, least(p_limit, 100));
$$;
