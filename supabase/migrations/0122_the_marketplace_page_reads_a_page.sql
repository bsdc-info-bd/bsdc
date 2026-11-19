-- 0122 — the marketplace page is the nearest page, and the lookups behind it.
--
-- `mk_list_vendors` is the only anonymous read the marketplace home makes, and it
-- had a defect that only shows on a real marketplace: it applied `limit` inside
-- the subquery and *then* sorted what came back by distance. The page was an
-- arbitrary forty of the shops, ordered by how near they are. At four shops
-- nothing is visible. With more shops than the page holds, the shop across the
-- road is often not on it — measured in `t81`: of the five nearest of sixty
-- shops, the old body returned the furthest of them and left out one 0.56 km away
-- in favour of one 4.89 km away.
--
-- The page is now chosen by distance and then capped, which is what "nearest
-- shops first" was always supposed to mean. Nothing else a member can see
-- changes: same membership rule (active and funded), same aggregates, same type
-- and search filters, same tie-break on name — all asserted in `t81`.
--
-- One cost note, because the first draft of this migration claimed a saving it
-- had not measured: the per-shop aggregates in the old body were in the select
-- list, and PostgreSQL does not evaluate those for rows the `limit` discards, so
-- the old query was not paying for forty shops' worth of them per shop. What it
-- *was* doing was asking `bsdc.mk_vendor_credits` — a `sum` over that shop's
-- whole ledger — once per candidate shop, inside the `where`. The rewrite asks
-- that question once, as a grouped pass over the ledger, and keeps the exact
-- per-shop function for the single-shop reads that depend on it (a shop page, a
-- product page, an order).

create index if not exists mk_credit_ledger_sum_idx
  on public.mk_credit_ledger (vendor_id, orders_delta);

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
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.distance_km nulls last, x.name)
      from (
        select p.slug, p.name, p.vendor_type, p.logo_url, p.cover_url, p.place_label,
               p.lat, p.lng, p.distance_km,
               (select count(*)::int from public.mk_products pr
                 where pr.vendor_id = p.id and pr.status = 'active') as product_count,
               coalesce((select round(avg(r.rating), 1) from public.mk_reviews r
                          where r.vendor_id = p.id), 0) as rating,
               (select count(*)::int from public.mk_reviews r where r.vendor_id = p.id) as review_count
          from (
            select v.id, v.slug, v.name, v.vendor_type, v.logo_url, v.cover_url,
                   v.place_label, v.lat, v.lng,
                   case when bsdc.mk_valid_bd_point(p_lat, p_lng)
                        then bsdc.mk_km(p_lat, p_lng, v.lat, v.lng) end as distance_km
              from public.mk_vendors v
             where v.status = 'active'
               and (p_type is null or p_type = '' or v.vendor_type::text = p_type)
               and (
                 v_query = ''
                 or v.name ilike '%' || v_query || '%'
                 or v.place_label ilike '%' || v_query || '%'
               )
               -- Funded means the ledger sums above zero — the same rule the
               -- single-shop helper applies. One grouped pass answers it for
               -- every candidate shop at once instead of once per shop.
               and exists (
                 select 1 from public.mk_credit_ledger l
                  where l.vendor_id = v.id
                  group by l.vendor_id
                 having sum(l.orders_delta) > 0
               )
             -- The distance is the page's order, so it has to be decided for every
             -- candidate before the cap is applied. That is the whole point.
             order by distance_km nulls last, v.name
             limit v_limit
          ) p
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.mk_list_vendors(text, text, numeric, numeric, integer) from public;
grant execute on function public.mk_list_vendors(text, text, numeric, numeric, integer)
  to anon, authenticated;

-- ------------------------------------------------- the comment trigger's lookup ---
-- `bsdc.prepare_comment` (0120) asks, for every comment that carries a picture,
-- whether this member uploaded this URL. `media_assets_owner_idx` already led on
-- `owner_uid`, so the question was answered by walking that member's uploads — up
-- to the 2,000 rows their quota allows. The predicate is the pair, so the index is
-- the pair: one lookup instead of a walk.
create index if not exists media_assets_owner_url_idx
  on public.media_assets (owner_uid, url);

-- ------------------------------------------------- what the thread asks next ---
-- A thread read fetches the comments, then which of them this member has liked:
-- `where uid = $1 and comment_id in (...)`. The primary key starts at
-- `comment_id`, so there was no index a `uid` predicate could use — the answer
-- came from scanning the reaction table.
create index if not exists comment_reactions_uid_idx
  on public.comment_reactions (uid, comment_id);

-- ------------------------------------------------- the sweeper's anti-join ---
-- `media_pending_purge` asks whether any message points at a URL. That question
-- was a sequential scan of every message, per candidate upload, once a day.
create index if not exists messages_media_url_idx
  on public.messages (media_url) where media_url <> '';
