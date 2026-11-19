-- 0116: let a product keep the ~640px variant of each picture.
--
-- 0115 gave every ad-credit request a review queue; this one fixes a delivery
-- problem that shows up as "the shop is slow".
--
-- The upload endpoint has always returned two URLs per picture: the original and
-- ImgBB's aspect-preserving `medium` (~640px). Product rows kept only the
-- original, so a 40px thumbnail in the catalogue and a 640px card in the feed both
-- downloaded the same full-size WebP. On a phone over mobile data that is the
-- single largest byte cost in the marketplace, and it is invisible: the picture
-- looks right, it just arrives late.
--
-- `images` stays exactly as it is. Every read model, every stored order line and
-- every existing client keeps working, because the new column is additive and is
-- emitted alongside the array rather than instead of it. A row written before this
-- migration has an empty variant map and behaves as it did yesterday.
--
-- The variant map is keyed by the original URL, so a caller that holds an image
-- from `images` can look up its lighter twin without relying on array positions —
-- which matters because the array is reorderable from the vendor catalogue.

alter table public.mk_products
  add column if not exists image_variants jsonb not null default '{}'::jsonb;

comment on column public.mk_products.image_variants is
  'Maps an original image URL to ImgBB''s ~640px medium variant of the same picture. '
  'Empty for rows written before 0116, and for pictures ImgBB would not shrink.';

-- A variant is only ever a lighter copy of an original, so the shape is enforced
-- here rather than trusted from the browser: an object of string to string, no
-- nesting, bounded so a malformed save cannot bloat the row.
alter table public.mk_products
  drop constraint if exists mk_products_image_variants_shape;
alter table public.mk_products
  add constraint mk_products_image_variants_shape check (
    jsonb_typeof(image_variants) = 'object'
    and octet_length(image_variants::text) <= 16384
  );

-- ---------------------------------------------------------------------------
-- Vendors write the variants alongside the images.
-- ---------------------------------------------------------------------------
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
  v_variants  jsonb := coalesce(p -> 'image_variants', '{}'::jsonb);
  v_img       text;
  v_variant   text;
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
  if jsonb_typeof(v_variants) <> 'object' then
    raise exception 'image variants must be an object' using errcode = '22023';
  end if;
  -- Only variants of pictures this product actually shows, and only as a map of
  -- https links. A key with no matching image is a stale entry from a save that
  -- removed a picture, and keeping it would grow the row forever.
  for v_img, v_variant in select key, value #>> '{}' from jsonb_each(v_variants) loop
    if not (v_img = any (v_images)) then
      raise exception 'variant % is not one of the product images', v_img using errcode = '22023';
    end if;
    if v_variant !~ '^https://' then
      raise exception 'image variants must be https links' using errcode = '22023';
    end if;
  end loop;
  v_variants := coalesce((
    select jsonb_object_agg(e.key, e.value)
      from jsonb_each(v_variants) e
     where e.key = any (v_images)
  ), '{}'::jsonb);
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
      vendor_id, category_id, slug, name, description, price_poisha, stock,
      images, image_variants, status
    ) values (
      v_vendor_id, v_category,
      bsdc.mk_slugify(p ->> 'name', 'product'),
      btrim(p ->> 'name'),
      coalesce(left(p ->> 'description', 2000), ''),
      (p ->> 'price_poisha')::bigint,
      coalesce((p ->> 'stock')::integer, 0),
      v_images,
      v_variants,
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
           image_variants = case
             when p ? 'images' then v_variants
             when p ? 'image_variants' then v_variants
             else image_variants
           end,
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

-- ---------------------------------------------------------------------------
-- Reads emit the map beside the array. Same body as 0110, one key added.
-- ---------------------------------------------------------------------------
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
    'image_variants', v_product.image_variants,
    'vendor', jsonb_build_object(
      'slug', v_vendor.slug,
      'name', v_vendor.name,
      'delivery', bsdc.mk_delivery_json(v_vendor),
      'schedule', bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule)
    ),
    'rating', coalesce((
      select round(avg(r.rating), 1) from public.mk_reviews r
        join public.mk_orders o on o.id = r.order_id
       where o.vendor_id = v_vendor.id
    ), 0)
  );
end;
$$;

-- The vendor catalogue carries the variants too, so the console preview can show
-- the same lighter picture the buyer will see rather than the original.
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
        'category_id', p.category_id, 'images', to_jsonb(p.images),
        'image_variants', p.image_variants
      ) order by p.created_at desc)
        from public.mk_products p where p.vendor_id = v_vendor_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.mk_vendor_save_product(uuid, jsonb) from public;
revoke all on function public.mk_product_detail(uuid) from public;
revoke all on function public.mk_vendor_catalog() from public;
grant execute on function public.mk_vendor_save_product(uuid, jsonb) to authenticated;
grant execute on function public.mk_product_detail(uuid) to authenticated, anon;
grant execute on function public.mk_vendor_catalog() to authenticated;

-- ---------------------------------------------------------------------------
-- The shop page lists one picture per product; it needs that picture's variant.
-- Same body as 0110, one key added to each product object.
-- ---------------------------------------------------------------------------
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
      'lat', v_vendor.lat, 'lng', v_vendor.lng,
      'delivery', bsdc.mk_delivery_json(v_vendor),
      'schedule', bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule)
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name)
        from public.mk_categories c where c.vendor_id = v_vendor.id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'slug', pr.slug, 'name', pr.name, 'price_poisha', pr.price_poisha,
        'in_stock', pr.stock > 0, 'category_id', pr.category_id,
        'image_url', coalesce(pr.images[1], ''),
        -- The lighter twin of that one picture, or '' when none was recorded.
        'image_variant', coalesce(pr.image_variants ->> pr.images[1], '')
      ) order by pr.created_at desc)
        from public.mk_products pr
       where pr.vendor_id = v_vendor.id and pr.status = 'active'
    ), '[]'::jsonb),
    'rating', coalesce((select round(avg(r.rating), 1) from public.mk_reviews r where r.vendor_id = v_vendor.id), 0),
    'review_count', (select count(*)::int from public.mk_reviews r where r.vendor_id = v_vendor.id)
  );
end;
$$;

revoke all on function public.mk_vendor_page(text) from public;
grant execute on function public.mk_vendor_page(text) to authenticated, anon;
