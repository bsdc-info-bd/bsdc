-- 0099: explicit deny-all policies for service-only and RPC-only tables.
--
-- Every public table must carry at least one row-level-security policy (db-push
-- assertion "every table in public has at least one policy"). These tables are
-- reached only through security-definer RPCs or the service role, and anon and
-- authenticated hold no table privileges on them. The policy below makes that
-- intent explicit: no direct row access for any client role. Idempotent.

do $$
declare
  t text;
begin
  foreach t in array array[
    'ad_event_rejections',
    'mk_cart_items', 'mk_categories', 'mk_credit_ledger', 'mk_credit_packages',
    'mk_credit_purchases', 'mk_order_items', 'mk_products', 'mk_reviews',
    'mk_settings', 'mk_vendor_applications', 'mk_vendors'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_deny_direct_access', t);
    execute format(
      'create policy %I on public.%I for all to public using (false) with check (false)',
      t || '_deny_direct_access', t
    );
  end loop;
end
$$;
