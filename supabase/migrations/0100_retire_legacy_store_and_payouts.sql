-- 0100: retire the legacy open store and vendor payouts.
--
-- Marketplace sales are cash on delivery. The vendor collects the money from the
-- customer and keeps it, so the platform never pays a vendor and no payout can be
-- requested. The legacy store (0018 to 0021 and their 0088 updates) is replaced by
-- the mk_* marketplace (0094 onwards).
--
-- Nothing is dropped. Definitions, rows, and history stay so the change can be
-- reviewed or reversed. Clients lose the ability to call these functions or to
-- touch the payout tables. Idempotent: revoking an absent privilege is a no-op.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'request_payout', 'decide_payout', 'shop_payouts',
         'shop_balance', 'shop_ledger_entries', 'mark_order_paid',
         'place_order', 'product_catalog', 'my_cart', 'add_to_cart',
         'set_cart_quantity', 'clear_cart', 'my_orders',
         'cancel_order', 'submit_review', 'advance_order',
         'open_shop', 'decide_shop', 'my_shop', 'shop_products', 'shop_orders',
         'publish_product', 'restock_product'
       ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.payouts') is not null then
    execute 'revoke all on public.payouts from anon, authenticated';
  end if;
  if to_regclass('public.payout_accounts') is not null then
    execute 'revoke all on public.payout_accounts from anon, authenticated';
  end if;
end
$$;
