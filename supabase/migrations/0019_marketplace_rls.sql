-- ---------------------------------------------------------------------------
-- Row level security for the marketplace, customer side.
--
-- The theme of this file is that a customer may read the shop and write their
-- own intentions, but may never write anything that decides money: there is
-- no insert policy on orders or order items, no update policy on an order's
-- amounts, and no insert policy on reviews. Those paths exist only as
-- security-definer functions that check the facts first.
-- ---------------------------------------------------------------------------

alter table public.shops           enable row level security;
alter table public.products        enable row level security;
alter table public.carts           enable row level security;
alter table public.cart_items      enable row level security;
alter table public.addresses       enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.wishlist_items  enable row level security;
alter table public.product_reviews enable row level security;

-- -------------------------------- shops ------------------------------------
drop policy if exists shops_read_active on public.shops;
create policy shops_read_active on public.shops
  for select using (
    status = 'active' or owner_uid = bsdc.current_uid() or bsdc.is_staff()
  );

drop policy if exists shops_insert_own on public.shops;
create policy shops_insert_own on public.shops
  for insert with check (owner_uid = bsdc.current_uid());

drop policy if exists shops_update_own on public.shops;
create policy shops_update_own on public.shops
  for update using (owner_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (owner_uid = bsdc.current_uid() or bsdc.is_staff());

-- ------------------------------- products ----------------------------------
drop policy if exists products_read_listed on public.products;
create policy products_read_listed on public.products
  for select using (
    (
      status in ('active', 'out_of_stock')
      and exists (select 1 from public.shops s where s.id = shop_id and s.status = 'active')
    )
    or exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

drop policy if exists products_write_own_shop on public.products;
create policy products_write_own_shop on public.products
  for all using (
    exists (
      select 1 from public.shops s
      where s.id = shop_id and (s.owner_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.shops s
      where s.id = shop_id and (s.owner_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

-- -------------------------------- carts ------------------------------------
-- A cart is strictly private. Even staff have no reason to read it.
drop policy if exists carts_own on public.carts;
create policy carts_own on public.carts
  for all using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

drop policy if exists cart_items_own on public.cart_items;
create policy cart_items_own on public.cart_items
  for all using (
    exists (select 1 from public.carts c where c.id = cart_id and c.uid = bsdc.current_uid())
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.uid = bsdc.current_uid())
  );

-- ------------------------------ addresses ----------------------------------
-- A delivery address is personal data: the customer, and nobody else, until
-- it is copied onto an order the shop needs to fulfil.
drop policy if exists addresses_own on public.addresses;
create policy addresses_own on public.addresses
  for all using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

-- -------------------------------- orders -----------------------------------
drop policy if exists orders_read_parties on public.orders;
create policy orders_read_parties on public.orders
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- No insert policy: public.place_order() is the only way an order exists.
-- No update policy for customers either; cancelling goes through
-- public.cancel_order(), which also returns the stock to the shelf.
drop policy if exists orders_update_shop on public.orders;
create policy orders_update_shop on public.orders
  for update using (
    exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  )
  with check (
    exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

drop policy if exists order_items_read_parties on public.order_items;
create policy order_items_read_parties on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.uid = bsdc.current_uid()
          or exists (
            select 1 from public.shops s
            where s.id = o.shop_id and s.owner_uid = bsdc.current_uid()
          )
          or bsdc.is_staff()
        )
    )
  );

-- ------------------------------- wishlist ----------------------------------
drop policy if exists wishlist_own on public.wishlist_items;
create policy wishlist_own on public.wishlist_items
  for all using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

-- ------------------------------- reviews -----------------------------------
drop policy if exists product_reviews_read_all on public.product_reviews;
create policy product_reviews_read_all on public.product_reviews
  for select using (true);

-- No insert policy: public.submit_review() checks for a delivered order
-- first, so an unverified review cannot exist in the first place. A member
-- may still withdraw their own.
drop policy if exists product_reviews_delete_own on public.product_reviews;
create policy product_reviews_delete_own on public.product_reviews
  for delete using (uid = bsdc.current_uid() or bsdc.is_staff());

-- ---------------------------------------------------------------------------
-- Column privileges: the numbers a shop owner must not simply type in, and
-- the amounts a customer must never touch.
-- ---------------------------------------------------------------------------
revoke update (rating_sum, rating_count, sold_count) on public.products from authenticated;
revoke update (rating_sum, rating_count, orders_count) on public.shops from authenticated;
revoke update (subtotal, shipping, discount, total, code, uid, shop_id)
  on public.orders from authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

grant select on public.shops, public.products, public.product_reviews to anon, authenticated;
grant select, insert, update, delete on public.carts, public.cart_items,
  public.addresses, public.wishlist_items to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant update on public.orders to authenticated;
grant insert, update, delete on public.shops, public.products to authenticated;
grant delete on public.product_reviews to authenticated;

grant execute on function public.add_to_cart(uuid, integer) to authenticated;
grant execute on function public.set_cart_quantity(uuid, integer) to authenticated;
grant execute on function public.clear_cart() to authenticated;
grant execute on function public.my_cart() to authenticated;
grant execute on function public.place_order(uuid, bsdc_payment_method, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.submit_review(uuid, integer, text) to authenticated;
grant execute on function public.toggle_wishlist(uuid) to authenticated;
grant execute on function public.my_orders(integer) to authenticated;
grant execute on function public.product_catalog(integer, text, text, text)
  to anon, authenticated;
