-- ---------------------------------------------------------------------------
-- Campaigns are made by staff, and read by the person who paid for them.
--
-- Until now an advertiser made their own campaign from the member site and
-- waited to be approved. That is the wrong direction for this platform and it
-- is the reason no campaign ever ran: an advertiser with a wallet and a
-- creative could submit, but the money, the bid and the targeting all had to
-- be right before staff had seen anything, and the only feedback loop was a
-- rejection note.
--
-- The flow this file establishes is the one a small, curated advertising
-- business actually has:
--
--   1. Staff create the campaign. They know what inventory costs, what the
--      minimum bid is, and which city the audience is in; an advertiser does
--      not, and every campaign that made staff think "we would have set this
--      up differently" was a campaign that cost both sides a day.
--   2. Staff issue the owner their credentials. The owner does not sign up:
--      they are given an account — a profile row, a handle, a wallet, a
--      password set once — and from then on they sign in and see their own
--      numbers and nobody else's.
--   3. The owner reads a real performance page. Not a row count: a daily
--      series, per-creative breakdown, spend against budget, what each click
--      cost, and how much of the audience actually acted. Every number here is
--      derived from `ad_events`, `ad_daily_stats` and the wallet ledger, so no
--      report can disagree with the money that was charged.
--
-- What an owner can and cannot do is a deliberate line, and it is drawn here
-- rather than in a console:
--
--   * They can read their own campaigns, creatives, daily series, per-creative
--     totals and wallet ledger. Nothing extra is granted for this: the row is
--     theirs, and every read checks that it is.
--   * They can pause and resume a live campaign, and edit a creative's copy —
--     which sends it back for review.
--   * They cannot create a campaign, change a bid, change a budget, change
--     targeting, top up a wallet, or make anything active. Those are staff
--     decisions and the database refuses them without the permission.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Who is allowed to do what
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role, permission)
values
  ('manager', 'ads.manage'),
  ('admin',   'ads.manage'),
  ('owner',   'ads.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. A campaign, created by staff
-- ---------------------------------------------------------------------------
-- The shape is `create_campaign`'s, with three differences that matter:
--
--   * it requires `ads.manage` rather than a signed-in caller;
--   * it names the owner explicitly, because staff are creating a campaign for
--     somebody else;
--   * it can create the campaign already live, which is what an approval step
--     exists to avoid having to do twice when staff are the approver.
create or replace function public.staff_create_campaign(
  p_owner_uid    text,
  p_name         text,
  p_pricing      bsdc_ad_pricing,
  p_bid          integer,
  p_total_budget integer,
  p_daily_budget integer default 0,
  p_starts_at    timestamptz default now(),
  p_ends_at      timestamptz default null,
  p_cities       text[] default '{}',
  p_topics       text[] default '{}',
  p_language     text default 'any',
  p_activate     boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id      uuid;
  v_min_bid integer;
  v_balance integer;
begin
  perform bsdc.require_permission('ads.manage');

  if not exists (select 1 from public.profiles where uid = p_owner_uid) then
    raise exception 'No member has that identifier, so a campaign cannot be billed to them'
      using errcode = 'P0002';
  end if;

  select coalesce((select value::text::integer from public.site_config
                   where key = 'ads.min_bid'), 100)
    into v_min_bid;

  if p_bid < v_min_bid then
    raise exception 'The bid is below the floor of % poisha', v_min_bid using errcode = '22023';
  end if;

  -- Activating a campaign promises money that has to exist. The same rule
  -- `submit_campaign` applies to an advertiser applies to staff, because the
  -- books do not know who typed the number.
  if p_activate then
    select coalesce(sum(amount), 0)::integer into v_balance
    from public.ad_wallet_entries where owner_uid = p_owner_uid;
    if v_balance < p_total_budget then
      raise exception
        'That wallet holds % poisha and the budget is %: credit the wallet first',
        v_balance, p_total_budget using errcode = '22023';
    end if;
  end if;

  insert into public.ad_campaigns (
    owner_uid, name, status, pricing, bid, total_budget, daily_budget,
    starts_at, ends_at, target_cities, target_topics, target_language
  )
  values (
    p_owner_uid, btrim(p_name),
    -- The cast is not decoration: a `case` expression is `text`, and a text
    -- expression cannot be inserted into an enum column.
    (case when p_activate then 'active' else 'draft' end)::bsdc_ad_status,
    p_pricing, p_bid, p_total_budget, coalesce(p_daily_budget, 0),
    coalesce(p_starts_at, now()), p_ends_at,
    coalesce(p_cities, '{}'), coalesce(p_topics, '{}'), coalesce(p_language, 'any')
  )
  returning id into v_id;

  perform bsdc.audit('campaign.create', v_id::text, jsonb_build_object(
    'owner', p_owner_uid, 'budget', p_total_budget, 'bid', p_bid,
    'pricing', p_pricing, 'activated', p_activate));

  return v_id;
end;
$$;

-- The advertiser's own creative, added by staff on their behalf — or by the
-- owner themselves once they have been issued credentials, because copy is the
-- one thing the person paying for the campaign knows better than staff do.
create or replace function public.staff_add_creative(
  p_campaign_id uuid,
  p_placement   bsdc_ad_placement,
  p_headline    text,
  p_body        text,
  p_target_url  text,
  p_image_url   text default '',
  p_cta_label   text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if not (bsdc.has_permission('ads.manage') or exists (
    select 1 from public.ad_campaigns
    where id = p_campaign_id and owner_uid = bsdc.current_uid()
  )) then
    raise exception 'That campaign is not yours to edit' using errcode = '42501';
  end if;

  insert into public.ad_creatives (
    campaign_id, placement, headline, body, target_url, image_url, cta_label
  )
  values (
    p_campaign_id, p_placement, btrim(p_headline), coalesce(p_body, ''),
    btrim(p_target_url), coalesce(p_image_url, ''), coalesce(p_cta_label, '')
  )
  returning id into v_id;

  -- An owner editing a live campaign sends it back for review; staff editing
  -- it do not, because they are the reviewer.
  if not bsdc.has_permission('ads.manage') then
    update public.ad_campaigns a
    set status = (case when a.status = 'active' then 'pending_review' else a.status end)::bsdc_ad_status
    where a.id = p_campaign_id;
  end if;

  perform bsdc.audit('campaign.creative', v_id::text, jsonb_build_object('campaign', p_campaign_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The owner's credentials
-- ---------------------------------------------------------------------------
-- An advertiser is not a member who signed up. They are given an account, so
-- the account is created here: the profile row, with the handle the platform
-- requires, and then a wallet. The password itself is set by
-- `scripts/issue-advertiser.mjs` through the Auth admin API — a database
-- function cannot and must not know a password — and that script calls this
-- function to prepare the row before it sets one.
--
-- Idempotent on purpose: issuing credentials to an account that already has
-- them is a no-op that returns the existing identifier, so a retry after a
-- timeout does not create a second profile.
create or replace function public.issue_advertiser_account(
  p_uid          text,
  p_display_name text,
  p_username     text default null,
  p_email        text default ''
)
returns table (uid text, username text, created boolean)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_existing public.profiles%rowtype;
  v_handle   text;
begin
  perform bsdc.require_permission('ads.manage');

  if p_uid is null or btrim(p_uid) = '' then
    raise exception 'An advertiser account needs an identifier' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) < 2 then
    raise exception 'An advertiser account needs a name' using errcode = '22023';
  end if;

  -- Qualified, because the OUT parameters of `returns table` are in scope
  -- inside the body: an unqualified `uid` here is ambiguous between the
  -- function's own column and the table's, and Postgres refuses it.
  select pr.* into v_existing from public.profiles pr where pr.uid = p_uid;

  if found then
    -- Already an account. Answer with what it has: nothing here renames a
    -- person or takes a handle away.
    return query select v_existing.uid, v_existing.username::text, false;
    return;
  end if;

  -- A handle is derived from the name unless one was given, and made unique
  -- without inventing a second identity for somebody who already has one.
  v_handle := btrim(coalesce(p_username, ''));
  if v_handle = '' then
    -- Handles are `^[a-z0-9_]{3,24}$` on this platform, so a display name is
    -- folded into that shape rather than into a slug with hyphens in it.
    v_handle := lower(regexp_replace(btrim(p_display_name), '[^a-zA-Z0-9]+', '_', 'g'));
    v_handle := trim(both '_' from v_handle);
    if v_handle = '' then v_handle := 'advertiser'; end if;
    v_handle := left(v_handle, 24);
    v_handle := trim(trailing '_' from v_handle);
    if exists (select 1 from public.profiles pr where pr.username = v_handle) then
      v_handle := v_handle || '-' || substr(md5(p_uid), 1, 4);
    end if;
  end if;

  insert into public.profiles (uid, username, display_name, role, status, onboarding_complete)
  values (p_uid, v_handle, btrim(p_display_name), 'member', 'active', true);

  perform bsdc.audit('advertiser.issue', p_uid,
    jsonb_build_object('name', btrim(p_display_name), 'username', v_handle,
                       'email', coalesce(p_email, '')));

  return query select p_uid, v_handle, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The owner's performance page
-- ---------------------------------------------------------------------------
-- One call, because a dashboard that makes nine of them is a dashboard that
-- shows nine different moments in time. Everything here derives from the same
-- rows the billing derives from, so the numbers cannot drift from the invoice.
--
-- The derived figures are computed here rather than in a browser, because they
-- are the difference between a report and a spreadsheet: cost per click, cost
-- per thousand impressions, click-through rate, and the share of budget spent.
-- A percentage divided by zero is zero, not a null a screen has to guard.
create or replace function public.campaign_performance(p_campaign_id uuid)
returns table (
  campaign_id     uuid,
  name            text,
  status          bsdc_ad_status,
  pricing         bsdc_ad_pricing,
  bid             integer,
  total_budget    integer,
  daily_budget    integer,
  spent           integer,
  remaining       integer,
  budget_used_pct numeric,
  starts_at       timestamptz,
  ends_at         timestamptz,
  days_running    integer,
  impressions     integer,
  clicks          integer,
  ctr             numeric,
  cost_per_click  integer,
  cost_per_mille  integer,
  spend_today     integer,
  impressions_today integer,
  clicks_today    integer,
  wallet_balance  integer,
  creative_count  integer,
  active_creatives integer,
  review_note     text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner text;
begin
  select a.owner_uid into v_owner from public.ad_campaigns a where a.id = p_campaign_id;

  if v_owner is null then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  -- The owner may read it; staff may read every one.
  if v_owner <> bsdc.current_uid() and not bsdc.has_permission('ads.manage') then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;

  return query
  with totals as (
    select
      coalesce(sum(s.impressions), 0)::integer as impressions,
      coalesce(sum(s.clicks), 0)::integer      as clicks,
      coalesce(sum(s.spend), 0)::integer       as spend
    from public.ad_daily_stats s
    where s.campaign_id = p_campaign_id
  ),
  today as (
    select
      coalesce(sum(s.impressions), 0)::integer as impressions,
      coalesce(sum(s.clicks), 0)::integer      as clicks,
      coalesce(sum(s.spend), 0)::integer       as spend
    from public.ad_daily_stats s
    where s.campaign_id = p_campaign_id and s.day = current_date
  )
  select
    a.id,
    a.name,
    a.status,
    a.pricing,
    a.bid,
    a.total_budget,
    a.daily_budget,
    a.spent,
    greatest(a.total_budget - a.spent, 0),
    case when a.total_budget = 0 then 0
         else round(a.spent::numeric * 100 / a.total_budget, 1) end,
    a.starts_at,
    a.ends_at,
    greatest(1, (coalesce(a.ends_at, now())::date - a.starts_at::date))::integer,
    t.impressions,
    t.clicks,
    case when t.impressions = 0 then 0
         else round(t.clicks::numeric * 100 / t.impressions, 2) end,
    case when t.clicks = 0 then 0 else (t.spend / t.clicks)::integer end,
    case when t.impressions = 0 then 0 else (t.spend * 1000) / t.impressions end,
    d.spend,
    d.impressions,
    d.clicks,
    coalesce((select sum(w.amount)::integer from public.ad_wallet_entries w
              where w.owner_uid = a.owner_uid), 0),
    (select count(*)::integer from public.ad_creatives c where c.campaign_id = a.id),
    (select count(*)::integer from public.ad_creatives c
      where c.campaign_id = a.id and c.is_enabled),
    a.review_note
  from public.ad_campaigns a, totals t, today d
  where a.id = p_campaign_id;
end;
$$;

-- The daily series, with zeroes where nothing happened. A graph drawn from
-- only the days with rows is a graph that lies about a quiet Tuesday.
create or replace function public.campaign_timeseries(
  p_campaign_id uuid,
  p_days        integer default 30
)
returns table (
  day         date,
  impressions integer,
  clicks      integer,
  spend       integer,
  ctr         numeric
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner text;
  v_days  integer;
begin
  select a.owner_uid into v_owner from public.ad_campaigns a where a.id = p_campaign_id;
  if v_owner is null then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  if v_owner <> bsdc.current_uid() and not bsdc.has_permission('ads.manage') then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;

  v_days := greatest(1, least(coalesce(p_days, 30), 365));

  return query
  select
    d.day,
    coalesce(sum(s.impressions), 0)::integer,
    coalesce(sum(s.clicks), 0)::integer,
    coalesce(sum(s.spend), 0)::integer,
    case when coalesce(sum(s.impressions), 0) = 0 then 0
         else round(coalesce(sum(s.clicks), 0)::numeric * 100 /
                    coalesce(sum(s.impressions), 0), 2) end
  from bsdc.day_series(v_days) d
  left join public.ad_daily_stats s on s.day = d.day and s.campaign_id = p_campaign_id
  group by d.day
  order by d.day;
end;
$$;

-- Per creative, with the same derived figures, so an owner can see which of
-- their three headlines is the one working.
create or replace function public.campaign_creative_performance(p_campaign_id uuid)
returns table (
  creative_id  uuid,
  placement    bsdc_ad_placement,
  headline     text,
  body         text,
  image_url    text,
  cta_label    text,
  target_url   text,
  is_enabled   boolean,
  impressions  integer,
  clicks       integer,
  spend        integer,
  ctr          numeric,
  cost_per_click integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_owner text;
begin
  select a.owner_uid into v_owner from public.ad_campaigns a where a.id = p_campaign_id;
  if v_owner is null then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  if v_owner <> bsdc.current_uid() and not bsdc.has_permission('ads.manage') then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.placement,
    c.headline,
    c.body,
    c.image_url,
    c.cta_label,
    c.target_url,
    c.is_enabled,
    coalesce(t.impressions, 0)::integer,
    coalesce(t.clicks, 0)::integer,
    coalesce(t.spend, 0)::integer,
    case when coalesce(t.impressions, 0) = 0 then 0
         else round(coalesce(t.clicks, 0)::numeric * 100 / t.impressions, 2) end,
    case when coalesce(t.clicks, 0) = 0 then 0
         else (t.spend / t.clicks)::integer end
  from public.ad_creatives c
  left join (
    select s.creative_id,
           sum(s.impressions) as impressions,
           sum(s.clicks)      as clicks,
           sum(s.spend)       as spend
    from public.ad_daily_stats s
    where s.campaign_id = p_campaign_id
    group by s.creative_id
  ) t on t.creative_id = c.id
  where c.campaign_id = p_campaign_id
  order by coalesce(t.impressions, 0) desc, c.created_at;
end;
$$;

-- Every campaign the caller owns, or every campaign at all for staff, with the
-- same derived figures as the single-campaign call. This is the list an
-- advertiser's console opens on.
create or replace function public.campaign_book(p_limit integer default 50)
returns table (
  campaign_id    uuid,
  owner_uid      text,
  owner_name     text,
  name           text,
  status         bsdc_ad_status,
  pricing        bsdc_ad_pricing,
  bid            integer,
  total_budget   integer,
  spent          integer,
  budget_used_pct numeric,
  impressions    integer,
  clicks         integer,
  ctr            numeric,
  cost_per_click integer,
  starts_at      timestamptz,
  ends_at        timestamptz,
  creative_count integer
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select
    a.id,
    a.owner_uid,
    coalesce(p.display_name, ''),
    a.name,
    a.status,
    a.pricing,
    a.bid,
    a.total_budget,
    a.spent,
    case when a.total_budget = 0 then 0
         else round(a.spent::numeric * 100 / a.total_budget, 1) end,
    coalesce(t.impressions, 0)::integer,
    coalesce(t.clicks, 0)::integer,
    case when coalesce(t.impressions, 0) = 0 then 0
         else round(t.clicks::numeric * 100 / t.impressions, 2) end,
    case when coalesce(t.clicks, 0) = 0 then 0
         else (t.spend / t.clicks)::integer end,
    a.starts_at,
    a.ends_at,
    (select count(*)::integer from public.ad_creatives c where c.campaign_id = a.id)
  from public.ad_campaigns a
  left join public.profiles p on p.uid = a.owner_uid
  left join (
    select s.campaign_id,
           sum(s.impressions) as impressions,
           sum(s.clicks)      as clicks,
           sum(s.spend)       as spend
    from public.ad_daily_stats s
    group by s.campaign_id
  ) t on t.campaign_id = a.id
  where a.owner_uid = bsdc.current_uid() or bsdc.has_permission('ads.manage')
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ---------------------------------------------------------------------------
-- 5. What staff see before they create anything
-- ---------------------------------------------------------------------------
-- The directory an operator picks an owner from, and the wallets they can
-- credit, in one call: two lists that a create form needs side by side and
-- that would otherwise be two round trips and two moments in time.
create or replace function public.campaign_owners(p_search text default '', p_limit integer default 50)
returns table (
  uid           text,
  username      text,
  display_name  text,
  avatar_url    text,
  status        bsdc_account_status,
  campaigns     integer,
  active_campaigns integer,
  wallet_balance integer,
  lifetime_spend integer,
  last_campaign_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('ads.manage');

  return query
  select
    p.uid,
    p.username::text,
    p.display_name,
    coalesce(p.avatar_url, ''),
    p.status,
    (select count(*)::integer from public.ad_campaigns a where a.owner_uid = p.uid),
    (select count(*)::integer from public.ad_campaigns a
      where a.owner_uid = p.uid and a.status = 'active'),
    coalesce((select sum(w.amount)::integer from public.ad_wallet_entries w
              where w.owner_uid = p.uid), 0),
    coalesce((select sum(a.spent)::integer from public.ad_campaigns a
              where a.owner_uid = p.uid), 0),
    (select max(a.created_at) from public.ad_campaigns a where a.owner_uid = p.uid)
  from public.profiles p
  where (
      coalesce(btrim(p_search), '') = ''
      or p.display_name ilike '%' || btrim(p_search) || '%'
      or p.username::text ilike '%' || btrim(p_search) || '%'
      or p.uid ilike '%' || btrim(p_search) || '%'
      -- An owner is whoever has a campaign or a wallet entry; staff searching
      -- for an advertiser find them even before a campaign exists.
      or exists (select 1 from public.ad_campaigns a where a.owner_uid = p.uid)
    )
  order by
    -- Whoever is already advertising comes first: that is who an operator is
    -- usually looking for.
    (select max(a.created_at) from public.ad_campaigns a where a.owner_uid = p.uid) desc nulls last,
    p.display_name
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

-- The inventory an operator is booking: what is live now, and what it is
-- costing. A campaign is created with a bid, and a bid is only meaningful
-- against what the platform is charging today.
create or replace function public.ad_inventory()
returns table (
  placement        bsdc_ad_placement,
  live_campaigns   integer,
  impressions_today integer,
  clicks_today     integer,
  spend_today      integer,
  ctr_today        numeric,
  floor_bid        integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('ads.manage');

  return query
  with placements as (
    select unnest(enum_range(null::bsdc_ad_placement)) as placement
  )
  select
    pl.placement,
    (select count(*)::integer from public.ad_creatives c
       join public.ad_campaigns a on a.id = c.campaign_id
      where c.placement = pl.placement and c.is_enabled and a.status = 'active'),
    coalesce((select sum(s.impressions)::integer from public.ad_daily_stats s
                join public.ad_creatives c on c.id = s.creative_id
               where c.placement = pl.placement and s.day = current_date), 0),
    coalesce((select sum(s.clicks)::integer from public.ad_daily_stats s
                join public.ad_creatives c on c.id = s.creative_id
               where c.placement = pl.placement and s.day = current_date), 0),
    coalesce((select sum(s.spend)::integer from public.ad_daily_stats s
                join public.ad_creatives c on c.id = s.creative_id
               where c.placement = pl.placement and s.day = current_date), 0),
    case when coalesce((select sum(s.impressions) from public.ad_daily_stats s
                         join public.ad_creatives c on c.id = s.creative_id
                        where c.placement = pl.placement and s.day = current_date), 0) = 0
         then 0
         else round(
           coalesce((select sum(s.clicks) from public.ad_daily_stats s
                      join public.ad_creatives c on c.id = s.creative_id
                     where c.placement = pl.placement and s.day = current_date), 0)
           * 100::numeric /
           coalesce((select sum(s.impressions) from public.ad_daily_stats s
                      join public.ad_creatives c on c.id = s.creative_id
                     where c.placement = pl.placement and s.day = current_date), 0), 2)
    end,
    coalesce((select value::text::integer from public.site_config
              where key = 'ads.min_bid'), 100)
  from placements pl;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissions on all of it
-- ---------------------------------------------------------------------------
-- Postgres grants `execute` on a new function to `public` by default, and
-- `anon` is a member of `public`. Granting to `authenticated` alone therefore
-- does not keep an anonymous caller out — it inherits the default. So the
-- default is revoked first, for every one of these, and then the two roles that
-- should have it are given it explicitly: a member, and the service role, which
-- has no default privilege here because it inherits none of `public`'s in this
-- project's role setup. `t26` is the harness that holds the whole schema to
-- this, in both directions.
revoke all on function public.staff_create_campaign(text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz, text[], text[], text, boolean) from public, anon, authenticated;
revoke all on function public.staff_add_creative(uuid, bsdc_ad_placement, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.issue_advertiser_account(text, text, text, text) from public, anon, authenticated;
revoke all on function public.campaign_performance(uuid) from public, anon, authenticated;
revoke all on function public.campaign_timeseries(uuid, integer) from public, anon, authenticated;
revoke all on function public.campaign_creative_performance(uuid) from public, anon, authenticated;
revoke all on function public.campaign_book(integer) from public, anon, authenticated;
revoke all on function public.campaign_owners(text, integer) from public, anon, authenticated;
revoke all on function public.ad_inventory() from public, anon, authenticated;

grant execute on function public.staff_create_campaign(text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz, text[], text[], text, boolean) to authenticated, service_role;
grant execute on function public.staff_add_creative(uuid, bsdc_ad_placement, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.issue_advertiser_account(text, text, text, text) to authenticated, service_role;
grant execute on function public.campaign_performance(uuid) to authenticated, service_role;
grant execute on function public.campaign_timeseries(uuid, integer) to authenticated, service_role;
grant execute on function public.campaign_creative_performance(uuid) to authenticated, service_role;
grant execute on function public.campaign_book(integer) to authenticated, service_role;
grant execute on function public.campaign_owners(text, integer) to authenticated, service_role;
grant execute on function public.ad_inventory() to authenticated, service_role;
