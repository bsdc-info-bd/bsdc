-- A staff-created campaign must not retain the old self-service doors.
--
-- 0077 added a staff creation API and an owner reporting API, but 0022/0023
-- still exposed create_campaign and direct writes to drafts and creatives.
-- Hiding those controls in a screen cannot protect a budget or an approval.
-- Keep the legacy signatures, but require ads.manage on staff actions; the
-- owner gets one narrow copy-editing RPC and pause/resume, not table writes.

set search_path = public, bsdc, extensions, pg_temp;

-- 0042 granted UPDATE at column level; revoking only the table privilege would
-- leave those grants alive. Remove the policies too, so a later blanket grant
-- cannot silently restore the old owner-write path.
drop policy if exists ad_campaigns_insert_own on public.ad_campaigns;
drop policy if exists ad_campaigns_update_draft on public.ad_campaigns;
drop policy if exists ad_campaigns_delete_draft on public.ad_campaigns;
drop policy if exists ad_creatives_write_own on public.ad_creatives;
drop policy if exists ad_creatives_delete_own on public.ad_creatives;

revoke insert, update, delete on public.ad_campaigns from public, anon, authenticated;
revoke update (
  name, pricing, bid, daily_budget, total_budget, starts_at, ends_at,
  target_cities, target_topics, target_language
) on public.ad_campaigns from authenticated;
revoke insert, update, delete on public.ad_creatives from public, anon, authenticated;

-- Keep the old signature callable for compatible staff clients, but route it
-- through the same permission-checked implementation as the staff console.
create or replace function public.create_campaign(
  p_name text,
  p_pricing bsdc_ad_pricing,
  p_bid integer,
  p_total_budget integer,
  p_daily_budget integer default 0,
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_cities text[] default '{}',
  p_topics text[] default '{}',
  p_language text default 'any'
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('ads.manage');
  return public.staff_create_campaign(
    bsdc.current_uid(), p_name, p_pricing, p_bid, p_total_budget,
    p_daily_budget, p_starts_at, p_ends_at, p_cities, p_topics, p_language, false
  );
end;
$$;

-- Creating another creative, including its placement and destination, is a
-- staff decision. Owners can edit only the copy on an existing creative.
create or replace function public.staff_add_creative(
  p_campaign_id uuid,
  p_placement bsdc_ad_placement,
  p_headline text,
  p_body text,
  p_target_url text,
  p_image_url text default '',
  p_cta_label text default ''
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
  insert into public.ad_creatives (
    campaign_id, placement, headline, body, target_url, image_url, cta_label
  ) values (
    p_campaign_id, p_placement, btrim(p_headline), coalesce(p_body, ''),
    btrim(p_target_url), coalesce(p_image_url, ''), coalesce(p_cta_label, '')
  ) returning id into v_id;
  perform bsdc.audit('campaign.creative', v_id::text, jsonb_build_object('campaign', p_campaign_id));
  return v_id;
end;
$$;

create or replace function public.add_creative(
  p_campaign_id uuid,
  p_placement bsdc_ad_placement,
  p_headline text,
  p_body text,
  p_target_url text,
  p_image_url text default '',
  p_cta_label text default ''
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

-- The owner may change words, not placement, image, destination, or enabled
-- state. Lock the campaign first: an approval and an edit cannot race each
-- other. A paused campaign also returns to review, so Resume cannot bypass it.
create or replace function public.edit_campaign_creative(
  p_creative_id uuid,
  p_headline text,
  p_body text,
  p_cta_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign public.ad_campaigns%rowtype;
begin
  select a.* into v_campaign
    from public.ad_campaigns a
    join public.ad_creatives c on c.campaign_id = a.id
   where c.id = p_creative_id
   for update of a;
  if not found or v_campaign.owner_uid is distinct from bsdc.current_uid() then
    raise exception 'That creative is not yours to edit' using errcode = '42501';
  end if;
  if v_campaign.status = 'completed' then
    raise exception 'A finished campaign cannot be edited' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_headline, ''))) not between 3 and 80
     or char_length(coalesce(p_body, '')) > 200
     or char_length(coalesce(p_cta_label, '')) > 32 then
    raise exception 'The creative copy is outside its allowed length' using errcode = '22023';
  end if;

  update public.ad_creatives
     set headline = btrim(p_headline), body = coalesce(p_body, ''),
         cta_label = coalesce(p_cta_label, '')
   where id = p_creative_id and campaign_id = v_campaign.id;
  update public.ad_campaigns
     set status = 'pending_review', review_note = ''
   where id = v_campaign.id;
  perform bsdc.audit('campaign.copy.edit', p_creative_id::text,
    jsonb_build_object('campaign', v_campaign.id));
  return p_creative_id;
end;
$$;

-- Submitting a draft is a staff operation as well. The wallet must cover the
-- remaining budget and an enabled creative must exist before it can be queued.
create or replace function public.submit_campaign(p_campaign_id uuid)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign public.ad_campaigns%rowtype;
  v_balance bigint;
begin
  perform bsdc.require_permission('ads.manage');
  select * into v_campaign from public.ad_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'No such campaign' using errcode = 'P0002'; end if;
  if v_campaign.status not in ('draft', 'rejected') then
    raise exception 'Only a draft or rejected campaign can be submitted' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ad_creatives c where c.campaign_id = p_campaign_id and c.is_enabled) then
    raise exception 'A campaign needs at least one creative' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries
   where owner_uid = v_campaign.owner_uid;
  if v_balance < v_campaign.total_budget - v_campaign.spent then
    raise exception 'Credit the wallet before submitting this budget' using errcode = '22023';
  end if;
  update public.ad_campaigns set status = 'pending_review', review_note = '' where id = p_campaign_id;
  perform bsdc.audit('campaign.submit', p_campaign_id::text, '{}'::jsonb);
  return 'pending_review'::bsdc_ad_status;
