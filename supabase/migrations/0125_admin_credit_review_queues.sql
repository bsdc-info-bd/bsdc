-- 0125: make the two credit-purchase queues first-class admin work.
--
-- Vendor-application packages are reviewed by decide_shop. They have no
-- vendor_id yet, so they must not appear in (or be actionable through) the
-- post-approval vendor-credit queue. Include the vendor and owner labels the
-- admin console needs, and keep the permission check in the database.
create or replace function public.mk_admin_list_credit_purchases(
  p_status text default 'pending',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_status text := coalesce(nullif(btrim(p_status), ''), 'pending');
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('marketplace.review');

  if v_status not in ('pending', 'approved', 'rejected') then
    raise exception 'purchase status is invalid' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at, x.id)
      from (
        select p.id,
               p.owner_uid,
               coalesce(nullif(btrim(pr.display_name), ''), 'Vendor') as owner_name,
               p.vendor_id,
               v.name as vendor_name,
               v.slug as vendor_slug,
               p.package_code,
               p.orders,
               p.price_poisha,
               p.sender_number,
               p.account_holder,
               p.txn_id,
               p.status,
               p.created_at
          from public.mk_credit_purchases p
          join public.mk_vendors v on v.id = p.vendor_id
          left join public.profiles pr on pr.uid = p.owner_uid
         where p.status::text = v_status
         order by p.created_at, p.id
         limit least(greatest(coalesce(p_limit, 50), 1), 200)
      ) x
  ), '[]'::jsonb);
end;
$$;

comment on function public.mk_admin_list_credit_purchases(text, integer) is
  'Staff-only queue for post-approval vendor order-credit purchases. Initial vendor-application packages are reviewed through decide_shop and are excluded.';

revoke all on function public.mk_admin_list_credit_purchases(text, integer) from public, anon;
grant execute on function public.mk_admin_list_credit_purchases(text, integer) to authenticated;
