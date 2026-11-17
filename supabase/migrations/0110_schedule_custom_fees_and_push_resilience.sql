-- ---------------------------------------------------------------------------
-- 0110 — Shop opening hours, 3-mode custom delivery fees, and self-healing
--        Web Push / FCM registration & instant dispatch.
--
--  1. Opening hours on public.mk_vendors (Asia/Dhaka):
--     - opening_schedule_enabled boolean (default false -> always open)
--     - opening_schedule jsonb (7 keys "0".."6", 0 = Sunday .. 6 = Saturday,
--       each {open: boolean, start: "HH:MM", end: "HH:MM"}; overnight windows
--       like 18:00..02:00 carry across midnight from the previous day).
--     - Enforced in mk_place_order (SQLSTATE 22023 when closed) and returned
--       in mk_vendor_delivery, mk_vendor_page, mk_list_vendors,
--       mk_product_detail, and mk_my_cart.
--
--  2. 3-mode custom delivery fees on public.mk_vendors:
--     - Lifts the 0..15000 poisha inline constraint from 0108 so shops can set
--       custom fixed or per-km fees up to 100,000 taka.
--     - delivery_fee_mode in ('default', 'fixed', 'per_km'):
--         * 'default': platform fallback (mk_setting('delivery_fee_poisha'), 150 Tk)
--         * 'fixed':   shop's custom fixed fee (delivery_fee_poisha, 0..10000000)
--         * 'per_km':  ceil(distance_km) * delivery_per_km_poisha (measured from
--                      coalesce(delivery_lat, lat), coalesce(delivery_lng, lng))
--     - Backwards-compatible overload on mk_vendor_set_delivery:
--       5-arg calls continue to work (storing 'fixed' with p_fee_taka <= 100000),
--       and 7-arg calls accept explicit p_fee_mode & p_per_km_taka.
--
--  3. Web Push & FCM self-healing + public VAPID discovery + instant dispatch:
--     - public.push_public_config() exposes ONLY the non-secret VAPID public key
--       so browsers and /api/push/config never fail when Cloudflare Pages env
--       bindings omit PUSH_VAPID_PUBLIC_KEY.
--     - register_push_subscription & register_fcm_token self-heal missing
--       public.profiles rows (preventing 23503 FK errors before onboarding),
--       reset invalid_count/invalid_reason on re-subscribe, preserve existing
--       last_used_at, and seed push_content_cursors cleanly.
--     - bsdc.trigger_instant_push_dispatch() falls back to site /api/push/run
--       when worker_url is unset in bsdc.push_settings.
-- ---------------------------------------------------------------------------

-- 1. Schema additions & lifting 0108's 0..150 Tk cap ------------------------
do $$
declare
  v_con record;
begin
  for v_con in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.mk_vendors'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%delivery_fee_poisha%'
  loop
    execute format('alter table public.mk_vendors drop constraint %I', v_con.conname);
  end loop;
end;
$$;

alter table public.mk_vendors
  add column if not exists delivery_fee_mode text not null default 'default'
    check (delivery_fee_mode in ('default', 'fixed', 'per_km')),
  add column if not exists delivery_per_km_poisha bigint not null default 2000
    check (delivery_per_km_poisha between 0 and 1000000),
  add column if not exists opening_schedule_enabled boolean not null default false,
  add column if not exists opening_schedule jsonb not null default
    '{"0":{"open":true,"start":"09:00","end":"22:00"},"1":{"open":true,"start":"09:00","end":"22:00"},"2":{"open":true,"start":"09:00","end":"22:00"},"3":{"open":true,"start":"09:00","end":"22:00"},"4":{"open":true,"start":"09:00","end":"22:00"},"5":{"open":true,"start":"09:00","end":"22:00"},"6":{"open":true,"start":"09:00","end":"22:00"}}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mk_vendors'::regclass
       and conname = 'mk_vendors_delivery_fee_poisha_range_chk'
  ) then
    alter table public.mk_vendors
      add constraint mk_vendors_delivery_fee_poisha_range_chk
      check (delivery_fee_poisha between 0 and 10000000);
  end if;
end;
$$;

-- Preserve any shop that already customized delivery_fee_poisha away from 15000 in 0108.
update public.mk_vendors
   set delivery_fee_mode = 'fixed'
 where delivery_fee_mode = 'default'
   and delivery_fee_poisha <> 15000;