end;
$$;

-- An approval is a fresh check, not a promise that funding or creative still
-- exists. Only ads staff can approve, and a refusal must tell the owner why.
create or replace function public.decide_campaign(
  p_campaign_id uuid,
  p_approve boolean,
  p_note text default ''
)
returns bsdc_ad_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_campaign public.ad_campaigns%rowtype;
  v_balance bigint;
  v_status bsdc_ad_status;
begin
  perform bsdc.require_permission('ads.manage');
  select * into v_campaign from public.ad_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'No such campaign' using errcode = 'P0002'; end if;
  if v_campaign.status <> 'pending_review' then
    raise exception 'Only a campaign awaiting review can be decided' using errcode = '22023';
  end if;
  if p_approve then
    if not exists (select 1 from public.ad_creatives c where c.campaign_id = p_campaign_id and c.is_enabled) then
      raise exception 'A campaign needs an enabled creative before approval' using errcode = '22023';
    end if;
    select coalesce(sum(amount), 0) into v_balance from public.ad_wallet_entries
     where owner_uid = v_campaign.owner_uid;
    if v_balance < v_campaign.total_budget - v_campaign.spent then
      raise exception 'Credit the wallet before approving this budget' using errcode = '22023';
    end if;
    v_status := 'active';
  else
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'A refusal needs a reason' using errcode = '22023';
    end if;
    v_status := 'rejected';
  end if;
  update public.ad_campaigns set status = v_status, review_note = coalesce(p_note, '')
   where id = p_campaign_id;
  perform bsdc.audit('campaign.decide', p_campaign_id::text,
    jsonb_build_object('approved', p_approve, 'note', coalesce(p_note, '')));
  perform bsdc.notify(v_campaign.owner_uid, bsdc.current_uid(), 'moderation', null, null,
    case when p_approve then 'Your campaign is live' else 'Your campaign was not approved' end);
  return v_status;
end;
$$;

-- One transaction for the operator's builder: a failed creative, funding
-- check or approval must not leave an unexpected half-created live campaign.
create or replace function public.staff_setup_campaign(
  p_owner_uid text, p_name text, p_pricing bsdc_ad_pricing, p_bid integer,
  p_total_budget integer, p_daily_budget integer, p_starts_at timestamptz,
  p_ends_at timestamptz, p_cities text[], p_topics text[], p_language text,
  p_activate boolean, p_placement bsdc_ad_placement, p_headline text,
  p_body text, p_target_url text, p_image_url text, p_cta_label text
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
  v_id := public.staff_create_campaign(p_owner_uid, p_name, p_pricing, p_bid,
    p_total_budget, p_daily_budget, p_starts_at, p_ends_at, p_cities, p_topics,
    p_language, false);
  if btrim(coalesce(p_headline, '')) <> '' or btrim(coalesce(p_target_url, '')) <> ''
     or coalesce(p_body, '') <> '' or coalesce(p_cta_label, '') <> ''
     or coalesce(p_image_url, '') <> '' then
    perform public.staff_add_creative(v_id, p_placement, p_headline, p_body,
      p_target_url, p_image_url, p_cta_label);
  end if;
  if p_activate then
    perform public.submit_campaign(v_id);
    perform public.decide_campaign(v_id, true, '');
  end if;
  return v_id;
end;
$$;

-- A search must actually narrow the owner picker, including newly issued
-- profiles that have not yet had a campaign or wallet entry.
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
    )
  order by
    -- Whoever is already advertising comes first: that is who an operator is
    -- usually looking for.
    (select max(a.created_at) from public.ad_campaigns a where a.owner_uid = p.uid) desc nulls last,
    p.display_name
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;


