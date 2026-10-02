-- ---------------------------------------------------------------------------
-- Row level security for the vendor side.
--
-- A vendor owns their shop, their products and the fulfilment of their
-- orders. A vendor does not own the money record: the ledger has no insert,
-- update or delete policy for anyone, and payouts can only be requested
-- through a function that checks the balance under a lock.
-- ---------------------------------------------------------------------------

alter table public.payout_accounts enable row level security;
alter table public.shop_ledger     enable row level security;
alter table public.payouts         enable row level security;

-- --------------------------- payout accounts -------------------------------
-- Bank and wallet details belong to the shop owner alone. Staff deciding a
-- payout see only the last four digits, through shop_payouts()/an admin RPC.
drop policy if exists payout_accounts_own on public.payout_accounts;
create policy payout_accounts_own on public.payout_accounts
  for all using (
    exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
  )
  with check (
    exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
  );

-- ------------------------------- ledger ------------------------------------
-- Readable by the shop it belongs to, and by staff. Writable by nobody: the
-- rows are written by bsdc.settle_order() and public.request_payout() as the
-- definer, so a vendor cannot credit themselves a single poisha.
drop policy if exists shop_ledger_read_own on public.shop_ledger;
create policy shop_ledger_read_own on public.shop_ledger
  for select using (
    exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- ------------------------------- payouts -----------------------------------
drop policy if exists payouts_read_own on public.payouts;
create policy payouts_read_own on public.payouts
  for select using (
    exists (
      select 1 from public.shops s where s.id = shop_id and s.owner_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- No insert policy: request_payout() is the only door, and it refuses an
-- amount the ledger cannot cover. No update policy either; decide_payout()
-- is staff-only and writes a compensating ledger row rather than editing one.

-- ---------------------------------------------------------------------------
-- Column privileges
-- ---------------------------------------------------------------------------
-- A vendor may set their shipping and their name; they may not set the
-- platform's commission or approve themselves.
revoke update (commission_bps, status, approved_at, owner_uid)
  on public.shops from authenticated;
-- Status moves through advance_order(); a vendor cannot write it directly.
revoke update (status, payment_status, placed_at, delivered_at)
  on public.orders from authenticated;
-- Stock changes through restock_product() and checkout, never by hand, so
-- the sold count and the shelf can never disagree.
revoke update (stock, status, published_at) on public.products from authenticated;
revoke insert, update, delete on public.shop_ledger from anon, authenticated;
revoke insert, update, delete on public.payouts from anon, authenticated;

grant select, insert, update, delete on public.payout_accounts to authenticated;
grant select on public.shop_ledger, public.payouts to authenticated;

grant execute on function public.open_shop(text, text, text, text) to authenticated;
grant execute on function public.decide_shop(uuid, boolean, text) to authenticated;
grant execute on function public.advance_order(uuid, bsdc_order_status, text) to authenticated;
grant execute on function public.mark_order_paid(uuid, text) to authenticated;
grant execute on function public.publish_product(uuid, boolean) to authenticated;
grant execute on function public.restock_product(uuid, integer) to authenticated;
grant execute on function public.request_payout(uuid, integer) to authenticated;
grant execute on function public.decide_payout(uuid, boolean, text) to authenticated;
grant execute on function public.shop_balance(uuid) to authenticated;
grant execute on function public.my_shop() to authenticated;
grant execute on function public.shop_orders(integer) to authenticated;
grant execute on function public.shop_products(integer) to authenticated;
grant execute on function public.shop_ledger_entries(integer) to authenticated;
grant execute on function public.shop_payouts(integer) to authenticated;