-- 2. Opening-schedule & delivery-pricing helpers in bsdc --------------------
create or replace function bsdc.mk_default_schedule()
returns jsonb
language sql
immutable
as $$
  select '{"0":{"open":true,"start":"09:00","end":"22:00"},"1":{"open":true,"start":"09:00","end":"22:00"},"2":{"open":true,"start":"09:00","end":"22:00"},"3":{"open":true,"start":"09:00","end":"22:00"},"4":{"open":true,"start":"09:00","end":"22:00"},"5":{"open":true,"start":"09:00","end":"22:00"},"6":{"open":true,"start":"09:00","end":"22:00"}}'::jsonb
$$;

create or replace function bsdc.mk_time_minutes(p_hhmm text)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_hhmm, '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then split_part(p_hhmm, ':', 1)::integer * 60 + split_part(p_hhmm, ':', 2)::integer
    when p_hhmm = '24:00'
      then 1440
    else null
  end
$$;

create or replace function bsdc.mk_normalize_schedule(p_days jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_raw   jsonb := coalesce(p_days, bsdc.mk_default_schedule());
  v_out   jsonb := '{}'::jsonb;
  v_d     integer;
  v_entry jsonb;
  v_open  boolean;
  v_start text;
  v_end   text;
  v_smin  integer;
  v_emin  integer;
begin
  if jsonb_typeof(v_raw) <> 'object' then
    raise exception 'opening hours must be a schedule object' using errcode = '22023';
  end if;

  for v_d in 0..6 loop
    v_entry := coalesce(v_raw -> (v_d::text), '{"open":true,"start":"09:00","end":"22:00"}'::jsonb);
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'each day in opening hours must be an object' using errcode = '22023';
    end if;

    v_open  := coalesce((v_entry ->> 'open')::boolean, true);
    v_start := coalesce(nullif(btrim(v_entry ->> 'start'), ''), '09:00');
    v_end   := coalesce(nullif(btrim(v_entry ->> 'end'), ''), '22:00');
    v_smin  := bsdc.mk_time_minutes(v_start);
    v_emin  := bsdc.mk_time_minutes(v_end);

    if v_smin is null or v_emin is null or v_smin >= 1440 then
      raise exception 'opening and closing times must use 24-hour HH:MM format' using errcode = '22023';
    end if;
    if v_open and v_smin = v_emin then
      raise exception 'opening and closing times cannot be identical on an open day' using errcode = '22023';
    end if;

    v_out := v_out || jsonb_build_object(
      v_d::text,
      jsonb_build_object('open', v_open, 'start', v_start, 'end', v_end)
    );
  end loop;

  return v_out;
end;
$$;

create or replace function bsdc.mk_schedule_status(
  p_enabled  boolean,
  p_schedule jsonb,
  p_at       timestamptz default now()
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_sched     jsonb := coalesce(p_schedule, bsdc.mk_default_schedule());
  v_local     timestamp := coalesce(p_at, now()) at time zone 'Asia/Dhaka';
  v_dow       integer := extract(dow from v_local)::integer;
  v_prev_dow  integer := (v_dow + 6) % 7;
  v_now_min   integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_today     jsonb;
  v_prev      jsonb;
  v_t_open    boolean;
  v_t_start   text;
  v_t_end     text;
  v_t_smin    integer;
  v_t_emin    integer;
  v_p_open    boolean;
  v_p_start   text;
  v_p_end     text;
  v_p_smin    integer;
  v_p_emin    integer;
  v_is_open   boolean := true;
  v_closes_at text := null;
  v_next      jsonb := null;
  v_offset    integer;
  v_cand_dow  integer;
  v_cand      jsonb;
begin
  v_today   := coalesce(v_sched -> (v_dow::text), '{"open":true,"start":"09:00","end":"22:00"}'::jsonb);
  v_t_open  := coalesce((v_today ->> 'open')::boolean, true);
  v_t_start := coalesce(v_today ->> 'start', '09:00');
  v_t_end   := coalesce(v_today ->> 'end', '22:00');

  if not coalesce(p_enabled, false) then
    return jsonb_build_object(
      'enabled', false,
      'timezone', 'Asia/Dhaka',
      'is_open', true,
      'today_day', v_dow,
      'today_open', true,
      'today_start', v_t_start,
      'today_end', v_t_end,
      'closes_at', null,
      'next_open', null,
      'days', v_sched
    );
  end if;

  v_is_open := false;

  -- 1. Check overnight carry-over from yesterday (e.g., 18:00 -> 02:00).
  v_prev    := coalesce(v_sched -> (v_prev_dow::text), '{"open":false,"start":"09:00","end":"22:00"}'::jsonb);
  v_p_open  := coalesce((v_prev ->> 'open')::boolean, false);
  v_p_start := coalesce(v_prev ->> 'start', '09:00');
  v_p_end   := coalesce(v_prev ->> 'end', '22:00');
  v_p_smin  := coalesce(bsdc.mk_time_minutes(v_p_start), 540);
  v_p_emin  := coalesce(bsdc.mk_time_minutes(v_p_end), 1320);

  if v_p_open and v_p_emin < v_p_smin and v_now_min < v_p_emin then
    v_is_open := true;
    v_closes_at := v_p_end;
  end if;

  -- 2. Check today's window.
  v_t_smin := coalesce(bsdc.mk_time_minutes(v_t_start), 540);
  v_t_emin := coalesce(bsdc.mk_time_minutes(v_t_end), 1320);

  if not v_is_open and v_t_open then
    if v_t_smin < v_t_emin then
      if v_now_min >= v_t_smin and v_now_min < v_t_emin then
        v_is_open := true;
        v_closes_at := v_t_end;
      end if;
    elsif v_t_emin < v_t_smin then
      if v_now_min >= v_t_smin then
        v_is_open := true;
        v_closes_at := v_t_end;
      end if;
    end if;
  end if;

  -- 3. When closed, find the next opening day and start time.
  if not v_is_open then
    if v_t_open and v_now_min < v_t_smin then
      v_next := jsonb_build_object('day', v_dow, 'start', v_t_start);
    else
      for v_offset in 1..7 loop
        v_cand_dow := (v_dow + v_offset) % 7;
        v_cand := coalesce(v_sched -> (v_cand_dow::text), '{"open":false}'::jsonb);
        if coalesce((v_cand ->> 'open')::boolean, false) then
          v_next := jsonb_build_object(
            'day', v_cand_dow,
            'start', coalesce(v_cand ->> 'start', '09:00')
          );
          exit;
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'timezone', 'Asia/Dhaka',
    'is_open', v_is_open,
    'today_day', v_dow,
    'today_open', v_t_open,
    'today_start', v_t_start,
    'today_end', v_t_end,
    'closes_at', v_closes_at,
    'next_open', v_next,
    'days', v_sched
  );
end;
$$;

create or replace function bsdc.mk_default_delivery_fee_poisha()
returns bigint
language sql
immutable
as $$
  select 15000::bigint
$$;

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
    'center_lng', coalesce(v_vendor.delivery_lng, v_vendor.lng)
  )
