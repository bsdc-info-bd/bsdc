-- 0095: read models the new marketplace screens need.
--   * mk_my_application(): the signed-in applicant's latest application, with
--     its status and the reviewer's note, so the wizard can resume or report.
--   * mk_vendor_catalog(): the vendor's own categories and every product
--     (drafts and archived included), for the console.
-- Both are security definer RPCs; nothing new is exposed to anonymous users.

create or replace function public.mk_my_application()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.mk_require_uid();
  v_app public.mk_vendor_applications%rowtype;
begin
  select * into v_app from public.mk_vendor_applications
   where owner_uid = v_uid
   order by submitted_at desc
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_app.id,
    'status', v_app.status,
    'shop_name', v_app.shop_name,
    'vendor_type', v_app.vendor_type,
    'package_code', v_app.package_code,
    'review_note', v_app.review_note,
    'submitted_at', v_app.submitted_at,
    'reviewed_at', v_app.reviewed_at
  );
end;
$$;

create or replace function public.mk_vendor_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_vendor_id uuid := bsdc.mk_my_vendor_id();
begin
  if v_vendor_id is null then
    raise exception 'only an active vendor can view the catalogue' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort', c.sort)
                       order by c.sort, c.name)
        from public.mk_categories c where c.vendor_id = v_vendor_id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description,
        'price_poisha', p.price_poisha, 'stock', p.stock, 'status', p.status,
        'category_id', p.category_id, 'images', to_jsonb(p.images)
      ) order by p.created_at desc)
        from public.mk_products p where p.vendor_id = v_vendor_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.mk_my_application() from public;
revoke all on function public.mk_vendor_catalog() from public;
grant execute on function public.mk_my_application(), public.mk_vendor_catalog() to authenticated;
