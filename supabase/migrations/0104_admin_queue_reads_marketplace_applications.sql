-- 0104: the staff review queue reads the marketplace vendor applications.
--
-- Vendor applications have been written to public.mk_vendor_applications since
-- 0094, but the admin console still counted and listed the legacy public.shops
-- table, so a submitted application was invisible and the dashboard showed
-- "0 waiting". This migration points the queue, the dashboard count and the
-- decisions at the applications that are actually submitted:
--
--   * admin_pending_shops()   lists submitted applications, with the payment
--                             details staff need to verify the bKash transfer.
--   * admin_overview()        counts submitted applications as shops_pending.
--   * decide_shop()           decides a marketplace application (approve, or
--                             refuse with a reason the applicant can read).
--   * bulk_decide_shops()     unchanged; it calls decide_shop() for each id.
--
-- The queue and the decision use the same permission (marketplace.review), so
-- a reviewer sees exactly the rows they are allowed to decide.

-- The owner is the top staff role and must be able to review vendors as well.
-- 0094 granted marketplace.review to admin only.
insert into public.role_permissions (role, permission) values
  ('owner', 'marketplace.review'),
  ('owner', 'marketplace.settings')
on conflict do nothing;

drop function if exists public.admin_pending_shops(integer);

create or replace function public.admin_pending_shops(p_limit integer default 50)
returns table (
  id               uuid,
  slug             text,
  name             text,
  tagline          text,
  city             text,
  owner_uid        text,
  owner_name       text,
  created_at       timestamptz,
  mobile           text,
  payment_sender   text,
  payment_holder   text,
  payment_txn_id   text,
  package_code     text,
  address_line     text,
  place_label      text,
  trade_license_no text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    a.id,
    ''::text,
    a.shop_name,
    a.vendor_type::text,
    coalesce(nullif(a.place_label, ''), a.address_line),
    a.owner_uid,
    a.full_name,
    a.submitted_at,
    a.mobile,
    a.payment_sender,
    a.payment_holder,
    a.payment_txn_id,
    a.package_code,
    a.address_line,
    a.place_label,
    a.trade_license_no
  from public.mk_vendor_applications a
  where a.status = 'submitted'
    and bsdc.has_permission('marketplace.review')
  order by a.submitted_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.admin_pending_shops(integer) from public;
grant execute on function public.admin_pending_shops(integer) to authenticated, service_role;

create or replace function public.admin_overview()
returns table (
  members_total     integer,
  members_today     integer,
  posts_total       integer,
  posts_today       integer,
  open_reports      integer,
  shops_pending     integer,
  campaigns_pending integer,
  plugins_enabled   integer,
  plugins_total     integer
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    (select count(*)::integer from public.profiles),
    (select count(*)::integer from public.profiles where created_at >= current_date),
    (select count(*)::integer from public.posts),
    (select count(*)::integer from public.posts where created_at >= current_date),
    (select count(*)::integer from public.reports where status = 'open'),
    (select count(*)::integer from public.mk_vendor_applications where status = 'submitted'),
    (select count(*)::integer from public.ad_campaigns where status = 'pending_review'),
    (select count(*)::integer from public.feature_flags where enabled),
    (select count(*)::integer from public.feature_flags)
  where bsdc.has_permission('moderation.read');
$$;

-- decide_shop() keeps its signature for the admin console, the CLI and the bulk
-- workbench, and decides the marketplace application it is given.
create or replace function public.decide_shop(
  p_shop_id uuid,
  p_approve boolean,
  p_reason  text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform public.mk_admin_decide_application(
    p_shop_id,
    case when p_approve then 'approve' else 'reject' end,
    coalesce(p_reason, '')
  );
end;
$$;