$$;

create or replace function bsdc.mk_compute_delivery_fee(
  v_vendor public.mk_vendors,
  p_lat    numeric,
  p_lng    numeric
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_center_lat numeric := coalesce(v_vendor.delivery_lat, v_vendor.lat);
  v_center_lng numeric := coalesce(v_vendor.delivery_lng, v_vendor.lng);
  v_rounded_km bigint;
begin
  if v_vendor.delivery_fee_mode = 'fixed' then
    return greatest(v_vendor.delivery_fee_poisha, 0);
  elsif v_vendor.delivery_fee_mode = 'per_km' then
    v_rounded_km := greatest(
      ceil(bsdc.mk_distance_km(v_center_lat, v_center_lng, p_lat, p_lng))::bigint,
      0
    );
    return v_rounded_km * greatest(v_vendor.delivery_per_km_poisha, 0);
  else
    return bsdc.mk_default_delivery_fee_poisha();
  end if;
end;
$$;

-- 3. Vendor console RPCs: delivery + opening schedule -----------------------
create or replace function public.mk_vendor_delivery()
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare v_vendor public.mk_vendors%rowtype;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = bsdc.mk_require_uid();
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  return bsdc.mk_delivery_json(v_vendor) || jsonb_build_object(
    'shop_lat', v_vendor.lat,
    'shop_lng', v_vendor.lng,
    'schedule', bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule)
  );
end;
$$;

-- Drop 0108's 5-arg signature first so a single 7-arg signature with defaults
-- handles both legacy 3/5-arg callers and explicit 7-arg fee-mode callers cleanly.
drop function if exists public.mk_vendor_set_delivery(text, integer, integer, numeric, numeric);

