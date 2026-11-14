-- ---------------------------------------------------------------------------
-- 0097 — Vendor reference lookup for checkout.
--
-- Storefront pages address a shop by its public slug, but mk_place_order takes
-- the vendor's id. This returns that id for an active, currently listed shop
-- only. A shop with no credits, or a suspended one, returns null, so a stale
-- link cannot start a checkout. It exposes nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.mk_vendor_ref(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select v.id
    from public.mk_vendors v
   where v.slug = btrim(coalesce(p_slug, ''))
     and v.status = 'active'
     and bsdc.mk_vendor_credits(v.id) > 0
$$;

revoke all on function public.mk_vendor_ref(text) from public;
grant execute on function public.mk_vendor_ref(text) to anon, authenticated;
