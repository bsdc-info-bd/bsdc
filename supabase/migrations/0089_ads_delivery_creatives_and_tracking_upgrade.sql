-- ---------------------------------------------------------------------------
-- 0089_ads_delivery_creatives_and_tracking_upgrade.sql
--
-- Complete end-to-end advertising upgrade across PostgreSQL, Web, Consoles,
-- and Android:
--   1. Customizable creative metadata (`thumb_url`, `image_alt`, `layout`,
--      `accent_color`, `badge_label`, `platforms`) with ImgBB host
--      enforcement at the database boundary.
--   2. Real guest deduplication and fraud-protected click attribution via
--      `viewer_token` on `public.ad_events` so signed-out Web and Android
--      readers respect daily frequency caps, hourly impression dedup, and
--      impression-before-click enforcement just like signed-in members.
--   3. Upgraded `serve_ads` supporting `p_language`, `p_platform`, contextual
--      `p_topics`, `p_viewer_token`, case-insensitive `target_cities`, and
--      fair CPM/CPC ranking while staying backwards-compatible with 2-arg calls.
--   4. Upgraded `staff_setup_campaign` and `staff_add_creative` plus staff
--      editing/lifecycle RPCs (`campaign_creative_details`, `campaign_details`,
--      `staff_update_campaign`, `staff_update_creative`,
--      `staff_set_creative_enabled`, `staff_activate_campaign`) preserving all
--      existing positional callers and full migration replay compatibility.
-- ---------------------------------------------------------------------------

set search_path = public, bsdc, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Creative customization columns & ImgBB enforcement
-- ---------------------------------------------------------------------------
alter table public.ad_creatives
  add column if not exists thumb_url text not null default '',
  add column if not exists image_alt text not null default '',
  add column if not exists layout text not null default 'card',
  add column if not exists accent_color text not null default '',
  add column if not exists badge_label text not null default '',
  add column if not exists platforms text[] not null default array['web', 'android']::text[];

alter table public.ad_creatives drop constraint if exists ad_creatives_thumb_url_len;
alter table public.ad_creatives add constraint ad_creatives_thumb_url_len
  check (char_length(thumb_url) <= 500);

alter table public.ad_creatives drop constraint if exists ad_creatives_image_alt_len;
alter table public.ad_creatives add constraint ad_creatives_image_alt_len
  check (char_length(image_alt) <= 200);

alter table public.ad_creatives drop constraint if exists ad_creatives_layout_check;
alter table public.ad_creatives add constraint ad_creatives_layout_check
  check (layout in ('banner', 'card', 'compact', 'native'));