create or replace function public.mk_vendor_set_delivery(
  p_scope        text,
  p_radius_km    integer,
  p_fee_taka     integer,
  p_center_lat   numeric default null,
  p_center_lng   numeric default null,
  p_fee_mode     text default null,
  p_per_km_taka  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor       public.mk_vendors%rowtype;
  v_mode         text := coalesce(nullif(btrim(p_fee_mode), ''), 'fixed');
  v_fixed_poisha bigint;
  v_per_km_poisha bigint;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = bsdc.mk_require_uid() for update;
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  if p_scope not in ('radius', 'all_bd') then
    raise exception 'choose a delivery area' using errcode = '22023';
  end if;
  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 500 then
    raise exception 'the radius must be between 1 and 500 km' using errcode = '22023';
  end if;
  if v_mode not in ('default', 'fixed', 'per_km') then
    raise exception 'choose a valid delivery fee mode' using errcode = '22023';
  end if;
  if p_fee_taka is null or p_fee_taka < 0 or p_fee_taka > 100000 then
    raise exception 'the delivery charge must be between 0 and 100,000 taka' using errcode = '22023';
  end if;
  if p_per_km_taka is not null and (p_per_km_taka < 0 or p_per_km_taka > 10000) then
    raise exception 'the per-km rate must be between 0 and 10,000 taka' using errcode = '22023';
  end if;
  if (p_center_lat is null) <> (p_center_lng is null) then
    raise exception 'pin the centre of the delivery area' using errcode = '22023';
  end if;
  if p_center_lat is not null and not bsdc.mk_valid_bd_point(p_center_lat, p_center_lng) then
    raise exception 'the delivery centre must be inside Bangladesh' using errcode = '22023';
  end if;

  v_fixed_poisha := p_fee_taka::bigint * 100;
  v_per_km_poisha := case
    when p_per_km_taka is not null then p_per_km_taka::bigint * 100
    else v_vendor.delivery_per_km_poisha
  end;

  update public.mk_vendors
     set delivery_scope         = p_scope,
         delivery_radius_km     = p_radius_km,
         delivery_fee_mode      = v_mode,
         delivery_fee_poisha    = v_fixed_poisha,
         delivery_per_km_poisha = v_per_km_poisha,
         delivery_lat           = p_center_lat,
         delivery_lng           = p_center_lng,
         updated_at             = now()
   where id = v_vendor.id
  returning * into v_vendor;

  return bsdc.mk_delivery_json(v_vendor) || jsonb_build_object(
    'shop_lat', v_vendor.lat,
    'shop_lng', v_vendor.lng,
    'schedule', bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule)
  );
end;
$$;

create or replace function public.mk_vendor_set_schedule(
  p_enabled boolean,
  p_days    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_vendor public.mk_vendors%rowtype;
  v_clean  jsonb;
begin
  select * into v_vendor from public.mk_vendors where owner_uid = bsdc.mk_require_uid() for update;
  if not found then
    raise exception 'you do not have a shop yet' using errcode = 'P0002';
  end if;
  if p_enabled is null then
    raise exception 'choose whether opening hours are enabled' using errcode = '22023';
  end if;

  v_clean := bsdc.mk_normalize_schedule(p_days);

  update public.mk_vendors
     set opening_schedule_enabled = p_enabled,
         opening_schedule         = v_clean,
         updated_at               = now()
   where id = v_vendor.id
  returning * into v_vendor;

  return bsdc.mk_schedule_status(v_vendor.opening_schedule_enabled, v_vendor.opening_schedule);
end;
$$;

-- 4. Storefront & checkout RPCs with schedule + 3-mode delivery -------------
create or replace function public.mk_list_vendors(
  p_type text default null,
  p_query text default '',
  p_lat numeric default null,
  p_lng numeric default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.distance_km nulls last, x.name)
      from (
        select v.slug, v.name, v.vendor_type, v.logo_url, v.cover_url, v.place_label,
               v.lat, v.lng,
               case when bsdc.mk_valid_bd_point(p_lat, p_lng)
                    then bsdc.mk_km(p_lat, p_lng, v.lat, v.lng) end as distance_km,
               (select count(*)::int from public.mk_products pr
                 where pr.vendor_id = v.id and pr.status = 'active') as product_count,
               coalesce((select round(avg(r.rating), 1) from public.mk_reviews r
                          where r.vendor_id = v.id), 0) as rating,
               (select count(*)::int from public.mk_reviews r where r.vendor_id = v.id) as review_count,
               bsdc.mk_delivery_json(v) as delivery,
               bsdc.mk_schedule_status(v.opening_schedule_enabled, v.opening_schedule) as schedule
          from public.mk_vendors v
         where v.status = 'active'
           and bsdc.mk_vendor_credits(v.id) > 0
           and (p_type is null or p_type = '' or v.vendor_type::text = p_type)
           and (
             btrim(coalesce(p_query, '')) = ''
             or v.name ilike '%' || btrim(p_query) || '%'
             or v.place_label ilike '%' || btrim(p_query) || '%'
           )
         limit least(greatest(p_limit, 1), 100)
      ) x
  ), '[]'::jsonb);