-- Fix deterministic, valid handles when two businesses have the same name.
-- The UID is Firebase's UID, the identity used by the member site and by RLS.
create or replace function public.issue_advertiser_account(
  p_uid text,
  p_display_name text,
  p_username text default null,
  p_email text default ''
)
returns table (uid text, username text, created boolean)
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_existing public.profiles%rowtype;
  v_base text;
  v_handle text;
  v_attempt integer;
begin
  perform bsdc.require_permission('ads.manage');
  if btrim(coalesce(p_uid, '')) = '' then
    raise exception 'An advertiser account needs an identifier' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 2 and 60 then
    raise exception 'An advertiser name must be 2 to 60 characters' using errcode = '22023';
  end if;
  select pr.* into v_existing from public.profiles pr where pr.uid = p_uid;
  if found then return query select v_existing.uid, v_existing.username::text, false; return; end if;

  v_handle := btrim(coalesce(p_username, ''));
  if v_handle <> '' then
    if v_handle !~ '^[a-z0-9_]{3,24}$' or v_handle ~ '^_' or v_handle ~ '_$' then
      raise exception 'A handle needs 3 to 24 lower-case letters, digits or underscores' using errcode = '22023';
    end if;
    if exists (select 1 from public.profiles pr where pr.username = v_handle) then
      raise exception 'That handle is already taken' using errcode = '23505';
    end if;
  else
    v_base := trim(both '_' from lower(regexp_replace(btrim(p_display_name), '[^a-zA-Z0-9]+', '_', 'g')));
    if char_length(v_base) < 3 then v_base := 'advertiser'; end if;
    v_base := trim(trailing '_' from left(v_base, 24));
    for v_attempt in 0..99 loop
      if v_attempt = 0 then
        v_handle := v_base;
      else
        v_handle := trim(trailing '_' from left(v_base, 17)) || '_' || substr(md5(p_uid || ':' || v_attempt), 1, 6);
      end if;
      exit when not exists (select 1 from public.profiles pr where pr.username = v_handle);
    end loop;
    if exists (select 1 from public.profiles pr where pr.username = v_handle) then
      raise exception 'Could not find an available handle' using errcode = '23505';
    end if;
  end if;

  insert into public.profiles (uid, username, display_name, role, status, onboarding_complete)
  values (p_uid, v_handle, btrim(p_display_name), 'member', 'active', true);
  perform bsdc.audit('advertiser.issue', p_uid,
    jsonb_build_object('name', btrim(p_display_name), 'username', v_handle, 'email', coalesce(p_email, '')));
  return query select p_uid, v_handle, true;
end;
$$;

-- A newly created SECURITY DEFINER function is executable by PUBLIC unless it
-- is explicitly revoked; anonymous callers must not reach any of these doors.
revoke all on function public.create_campaign(text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz, text[], text[], text) from public, anon;
revoke all on function public.add_creative(uuid, bsdc_ad_placement, text, text, text, text, text) from public, anon;
revoke all on function public.submit_campaign(uuid) from public, anon;
revoke all on function public.decide_campaign(uuid, boolean, text) from public, anon;
revoke all on function public.edit_campaign_creative(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.staff_setup_campaign(text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz, text[], text[], text, boolean, bsdc_ad_placement, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_campaign(text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz, text[], text[], text) to authenticated, service_role;
grant execute on function public.add_creative(uuid, bsdc_ad_placement, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.submit_campaign(uuid) to authenticated, service_role;
grant execute on function public.decide_campaign(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.edit_campaign_creative(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.staff_setup_campaign(text, text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz, text[], text[], text, boolean, bsdc_ad_placement, text, text, text, text, text) to authenticated, service_role;