alter table public.ad_creatives drop constraint if exists ad_creatives_accent_color_check;
alter table public.ad_creatives add constraint ad_creatives_accent_color_check
  check (accent_color = '' or accent_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.ad_creatives drop constraint if exists ad_creatives_badge_label_len;
alter table public.ad_creatives add constraint ad_creatives_badge_label_len
  check (char_length(badge_label) <= 32);

alter table public.ad_creatives drop constraint if exists ad_creatives_platforms_check;
alter table public.ad_creatives add constraint ad_creatives_platforms_check
  check (platforms <@ array['web', 'android']::text[] and cardinality(platforms) >= 1);

alter table public.ad_creatives drop constraint if exists ad_creatives_imgbb_only_check;
alter table public.ad_creatives add constraint ad_creatives_imgbb_only_check
  check (
    (image_url = '' or bsdc.media_host_of(image_url) = 'imgbb')
    and (thumb_url = '' or bsdc.media_host_of(thumb_url) = 'imgbb')
  );

-- ---------------------------------------------------------------------------
-- 2. Anonymous viewer-token deduplication on ad_events
-- ---------------------------------------------------------------------------
alter table public.ad_events
  add column if not exists viewer_token text not null default '';

alter table public.ad_events drop constraint if exists ad_events_viewer_token_len;
alter table public.ad_events add constraint ad_events_viewer_token_len
  check (char_length(viewer_token) <= 80);

create unique index if not exists ad_events_guest_once
  on public.ad_events (creative_id, viewer_token, kind, bucket)
  where uid is null and viewer_token <> '';

create index if not exists ad_events_guest_lookup_idx
  on public.ad_events (creative_id, viewer_token, kind, created_at desc)
  where uid is null and viewer_token <> '';

-- ---------------------------------------------------------------------------
-- 3. Internal creative validation helper
-- ---------------------------------------------------------------------------
create or replace function bsdc.validate_ad_creative_fields(
  p_headline     text,
  p_body         text,
  p_target_url   text,
  p_image_url    text,
  p_thumb_url    text,
  p_image_alt    text,
  p_cta_label    text,
  p_layout       text,
  p_accent_color text,
  p_badge_label  text,
  p_platforms    text[]
)
returns void
language plpgsql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_img   text := btrim(coalesce(p_image_url, ''));
  v_thumb text := btrim(coalesce(p_thumb_url, ''));
  v_color text := btrim(coalesce(p_accent_color, ''));
begin
  if char_length(btrim(coalesce(p_headline, ''))) not between 3 and 80 then
    raise exception 'A creative headline must be between 3 and 80 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 200 then
    raise exception 'Creative body copy cannot exceed 200 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_cta_label, '')) > 32 then
    raise exception 'Button label cannot exceed 32 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_image_alt, '')) > 200 then
    raise exception 'Image description cannot exceed 200 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_badge_label, '')) > 32 then
    raise exception 'Badge label cannot exceed 32 characters' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_target_url, ''))) not between 12 and 500
     or btrim(coalesce(p_target_url, '')) !~ '^https://[^\s]+$' then
    raise exception 'Destination must be an https URL' using errcode = '22023';
  end if;
  if char_length(v_img) > 500 or char_length(v_thumb) > 500 then
    raise exception 'Image URL is too long' using errcode = '22023';
  end if;
  if v_img <> '' and bsdc.media_host_of(v_img) <> 'imgbb' then
    raise exception 'Ad images must be hosted on ImgBB' using errcode = '22023';
  end if;
  if v_thumb <> '' and bsdc.media_host_of(v_thumb) <> 'imgbb' then
    raise exception 'Ad thumbnails must be hosted on ImgBB' using errcode = '22023';
  end if;
  if coalesce(p_layout, 'card') not in ('banner', 'card', 'compact', 'native') then
    raise exception 'Invalid creative layout' using errcode = '22023';
  end if;
  if v_color <> '' and v_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Accent color must be a 6-digit hex color such as #15803d' using errcode = '22023';
  end if;
  if p_platforms is null or cardinality(p_platforms) = 0 or not (p_platforms <@ array['web', 'android']::text[]) then
    raise exception 'Select at least one delivery platform (web or android)' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Serving & event tracking (backwards-compatible 2-arg positional callers)
-- ---------------------------------------------------------------------------
drop function if exists public.serve_ads(bsdc_ad_placement, integer);