end;
$$;

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
        'image_url', coalesce(pr.images[1], '')
      ) order by pr.created_at desc)
        from public.mk_products pr
       where pr.vendor_id = v_vendor.id and pr.status = 'active'
    ), '[]'::jsonb),
    'rating', coalesce((select round(avg(r.rating), 1) from public.mk_reviews r where r.vendor_id = v_vendor.id), 0),
    'review_count', (select count(*)::int from public.mk_reviews r where r.vendor_id = v_vendor.id)
  );
end;
$$;

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

create or replace function public.mk_place_order(
  p_vendor_id uuid,
  p_address   jsonb,
  p_items     jsonb default null
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
  v_lat        numeric := nullif(p_address ->> 'lat', '')::numeric;
  v_lng        numeric := nullif(p_address ->> 'lng', '')::numeric;
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

  if char_length(btrim(coalesce(p_address ->> 'customer_name', ''))) < 2 then
    raise exception 'enter your name' using errcode = '22023';
  end if;
  if coalesce(p_address ->> 'customer_phone', '') !~ '^01[3-9][0-9]{8}$' then
    raise exception 'enter an 11-digit Bangladesh mobile number' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_address ->> 'address_line', ''))) < 5 then
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

  insert into public.mk_orders (
    code, customer_uid, vendor_id, status, subtotal_poisha, delivery_fee_poisha, total_poisha,
    customer_name, customer_phone, address_line, landmark, lat, lng, place_label, note
  ) values (
    v_code, v_uid, v_vendor.id, 'placed', v_subtotal, v_fee, v_subtotal + v_fee,
    btrim(p_address ->> 'customer_name'), p_address ->> 'customer_phone',
    btrim(p_address ->> 'address_line'), left(coalesce(p_address ->> 'landmark', ''), 160),
    v_lat, v_lng, left(coalesce(p_address ->> 'place_label', ''), 300),
    left(coalesce(p_address ->> 'note', ''), 300)
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

  return jsonb_build_object(
    'order_id', v_order_id, 'code', v_code, 'status', 'placed',
    'subtotal_poisha', v_subtotal, 'delivery_fee_poisha', v_fee,
    'total_poisha', v_subtotal + v_fee, 'line_count', v_count,
    'distance_km', v_distance
  );
end;
$$;

-- 5. Self-healing Push / FCM registration & public VAPID discovery ----------
create or replace function bsdc.ensure_push_profile(p_uid text)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_status text;
begin
  select p.status::text into v_status
    from public.profiles p
   where p.uid = p_uid;

  if not found then
    insert into public.profiles (uid, username, display_name)
    values (p_uid, null, 'Member')
    on conflict (uid) do nothing;
  elsif v_status <> 'active' then
    raise exception 'push/account-inactive' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.push_public_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_pub text;
begin
  select nullif(btrim(value), '') into v_pub
    from bsdc.push_settings
   where name = 'vapid_public_key';

  return jsonb_build_object(
    'enabled', v_pub is not null and char_length(v_pub) >= 80,
    'vapid_public_key', v_pub
  );
end;
$$;

create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text default '',
  p_auth       text default '',
  p_user_agent text default '',
  p_language   text default 'bn'
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid  text := bsdc.current_uid();
  v_lang text := case when lower(btrim(coalesce(p_language, 'bn'))) = 'en' then 'en' else 'bn' end;
  v_ep   text := btrim(coalesce(p_endpoint, ''));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_ep = '' or v_ep !~ '^https://' or char_length(v_ep) < 20 or char_length(v_ep) > 2048 then
    raise exception 'a push endpoint is required' using errcode = '22023';
  end if;

  perform bsdc.ensure_push_profile(v_uid);

  insert into public.push_subscriptions (endpoint, uid, p256dh, auth, user_agent, language)
  values (
    v_ep,
    v_uid,
    left(btrim(coalesce(p_p256dh, '')), 512),
    left(btrim(coalesce(p_auth, '')), 512),
    left(coalesce(p_user_agent, ''), 400),
    v_lang
  )
  on conflict (endpoint) do update
    set uid            = excluded.uid,
        p256dh         = excluded.p256dh,
        auth           = excluded.auth,
        user_agent     = excluded.user_agent,
        language       = excluded.language,
        dead_at        = null,
        invalid_count  = 0,
        invalid_reason = '';

  insert into bsdc.push_content_cursors (endpoint, last_seq)
  values (
    v_ep,
    coalesce((select max(n.seq) from public.notifications n where n.uid = v_uid), 0)
  )
  on conflict (endpoint) do nothing;
end;
$$;

create or replace function public.register_fcm_token(
  p_token      text,
  p_platform   text default 'web',
  p_user_agent text default '',
  p_language   text default 'bn'
)
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_token    text := btrim(coalesce(p_token, ''));
  v_hash     text;
  v_platform text := case
    when lower(btrim(coalesce(p_platform, 'web'))) in ('android', 'ios', 'web')
      then lower(btrim(p_platform))
    else 'web'
  end;
  v_language text := case
    when lower(btrim(coalesce(p_language, 'bn'))) = 'en' then 'en'
    else 'bn'
  end;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(v_token) < 20 or char_length(v_token) > 4096 then
    raise exception 'a valid fcm token is required' using errcode = '22023';
  end if;

  perform bsdc.ensure_push_profile(v_uid);

  v_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  insert into public.fcm_tokens (
    token, token_hash, uid, platform, user_agent, language
  ) values (
    v_token,
    v_hash,
    v_uid,
    v_platform,
    left(coalesce(p_user_agent, ''), 400),
    v_language
  )
  on conflict (token) do update set
    token_hash     = excluded.token_hash,
    uid            = excluded.uid,
    platform       = excluded.platform,
    user_agent     = excluded.user_agent,
    language       = excluded.language,
    last_used_at   = now(),
    dead_at        = null,
    invalid_reason = '',
    invalid_count  = 0;

  return v_hash;
end;
$$;

-- Instant push dispatch: try worker_url first, or fall back to main site /api/push/run.
create or replace function bsdc.trigger_instant_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_worker_url text;
  v_secret     text;
  v_target     text;
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    select value into v_worker_url from bsdc.push_settings where name = 'worker_url';
    select value into v_secret     from bsdc.push_settings where name = 'flush_secret';
    if v_secret is not null and char_length(v_secret) >= 32 then
      if v_worker_url is not null and v_worker_url ~ '^https://' then
        v_target := rtrim(v_worker_url, '/') || '/run?limit=40';
      else
        v_target := 'https://www.bsdc.info.bd/api/push/run?limit=40';
      end if;
      begin
        execute
          'select net.http_post(url := $1, body := $2::jsonb, headers := $3::jsonb, timeout_milliseconds := 4000)'
          using v_target,
                '{}',
                jsonb_build_object(
                  'Content-Type', 'application/json',
                  'Authorization', 'Bearer ' || v_secret
                );
      exception when others then
        null;
      end;
    end if;
  end if;
  return new;
end;
$$;

-- 6. Grants & revokes -------------------------------------------------------
revoke all on function bsdc.mk_default_schedule() from public, anon, authenticated;
revoke all on function bsdc.mk_time_minutes(text) from public, anon, authenticated;
revoke all on function bsdc.mk_normalize_schedule(jsonb) from public, anon, authenticated;
revoke all on function bsdc.mk_schedule_status(boolean, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function bsdc.mk_default_delivery_fee_poisha() from public, anon, authenticated;
revoke all on function bsdc.mk_delivery_json(public.mk_vendors) from public, anon, authenticated;
revoke all on function bsdc.mk_compute_delivery_fee(public.mk_vendors, numeric, numeric) from public, anon, authenticated;
revoke all on function bsdc.ensure_push_profile(text) from public, anon, authenticated;

revoke all on function public.mk_vendor_delivery() from public, anon;
grant execute on function public.mk_vendor_delivery() to authenticated;

revoke all on function public.mk_vendor_set_delivery(text, integer, integer, numeric, numeric, text, integer) from public, anon;
grant execute on function public.mk_vendor_set_delivery(text, integer, integer, numeric, numeric, text, integer) to authenticated;

revoke all on function public.mk_vendor_set_schedule(boolean, jsonb) from public, anon;
grant execute on function public.mk_vendor_set_schedule(boolean, jsonb) to authenticated;

revoke all on function public.push_public_config() from public;
grant execute on function public.push_public_config() to anon, authenticated;

revoke all on function public.register_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated;

revoke all on function public.register_fcm_token(text, text, text, text) from public, anon;
grant execute on function public.register_fcm_token(text, text, text, text) to authenticated;