create or replace function public.serve_ads(
  p_placement    bsdc_ad_placement,
  p_limit        integer default 2,
  p_platform     text default 'web',
  p_language     text default 'any',
  p_topic        text default '',
  p_city         text default '',
  p_topics       text[] default '{}',
  p_viewer_token text default ''
)
returns table (
  creative_id  uuid,
  campaign_id  uuid,
  headline     text,
  body         text,
  image_url    text,
  thumb_url    text,
  image_alt    text,
  cta_label    text,
  target_url   text,
  placement    bsdc_ad_placement,
  layout       text,
  accent_color text,
  badge_label  text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with viewer as (
    select
      bsdc.current_uid() as uid,
      left(btrim(coalesce(p_viewer_token, '')), 80) as token,
      lower(btrim(coalesce(p_language, 'any'))) as lang,
      lower(btrim(coalesce(p_platform, 'web'))) as plat,
      coalesce(
        nullif(btrim(coalesce(p_city, '')), ''),
        (select p.location from public.profiles p where p.uid = bsdc.current_uid()),
        ''
      ) as city,
      (
        coalesce((select p.interests from public.profiles p where p.uid = bsdc.current_uid()), '{}'::text[])
        || coalesce(p_topics, '{}'::text[])
        || case
             when btrim(coalesce(p_topic, '')) <> ''
             then regexp_split_to_array(btrim(p_topic), '[\s,]+')
             else '{}'::text[]
           end
      ) as match_topics
  )
  select
    c.id,
    c.campaign_id,
    c.headline,
    c.body,
    c.image_url,
    case when c.thumb_url <> '' then c.thumb_url else c.image_url end,
    c.image_alt,
    c.cta_label,
    c.target_url,
    c.placement,
    c.layout,
    c.accent_color,
    c.badge_label
  from public.ad_creatives c
  join public.ad_campaigns a on a.id = c.campaign_id
  cross join viewer v
  where c.is_enabled
    and c.placement = p_placement
    and (
      v.plat in ('', 'all', 'any')
      or v.plat = any (c.platforms)
    )
    and a.status = 'active'
    and a.starts_at <= now()
    and (a.ends_at is null or a.ends_at > now())
    and a.spent < a.total_budget
    -- All campaigns of an owner share one wallet, not a balance each.
    and coalesce((select sum(w.amount) from public.ad_wallet_entries w
                  where w.owner_uid = a.owner_uid), 0) > 0
    -- The daily cap is honoured at serve time, not only at charge time.
    and (a.daily_budget = 0 or bsdc.ad_spend_today(a.id) < a.daily_budget)
    -- Language targeting: 'any' reaches everybody; otherwise match requested locale.
    and (
      a.target_language = 'any'
      or v.lang in ('', 'any')
      or lower(a.target_language) = v.lang
    )
    -- Case-insensitive city matching: empty list targets every city.
    and (
      cardinality(a.target_cities) = 0
      or (
        btrim(v.city) <> ''
        and exists (
          select 1 from unnest(a.target_cities) as tc
          where lower(btrim(tc)) = lower(btrim(v.city))
        )
      )
    )
    -- Topic matching across member interests and contextual page/search topics.
    and (
      cardinality(a.target_topics) = 0
      or exists (
        select 1 from unnest(a.target_topics) as tt
        where lower(btrim(tt)) = any (
          select lower(btrim(x))
          from unnest(v.match_topics) as x
          where btrim(x) <> ''
        )
      )
    )
    -- Frequency cap: max 8 impressions per creative per viewer per day.
    and (
      (v.uid is null and char_length(v.token) < 8)
      or (
        v.uid is not null and (
          select count(*) from public.ad_events e
          where e.creative_id = c.id and e.uid = v.uid and e.kind = 'impression'
            and e.created_at >= date_trunc('day', now())
        ) < 8
      )
      or (
        v.uid is null and char_length(v.token) >= 8 and (
          select count(*) from public.ad_events e
          where e.creative_id = c.id and e.uid is null and e.viewer_token = v.token
            and e.kind = 'impression' and e.created_at >= date_trunc('day', now())
        ) < 8
      )
    )
  order by
    (
      greatest(
        bsdc.ad_event_cost(a.pricing, a.bid, 'impression'),
        case when a.pricing = 'cpc' then greatest(1, a.bid / 100) else 0 end,
        1
      )::double precision * (0.75 + random() * 0.5)
    ) desc
  limit greatest(1, least(coalesce(p_limit, 2), 5));
$$;

drop function if exists public.record_ad_event(uuid, bsdc_ad_event_kind);

create or replace function public.record_ad_event(
  p_creative_id  uuid,
  p_kind         bsdc_ad_event_kind,
  p_viewer_token text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid             text := bsdc.current_uid();
  v_token           text := case
    when bsdc.current_uid() is null then left(btrim(coalesce(p_viewer_token, '')), 80)
    else ''
  end;
  v_creative        public.ad_creatives%rowtype;
  v_campaign        public.ad_campaigns%rowtype;
  v_bucket          timestamptz;
  v_cost            integer;
  v_remaining       integer;
  v_daily_remaining integer;
  v_balance         bigint;
begin
  select * into v_creative from public.ad_creatives where id = p_creative_id;
  if not found or not v_creative.is_enabled then
    return false;
  end if;

  select * into v_campaign from public.ad_campaigns
  where id = v_creative.campaign_id
  for update;

  if not found or v_campaign.status <> 'active' or v_campaign.starts_at > now()
     or (v_campaign.ends_at is not null and v_campaign.ends_at <= now()) then
    return false;
  end if;

  v_bucket := case
    when p_kind = 'impression' then date_trunc('hour', now())
    else date_trunc('day', now())
  end;

  if p_kind = 'click' then
    -- A click must follow a recent impression for the same member OR verified
    -- anonymous viewer token; forged standalone clicks are discarded.
    if v_uid is not null then
      if not exists (
        select 1 from public.ad_events e
        where e.creative_id = p_creative_id and e.uid = v_uid and e.kind = 'impression'
          and e.created_at >= now() - interval '2 hours'
      ) then
        return false;
      end if;
    elsif char_length(v_token) >= 8 then
      if not exists (
        select 1 from public.ad_events e
        where e.creative_id = p_creative_id and e.uid is null and e.viewer_token = v_token
          and e.kind = 'impression' and e.created_at >= now() - interval '2 hours'
      ) then
        return false;
      end if;
    else
      return false;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bsdc.ad_wallet:' || v_campaign.owner_uid, 0));
  select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries
   where owner_uid = v_campaign.owner_uid;
  v_remaining := v_campaign.total_budget - v_campaign.spent;
  v_daily_remaining := case when v_campaign.daily_budget = 0 then v_remaining
    else greatest(0, v_campaign.daily_budget - bsdc.ad_spend_today(v_campaign.id)) end;

  if v_remaining <= 0 or v_daily_remaining <= 0 or v_balance <= 0 then
    return false;
  end if;

  v_cost := least(
    bsdc.ad_event_cost(v_campaign.pricing, v_campaign.bid, p_kind),
    v_remaining,
    v_daily_remaining,
    v_balance
  )::integer;

  begin
    insert into public.ad_events (
      creative_id, campaign_id, uid, viewer_token, kind, placement, cost, bucket
    ) values (
      p_creative_id, v_campaign.id, v_uid,
      case when v_uid is null and char_length(v_token) >= 8 then v_token else '' end,
      p_kind, v_creative.placement, v_cost, v_bucket
    );
  exception
    when unique_violation then
      return false;
  end;

  insert into public.ad_daily_stats (campaign_id, creative_id, day, impressions, clicks, spend)
  values (
    v_campaign.id, p_creative_id, current_date,
    case when p_kind = 'impression' then 1 else 0 end,
    case when p_kind = 'click' then 1 else 0 end,
    v_cost
  )
  on conflict (campaign_id, creative_id, day) do update
  set impressions = public.ad_daily_stats.impressions + excluded.impressions,
      clicks      = public.ad_daily_stats.clicks + excluded.clicks,
      spend       = public.ad_daily_stats.spend + excluded.spend;

  if v_cost > 0 then
    insert into public.ad_wallet_entries (owner_uid, campaign_id, kind, amount, memo)
    values (v_campaign.owner_uid, v_campaign.id, 'spend', -v_cost, v_campaign.name);

    update public.ad_campaigns
    set spent = spent + v_cost,
        status = case when spent + v_cost >= total_budget then 'completed' else status end
    where id = v_campaign.id;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Staff & owner creative / campaign creation and update RPCs
-- ---------------------------------------------------------------------------
drop function if exists public.staff_add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text
);

create or replace function public.staff_add_creative(
  p_campaign_id  uuid,
  p_placement    bsdc_ad_placement,
  p_headline     text,
  p_body         text,
  p_target_url   text,
  p_image_url    text default '',
  p_cta_label    text default '',
  p_thumb_url    text default '',
  p_image_alt    text default '',
  p_layout       text default 'card',
  p_accent_color text default '',
  p_badge_label  text default '',
  p_platforms    text[] default array['web', 'android']::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id        uuid;
  v_layout    text := coalesce(nullif(btrim(coalesce(p_layout, '')), ''), 'card');
  v_platforms text[] := coalesce(p_platforms, array['web', 'android']::text[]);
begin
  perform bsdc.require_permission('ads.manage');

  if not exists (select 1 from public.ad_campaigns where id = p_campaign_id) then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;

  perform bsdc.validate_ad_creative_fields(
    p_headline, p_body, p_target_url, p_image_url, p_thumb_url, p_image_alt,
    p_cta_label, v_layout, p_accent_color, p_badge_label, v_platforms
  );

  insert into public.ad_creatives (
    campaign_id, placement, headline, body, target_url, image_url, cta_label,
    thumb_url, image_alt, layout, accent_color, badge_label, platforms
  ) values (
    p_campaign_id,
    p_placement,
    btrim(p_headline),
    coalesce(p_body, ''),
    btrim(p_target_url),
    btrim(coalesce(p_image_url, '')),
    btrim(coalesce(p_cta_label, '')),
    btrim(coalesce(p_thumb_url, '')),
    btrim(coalesce(p_image_alt, '')),
    v_layout,
    btrim(coalesce(p_accent_color, '')),
    btrim(coalesce(p_badge_label, '')),
    v_platforms
  ) returning id into v_id;

  perform bsdc.audit('campaign.creative', v_id::text, jsonb_build_object('campaign', p_campaign_id));
  return v_id;
end;
$$;

drop function if exists public.add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text
);

create or replace function public.add_creative(
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
begin
  perform bsdc.require_permission('ads.manage');
  return public.staff_add_creative(
    p_campaign_id, p_placement, p_headline, p_body, p_target_url, p_image_url, p_cta_label
  );
end;
$$;

drop function if exists public.staff_setup_campaign(
  text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz,
  timestamptz, text[], text[], text, boolean, bsdc_ad_placement, text,
  text, text, text, text
);

create or replace function public.staff_setup_campaign(
  p_owner_uid    text,
  p_name         text,
  p_pricing      bsdc_ad_pricing,
  p_bid          integer,
  p_total_budget integer,
  p_daily_budget integer,
  p_starts_at    timestamptz,
  p_ends_at      timestamptz,
  p_cities       text[],
  p_topics       text[],
  p_language     text,
  p_activate     boolean,
  p_placement    bsdc_ad_placement,
  p_headline     text,
  p_body         text,
  p_target_url   text,
  p_image_url    text,
  p_cta_label    text,
  p_thumb_url    text default '',
  p_image_alt    text default '',
  p_layout       text default 'card',
  p_accent_color text default '',
  p_badge_label  text default '',
  p_platforms    text[] default array['web', 'android']::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  perform bsdc.require_permission('ads.manage');
  v_id := public.staff_create_campaign(
    p_owner_uid, p_name, p_pricing, p_bid, p_total_budget, p_daily_budget,
    p_starts_at, p_ends_at, p_cities, p_topics, p_language, false
  );
  if btrim(coalesce(p_headline, '')) <> '' or btrim(coalesce(p_target_url, '')) <> ''
     or coalesce(p_body, '') <> '' or coalesce(p_cta_label, '') <> ''
     or coalesce(p_image_url, '') <> '' or coalesce(p_thumb_url, '') <> '' then
    perform public.staff_add_creative(
      v_id, p_placement, p_headline, p_body, p_target_url, p_image_url, p_cta_label,
      p_thumb_url, p_image_alt, p_layout, p_accent_color, p_badge_label, p_platforms
    );
  end if;
  if p_activate then
    perform public.submit_campaign(v_id);
    perform public.decide_campaign(v_id, true, '');
  end if;
  return v_id;
end;
$$;

create or replace function public.staff_update_campaign(
  p_campaign_id  uuid,
  p_name         text default null,
  p_pricing      bsdc_ad_pricing default null,
  p_bid          integer default null,
  p_total_budget integer default null,
  p_daily_budget integer default null,
  p_starts_at    timestamptz default null,
  p_ends_at      timestamptz default null,
  p_clear_end    boolean default false,
  p_cities       text[] default null,
  p_topics       text[] default null,
  p_language     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign public.ad_campaigns%rowtype;
  v_min_bid  integer;
  v_balance  bigint;
  v_name     text;
  v_pricing  bsdc_ad_pricing;
  v_bid      integer;
  v_total    integer;
  v_daily    integer;
  v_starts   timestamptz;
  v_ends     timestamptz;
  v_cities   text[];
  v_topics   text[];
  v_language text;
begin
  perform bsdc.require_permission('ads.manage');
  select * into v_campaign from public.ad_campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'completed' then
    raise exception 'A finished campaign cannot be edited' using errcode = '22023';
  end if;

  select coalesce((select value::text::integer from public.site_config where key = 'ads.min_bid'), 100)
    into v_min_bid;

  v_name := btrim(coalesce(p_name, v_campaign.name));
  v_pricing := coalesce(p_pricing, v_campaign.pricing);
  v_bid := coalesce(p_bid, v_campaign.bid);
  v_total := coalesce(p_total_budget, v_campaign.total_budget);
  v_daily := coalesce(p_daily_budget, v_campaign.daily_budget);
  v_starts := coalesce(p_starts_at, v_campaign.starts_at);
  v_ends := case when coalesce(p_clear_end, false) then null else coalesce(p_ends_at, v_campaign.ends_at) end;
  v_cities := coalesce(p_cities, v_campaign.target_cities);
  v_topics := coalesce(p_topics, v_campaign.target_topics);
  v_language := coalesce(nullif(btrim(coalesce(p_language, '')), ''), v_campaign.target_language);

  if char_length(v_name) not between 3 and 120 then
    raise exception 'A campaign name must be between 3 and 120 characters' using errcode = '22023';
  end if;
  if v_bid < v_min_bid or v_bid > 10000000 then
    raise exception 'The bid is outside the allowed bounds (floor % poisha)', v_min_bid using errcode = '22023';
  end if;
  if v_total < greatest(1000, v_campaign.spent) or v_total > 1000000000 then
    raise exception 'Total budget must cover existing spend (% poisha) and be at least 1000 poisha', v_campaign.spent using errcode = '22023';
  end if;
  if v_daily < 0 or v_daily > 1000000000 or (v_daily > 0 and v_daily > v_total) then
    raise exception 'Daily cap must be 0 or less than total budget' using errcode = '22023';
  end if;
  if v_ends is not null and v_ends <= v_starts then
    raise exception 'End date must be after start date' using errcode = '22023';
  end if;
  if v_language not in ('any', 'bn', 'en') then
    raise exception 'Target language must be any, bn, or en' using errcode = '22023';
  end if;

  if v_campaign.status = 'active' and v_total > v_campaign.total_budget then
    select coalesce(sum(amount), 0) into v_balance
      from public.ad_wallet_entries where owner_uid = v_campaign.owner_uid;
    if v_balance < v_total - v_campaign.spent then
      raise exception 'Credit the wallet before increasing an active campaign budget' using errcode = '22023';
    end if;
  end if;

  update public.ad_campaigns
     set name            = v_name,
         pricing         = v_pricing,
         bid             = v_bid,
         total_budget    = v_total,
         daily_budget    = v_daily,
         starts_at       = v_starts,
         ends_at         = v_ends,
         target_cities   = v_cities,
         target_topics   = v_topics,
         target_language = v_language
   where id = p_campaign_id;

  perform bsdc.audit('campaign.update', p_campaign_id::text, jsonb_build_object(
    'pricing', v_pricing, 'bid', v_bid, 'total_budget', v_total, 'language', v_language
  ));
  return p_campaign_id;
end;
$$;

create or replace function public.staff_update_creative(
  p_creative_id  uuid,
  p_placement    bsdc_ad_placement default null,
  p_headline     text default null,
  p_body         text default null,
  p_target_url   text default null,
  p_image_url    text default null,
  p_cta_label    text default null,
  p_thumb_url    text default null,
  p_image_alt    text default null,
  p_layout       text default null,
  p_accent_color text default null,
  p_badge_label  text default null,
  p_platforms    text[] default null,
  p_is_enabled   boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_creative public.ad_creatives%rowtype;
  v_status   bsdc_ad_status;
  v_place    bsdc_ad_placement;
  v_headline text;
  v_body     text;
  v_url      text;
  v_image    text;
  v_thumb    text;
  v_alt      text;
  v_cta      text;
  v_layout   text;
  v_color    text;
  v_badge    text;
  v_plats    text[];
  v_enabled  boolean;
begin
  perform bsdc.require_permission('ads.manage');
  select * into v_creative from public.ad_creatives where id = p_creative_id for update;
  if not found then
    raise exception 'No such creative' using errcode = 'P0002';
  end if;
  select status into v_status from public.ad_campaigns where id = v_creative.campaign_id for update;
  if v_status = 'completed' then
    raise exception 'Creatives on a finished campaign cannot be edited' using errcode = '22023';
  end if;

  v_place := coalesce(p_placement, v_creative.placement);
  v_headline := btrim(coalesce(p_headline, v_creative.headline));
  v_body := coalesce(p_body, v_creative.body);
  v_url := btrim(coalesce(p_target_url, v_creative.target_url));
  v_image := btrim(coalesce(p_image_url, v_creative.image_url));
  v_thumb := btrim(coalesce(p_thumb_url, v_creative.thumb_url));
  v_alt := btrim(coalesce(p_image_alt, v_creative.image_alt));
  v_cta := btrim(coalesce(p_cta_label, v_creative.cta_label));
  v_layout := coalesce(nullif(btrim(coalesce(p_layout, '')), ''), v_creative.layout);
  v_color := btrim(coalesce(p_accent_color, v_creative.accent_color));
  v_badge := btrim(coalesce(p_badge_label, v_creative.badge_label));
  v_plats := coalesce(p_platforms, v_creative.platforms);
  v_enabled := coalesce(p_is_enabled, v_creative.is_enabled);

  perform bsdc.validate_ad_creative_fields(
    v_headline, v_body, v_url, v_image, v_thumb, v_alt,
    v_cta, v_layout, v_color, v_badge, v_plats
  );

  update public.ad_creatives
     set placement    = v_place,
         headline     = v_headline,
         body         = v_body,
         target_url   = v_url,
         image_url    = v_image,
         thumb_url    = v_thumb,
         image_alt    = v_alt,
         cta_label    = v_cta,
         layout       = v_layout,
         accent_color = v_color,
         badge_label  = v_badge,
         platforms    = v_plats,
         is_enabled   = v_enabled
   where id = p_creative_id;

  perform bsdc.audit('campaign.creative.update', p_creative_id::text, jsonb_build_object('campaign', v_creative.campaign_id));
  return p_creative_id;
end;
$$;

create or replace function public.staff_set_creative_enabled(
  p_creative_id uuid,
  p_enabled     boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  perform bsdc.require_permission('ads.manage');
  update public.ad_creatives
     set is_enabled = coalesce(p_enabled, true)
   where id = p_creative_id
  returning campaign_id into v_campaign_id;

  if v_campaign_id is null then
    raise exception 'No such creative' using errcode = 'P0002';
  end if;

  perform bsdc.audit('campaign.creative.toggle', p_creative_id::text,
    jsonb_build_object('campaign', v_campaign_id, 'enabled', coalesce(p_enabled, true)));
  return coalesce(p_enabled, true);
end;
$$;

create or replace function public.staff_activate_campaign(p_campaign_id uuid)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign public.ad_campaigns%rowtype;
  v_balance  bigint;
begin
  perform bsdc.require_permission('ads.manage');
  select * into v_campaign from public.ad_campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'No such campaign' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'active' then
    return 'active'::bsdc_ad_status;
  end if;
  if v_campaign.status not in ('draft', 'rejected', 'paused', 'pending_review') then
    raise exception 'Only an unfinished campaign can be activated' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_creatives c where c.campaign_id = p_campaign_id and c.is_enabled) then
    raise exception 'A campaign needs at least one enabled creative before going live' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_balance
    from public.ad_wallet_entries where owner_uid = v_campaign.owner_uid;
  if v_balance < v_campaign.total_budget - v_campaign.spent then
    raise exception 'Credit the wallet before activating this campaign' using errcode = '22023';
  end if;

  update public.ad_campaigns
     set status = 'active', review_note = ''
   where id = p_campaign_id;

  perform bsdc.audit('campaign.activate', p_campaign_id::text, '{}'::jsonb);
  perform bsdc.notify(v_campaign.owner_uid, bsdc.current_uid(), 'moderation', null, null,
    'Your campaign is live');
  return 'active'::bsdc_ad_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Read models exposing creative metadata and campaign targeting for editing
-- ---------------------------------------------------------------------------
create or replace function public.campaign_creative_details(p_campaign_id uuid)
returns table (
  creative_id    uuid,
  placement      bsdc_ad_placement,
  headline       text,
  body           text,
  image_url      text,
  cta_label      text,
  target_url     text,
  is_enabled     boolean,
  impressions    integer,
  clicks         integer,
  spend          integer,
  ctr            numeric,
  cost_per_click integer,
  thumb_url      text,
  image_alt      text,
  layout         text,
  accent_color   text,
  badge_label    text,
  platforms      text[]
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
  if v_owner <> bsdc.current_uid()
     and not bsdc.is_staff()
     and not bsdc.has_permission('ads.manage') then
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
         else (t.spend / t.clicks)::integer end,
    c.thumb_url,
    c.image_alt,
    c.layout,
    c.accent_color,
    c.badge_label,
    c.platforms
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

create or replace function public.campaign_details(p_campaign_id uuid)
returns table (
  campaign_id     uuid,
  owner_uid       text,
  name            text,
  status          bsdc_ad_status,
  pricing         bsdc_ad_pricing,
  bid             integer,
  total_budget    integer,
  daily_budget    integer,
  spent           integer,
  starts_at       timestamptz,
  ends_at         timestamptz,
  target_cities   text[],
  target_topics   text[],
  target_language text,
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
  if v_owner <> bsdc.current_uid() and not bsdc.has_permission('ads.manage') then
    raise exception 'That campaign is not yours' using errcode = '42501';
  end if;

  return query
  select
    a.id, a.owner_uid, a.name, a.status, a.pricing, a.bid, a.total_budget,
    a.daily_budget, a.spent, a.starts_at, a.ends_at, a.target_cities,
    a.target_topics, a.target_language, a.review_note
  from public.ad_campaigns a
  where a.id = p_campaign_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Explicit execute grants
-- ---------------------------------------------------------------------------
revoke all on function public.staff_add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text, text, text, text, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.staff_add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text, text, text, text, text, text, text[]
) to authenticated, service_role;

revoke all on function public.add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text
) to authenticated, service_role;

revoke all on function public.staff_setup_campaign(
  text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz,
  timestamptz, text[], text[], text, boolean, bsdc_ad_placement, text,
  text, text, text, text, text, text, text, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.staff_setup_campaign(
  text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz,
  timestamptz, text[], text[], text, boolean, bsdc_ad_placement, text,
  text, text, text, text, text, text, text, text, text, text[]
) to authenticated, service_role;

revoke all on function public.staff_update_campaign(
  uuid, text, bsdc_ad_pricing, integer, integer, integer, timestamptz,
  timestamptz, boolean, text[], text[], text
) from public, anon, authenticated;
grant execute on function public.staff_update_campaign(
  uuid, text, bsdc_ad_pricing, integer, integer, integer, timestamptz,
  timestamptz, boolean, text[], text[], text
) to authenticated, service_role;

revoke all on function public.staff_update_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text, text, text, text, text, text, text[], boolean
) from public, anon, authenticated;
grant execute on function public.staff_update_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text, text, text, text, text, text, text[], boolean
) to authenticated, service_role;

revoke all on function public.staff_set_creative_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.staff_set_creative_enabled(uuid, boolean) to authenticated, service_role;

revoke all on function public.staff_activate_campaign(uuid) from public, anon, authenticated;
grant execute on function public.staff_activate_campaign(uuid) to authenticated, service_role;

revoke all on function public.campaign_creative_details(uuid) from public, anon, authenticated;
grant execute on function public.campaign_creative_details(uuid) to authenticated, service_role;

revoke all on function public.campaign_details(uuid) from public, anon, authenticated;
grant execute on function public.campaign_details(uuid) to authenticated, service_role;

revoke all on function public.serve_ads(
  bsdc_ad_placement, integer, text, text, text, text, text[], text
) from public;
grant execute on function public.serve_ads(
  bsdc_ad_placement, integer, text, text, text, text, text[], text
) to anon, authenticated, service_role;

revoke all on function public.record_ad_event(uuid, bsdc_ad_event_kind, text) from public;
grant execute on function public.record_ad_event(uuid, bsdc_ad_event_kind, text) to anon, authenticated, service_role;
